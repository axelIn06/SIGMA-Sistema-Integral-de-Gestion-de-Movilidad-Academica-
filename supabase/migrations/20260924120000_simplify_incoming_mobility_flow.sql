-- Simplifica SGME para que las nominaciones entrantes recorran solo los hitos
-- que requieren seguimiento en SIGMA y puedan conservar documentos oficiales.

-- En una postulación entrante el estudiante no tiene código UNSAAC.
create or replace function public.external_student_save_incoming_draft(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_application uuid := nullif(payload ->> 'applicationId', '')::uuid;
  faculty_code_value text := nullif(trim(payload ->> 'facultyCode'), '');
  school_code_value text := nullif(trim(payload ->> 'schoolCode'), '');
  faculty_name_value text;
  school_name_value text;
begin
  if not public.has_role('ESTUDIANTE_EXTERNO') then
    raise exception 'Solo el estudiante externo nominado puede completar este expediente.'
      using errcode = '42501';
  end if;
  if faculty_code_value is null or school_code_value is null then
    raise exception 'Selecciona la facultad y carrera profesional UNSAAC.' using errcode = '22023';
  end if;

  select faculty.name into faculty_name_value
  from public.unsaac_faculties faculty
  where faculty.code = faculty_code_value and faculty.is_active;

  select school.name into school_name_value
  from public.unsaac_professional_schools school
  where school.code = school_code_value
    and school.faculty_code = faculty_code_value
    and school.is_active;

  if faculty_name_value is null or school_name_value is null then
    raise exception 'La carrera seleccionada no pertenece a la facultad UNSAAC indicada.'
      using errcode = '22023';
  end if;

  update public.applications application
  set student_code = null,
      faculty = faculty_name_value,
      academic_program = school_name_value
  where application.id = target_application
    and application.applicant_id = (select auth.uid())
    and application.status in ('BORRADOR', 'OBSERVADA')
    and exists (
      select 1
      from public.incoming_nominations nomination
      join public.calls call on call.id = nomination.call_id
      where nomination.application_id = application.id
        and nomination.applicant_id = (select auth.uid())
        and call.direction = 'ENTRANTE'
        and call.status = 'ACTIVA'
    );

  if not found then
    raise exception 'No se encontró una nominación entrante editable.' using errcode = 'P0002';
  end if;
  return target_application;
end;
$$;
grant execute on function public.external_student_save_incoming_draft(jsonb) to authenticated;

-- Autoriza omitir código solo al postulante externo ya nominado; las demás
-- validaciones de facultad, foto y documentos se mantienen.
create or replace function public.validate_application_submission()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  direction_value text;
begin
  if new.status = 'ENVIADA' and old.status in ('BORRADOR', 'OBSERVADA') then
    select direction into direction_value from public.calls where id = new.call_id;

    if coalesce(trim(new.faculty), '') = '' or coalesce(trim(new.academic_program), '') = '' then
      raise exception 'Completa tu facultad y carrera profesional antes de enviar.'
        using errcode = '22023';
    end if;
    if not exists (
      select 1
      from public.unsaac_professional_schools school
      join public.unsaac_faculties faculty on faculty.code = school.faculty_code
      where faculty.name = new.faculty and school.name = new.academic_program
        and faculty.is_active and school.is_active
    ) then
      raise exception 'La facultad y la carrera profesional UNSAAC seleccionadas no son válidas.'
        using errcode = '22023';
    end if;

    if direction_value = 'SALIENTE' then
      if coalesce(trim(new.student_code), '') = ''
        or new.student_code <> split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 1) then
        raise exception 'El código de estudiante no coincide con el correo autenticado.'
          using errcode = '22023';
      end if;
    elsif direction_value = 'ENTRANTE' then
      if not public.has_role('ESTUDIANTE_EXTERNO')
        or not exists (
          select 1 from public.incoming_nominations nomination
          where nomination.application_id = new.id
            and nomination.applicant_id = (select auth.uid())
        ) then
        raise exception 'Este expediente entrante no proviene de una nominación válida.'
          using errcode = '42501';
      end if;
      new.student_code := null;
    else
      raise exception 'La convocatoria no tiene un flujo válido.' using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.profiles profile
      where profile.user_id = new.applicant_id and profile.photo_path is not null
    ) then
      raise exception 'La foto de perfil es obligatoria antes de enviar.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.application_documents document
      where document.application_id = new.id and document.is_required
        and (document.storage_path is null or not exists (
          select 1 from storage.objects object
          where object.bucket_id = 'application-documents'
            and object.name = document.storage_path
        ))
    ) then
      raise exception 'Aún faltan documentos obligatorios.' using errcode = '22023';
    end if;
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

-- La resubmisión de una observación vuelve directamente al estado Postulado.
create or replace function public.student_resubmit_observed_application(target_application_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.applications
  set status = 'ENVIADA', status_note = ''
  where id = target_application_id
    and applicant_id = (select auth.uid())
    and status = 'OBSERVADA';
  if not found then
    raise exception 'No se encontró una subsanación pendiente.' using errcode = 'P0002';
  end if;
end;
$$;
grant execute on function public.student_resubmit_observed_application(uuid) to authenticated;

-- Historial SGME ya creado: reemplaza estados redundantes por sus hitos visibles.
update public.applications application
set status = case application.status
      when 'EN_REVISION_DOCUMENTAL' then 'ENVIADA'
      when 'APROBADA_OCRI' then 'ADMITIDO_UNSAAC'
      when 'CARTA_PENDIENTE' then 'ADMITIDO_UNSAAC'
      when 'ACEPTADO' then 'ADMITIDO_UNSAAC'
      else application.status
    end
from public.calls call
where call.id = application.call_id
  and call.direction = 'ENTRANTE'
  and application.status in ('EN_REVISION_DOCUMENTAL', 'APROBADA_OCRI', 'CARTA_PENDIENTE', 'ACEPTADO');

create or replace function private.enforce_incoming_application_flow()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  direction_value text;
begin
  select direction into direction_value from public.calls where id = new.call_id;
  if direction_value <> 'ENTRANTE' or new.status is not distinct from old.status then
    return new;
  end if;

  if old.status in ('RECHAZADA', 'FINALIZADA', 'CANCELADO') then
    raise exception 'El resultado es definitivo y no admite reapertura.' using errcode = '22023';
  end if;

  if not (
    (old.status = 'BORRADOR' and new.status = 'ENVIADA')
    or (old.status = 'ENVIADA' and new.status in ('OBSERVADA', 'RECHAZADA', 'ADMITIDO_UNSAAC'))
    or (old.status = 'OBSERVADA' and new.status in ('ENVIADA', 'RECHAZADA', 'ADMITIDO_UNSAAC'))
    or (old.status = 'ADMITIDO_UNSAAC' and new.status in ('EN_MOVILIDAD', 'CANCELADO'))
    or (old.status = 'EN_MOVILIDAD' and new.status in ('FINALIZADA', 'CANCELADO'))
    or (new.status = 'CANCELADO' and old.status in ('BORRADOR', 'ENVIADA', 'OBSERVADA'))
  ) then
    raise exception 'Ese cambio no corresponde al flujo de movilidad entrante.' using errcode = '22023';
  end if;

  if new.status = 'EN_MOVILIDAD' and (
    not exists (
      select 1 from public.acceptance_letters letter
      where letter.application_id = new.id
    )
    or not exists (
      select 1 from public.incoming_official_documents document
      where document.application_id = new.id
        and document.document_type = 'RESOLUCION_MATRICULA'
    )
  ) then
    raise exception 'Adjunta la carta de aceptación y la resolución de matrícula antes de iniciar la movilidad.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_incoming_application_flow() from public, anon, authenticated;
create trigger applications_enforce_incoming_flow
  before update of status on public.applications
  for each row execute procedure private.enforce_incoming_application_flow();

create table public.incoming_official_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  document_type text not null check (document_type in ('CARTA_NO_APTO', 'RESOLUCION_MATRICULA', 'GUIA_SUBSANACION')),
  storage_path text not null,
  file_name text not null,
  uploaded_by uuid references public.profiles(user_id) on delete set null,
  uploaded_at timestamptz not null default now(),
  unique (application_id, document_type)
);
alter table public.incoming_official_documents enable row level security;
revoke all on public.incoming_official_documents from anon, authenticated;
grant select on public.incoming_official_documents to authenticated;
create policy "incoming applicants and OCRI read official documents"
  on public.incoming_official_documents for select to authenticated
  using (
    public.has_role('ADMIN_OCRI')
    or exists (
      select 1 from public.applications application
      where application.id = application_id
        and application.applicant_id = (select auth.uid())
    )
    or private.external_manager_can_read_application(application_id)
  );

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('incoming-official-documents', 'incoming-official-documents', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "read incoming official documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'incoming-official-documents'
    and exists (
      select 1 from public.incoming_official_documents document
      where document.storage_path = storage.objects.name
        and (
          public.has_role('ADMIN_OCRI')
          or exists (select 1 from public.applications application
            where application.id = document.application_id and application.applicant_id = (select auth.uid()))
          or private.external_manager_can_read_application(document.application_id)
        )
    )
  );
create policy "OCRI uploads incoming official documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'incoming-official-documents'
    and public.has_role('ADMIN_OCRI')
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and exists (
      select 1 from public.applications application
      join public.calls call on call.id = application.call_id
      where application.id::text = split_part(name, '/', 1)
        and call.direction = 'ENTRANTE'
        and ((split_part(name, '/', 2) = 'CARTA_NO_APTO' and application.status = 'RECHAZADA')
          or (split_part(name, '/', 2) = 'RESOLUCION_MATRICULA' and application.status = 'ADMITIDO_UNSAAC')
          or (split_part(name, '/', 2) = 'GUIA_SUBSANACION' and application.status = 'OBSERVADA'))
    )
  );

create function public.save_incoming_official_document(
  target uuid, kind text, path text, filename text
) returns void
language plpgsql security definer set search_path = public
as $$
declare current_status text; direction_value text;
begin
  if auth.uid() is null or not public.has_role('ADMIN_OCRI') then
    raise exception 'Solo OCRI puede adjuntar documentos oficiales.' using errcode = '42501';
  end if;
  select application.status, call.direction into current_status, direction_value
  from public.applications application join public.calls call on call.id = application.call_id
  where application.id = target for update of application;
  if direction_value <> 'ENTRANTE'
    or not ((kind = 'CARTA_NO_APTO' and current_status = 'RECHAZADA')
      or (kind = 'RESOLUCION_MATRICULA' and current_status = 'ADMITIDO_UNSAAC')
      or (kind = 'GUIA_SUBSANACION' and current_status = 'OBSERVADA')) then
    raise exception 'El documento no corresponde a la etapa actual.' using errcode = '22023';
  end if;
  if split_part(path, '/', 1) <> target::text
    or split_part(path, '/', 2) <> kind
    or not exists (select 1 from storage.objects where bucket_id = 'incoming-official-documents' and name = path) then
    raise exception 'No se encontró el PDF adjunto.' using errcode = 'P0002';
  end if;
  insert into public.incoming_official_documents(application_id, document_type, storage_path, file_name, uploaded_by)
  values (target, kind, path, filename, auth.uid())
  on conflict (application_id, document_type) do update
    set storage_path = excluded.storage_path, file_name = excluded.file_name,
        uploaded_by = excluded.uploaded_by, uploaded_at = now();
end;
$$;
revoke all on function public.save_incoming_official_document(uuid, text, text, text) from public, anon;
grant execute on function public.save_incoming_official_document(uuid, text, text, text) to authenticated;

-- OCRI emite la aceptación en SGME. Se reutiliza la tabla de cartas, pero el
-- documento emitido queda marcado como validado automáticamente.
drop policy if exists "upload acceptance files" on storage.objects;
create policy "upload acceptance files" on storage.objects for insert to authenticated with check (
  bucket_id = 'acceptance-letters'
  and exists (
    select 1 from public.applications application
    join public.calls call on call.id = application.call_id
    where application.id::text = split_part(name, '/', 1)
      and ((public.has_role('ADMIN_OCRI') and (
          application.status in ('APROBADA_OCRI', 'NOMINADO_UNSAAC', 'EN_EVALUACION_DESTINO', 'CARTA_PENDIENTE', 'ACEPTADO')
          or call.direction = 'ENTRANTE' and application.status = 'ADMITIDO_UNSAAC'))
        or application.applicant_id = (select auth.uid()) and call.direction = 'SALIENTE'
          and application.status in ('NOMINADO_UNSAAC', 'EN_EVALUACION_DESTINO', 'CARTA_PENDIENTE'))
  )
);

create function public.save_incoming_acceptance_letter(target uuid, path text, filename text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role('ADMIN_OCRI')
    or not exists (select 1 from public.applications application
      join public.calls call on call.id = application.call_id
      where application.id = target and call.direction = 'ENTRANTE'
        and application.status = 'ADMITIDO_UNSAAC') then
    raise exception 'La carta oficial solo puede adjuntarse al aceptar una postulación SGME.' using errcode = '42501';
  end if;
  if split_part(path, '/', 1) <> target::text
    or not exists (select 1 from storage.objects where bucket_id = 'acceptance-letters' and name = path) then
    raise exception 'No se encontró la carta PDF.' using errcode = 'P0002';
  end if;
  insert into public.acceptance_letters(application_id, storage_path, file_name, status, comment)
  values(target, path, filename, 'VALIDADA', 'Carta oficial emitida por OCRI.')
  on conflict(application_id) do update set storage_path = excluded.storage_path,
    file_name = excluded.file_name, status = 'VALIDADA', comment = excluded.comment, updated_at = now();
end;
$$;
revoke all on function public.save_incoming_acceptance_letter(uuid, text, text) from public, anon;
grant execute on function public.save_incoming_acceptance_letter(uuid, text, text) to authenticated;
