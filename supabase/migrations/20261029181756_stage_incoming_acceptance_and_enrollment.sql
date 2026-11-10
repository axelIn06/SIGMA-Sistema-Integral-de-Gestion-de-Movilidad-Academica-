-- SGME: la carta formaliza la aceptación; la resolución y el código habilitan
-- la matrícula. El inicio y cierre de la movilidad continúan a cargo de OCRI.
alter table public.applications drop constraint applications_status_check;
alter table public.applications add constraint applications_status_check check (status in (
  'BORRADOR', 'ENVIADA', 'EN_REVISION_DOCUMENTAL', 'OBSERVADA', 'APROBADA_OCRI',
  'ADMITIDO_UNSAAC', 'MATRICULA_HABILITADA', 'RECHAZADA', 'FINALIZADA',
  'NOMINADO_UNSAAC', 'EN_EVALUACION_DESTINO', 'CARTA_PENDIENTE', 'ACEPTADO',
  'NO_ACEPTADO_DESTINO', 'EN_MOVILIDAD', 'DOCUMENTACION_RETORNO', 'CANCELADO'
));

create or replace function private.enforce_incoming_application_flow()
returns trigger language plpgsql security definer set search_path = '' as $$
declare direction_value text;
begin
  select direction into direction_value from public.calls where id = new.call_id;
  if direction_value <> 'ENTRANTE' then
    if new.status = 'MATRICULA_HABILITADA' then
      raise exception 'Esta etapa corresponde solo a SGME.' using errcode = '22023';
    end if;
    return new;
  end if;
  if new.status is not distinct from old.status then return new; end if;
  if old.status in ('RECHAZADA', 'FINALIZADA', 'CANCELADO') then
    raise exception 'El resultado es definitivo y no admite reapertura.' using errcode = '22023';
  end if;
  if not (
    (old.status = 'BORRADOR' and new.status = 'ENVIADA')
    or (old.status in ('ENVIADA', 'OBSERVADA') and new.status in ('OBSERVADA', 'ENVIADA', 'RECHAZADA', 'ADMITIDO_UNSAAC'))
    or (old.status = 'ADMITIDO_UNSAAC' and new.status in ('MATRICULA_HABILITADA', 'CANCELADO'))
    or (old.status = 'MATRICULA_HABILITADA' and new.status in ('EN_MOVILIDAD', 'CANCELADO'))
    or (old.status = 'EN_MOVILIDAD' and new.status in ('FINALIZADA', 'CANCELADO'))
    or (new.status = 'CANCELADO' and old.status in ('BORRADOR', 'ENVIADA', 'OBSERVADA'))
  ) then
    raise exception 'Ese cambio no corresponde al flujo de movilidad entrante.' using errcode = '22023';
  end if;
  if new.status in ('ADMITIDO_UNSAAC', 'MATRICULA_HABILITADA', 'EN_MOVILIDAD') then
    if not exists (
      select 1 from public.acceptance_letters letter
      join storage.objects object on object.bucket_id = 'acceptance-letters' and object.name = letter.storage_path
      where letter.application_id = new.id and letter.status = 'VALIDADA'
    ) then
      raise exception 'Adjunta la carta oficial de aceptación antes de continuar.' using errcode = '22023';
    end if;
  end if;
  if new.status in ('MATRICULA_HABILITADA', 'EN_MOVILIDAD') and (
    nullif(btrim(new.student_code), '') is null or not exists (
      select 1 from public.incoming_official_documents document
      join storage.objects object on object.bucket_id = 'incoming-official-documents' and object.name = document.storage_path
      where document.application_id = new.id and document.document_type = 'RESOLUCION_MATRICULA'
    )
  ) then
    raise exception 'Adjunta la resolución y registra el código UNSAAC asignado.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_incoming_application_flow() from public, anon, authenticated;

-- Nuevas rutas únicas; el nombre aleatorio permite reemplazar sin sobrescribir.
drop policy "upload acceptance files" on storage.objects;
create policy "upload acceptance files" on storage.objects for insert to authenticated with check (
  bucket_id = 'acceptance-letters' and exists (
    select 1 from public.applications application join public.calls call on call.id = application.call_id
    where application.id::text = split_part(name, '/', 1) and (
      (call.direction = 'SALIENTE' and (
        (public.has_role('ADMIN_OCRI') and application.status in ('APROBADA_OCRI', 'NOMINADO_UNSAAC', 'EN_EVALUACION_DESTINO', 'CARTA_PENDIENTE', 'ACEPTADO'))
        or (application.applicant_id = (select auth.uid()) and application.status in ('NOMINADO_UNSAAC', 'EN_EVALUACION_DESTINO', 'CARTA_PENDIENTE'))
      ))
      or (call.direction = 'ENTRANTE' and public.has_role('ADMIN_OCRI') and application.status in ('ENVIADA', 'OBSERVADA', 'ADMITIDO_UNSAAC'))
    )
  )
);
drop policy "OCRI uploads incoming official documents" on storage.objects;
create policy "OCRI uploads incoming official documents" on storage.objects for insert to authenticated with check (
  bucket_id = 'incoming-official-documents' and public.has_role('ADMIN_OCRI') and exists (
    select 1 from public.applications application join public.calls call on call.id = application.call_id
    where application.id::text = split_part(name, '/', 1) and call.direction = 'ENTRANTE' and (
      (split_part(name, '/', 2) = 'CARTA_NO_APTO' and application.status = 'RECHAZADA')
      or (split_part(name, '/', 2) = 'GUIA_SUBSANACION' and application.status = 'OBSERVADA')
      or (split_part(name, '/', 2) = 'RESOLUCION_MATRICULA' and application.status in ('ADMITIDO_UNSAAC', 'MATRICULA_HABILITADA'))
    )
  )
);

create function private.save_incoming_stage_document(
  target uuid, kind text, path text, filename text, enrollment_code text, note text
) returns void language plpgsql security definer set search_path = '' as $$
declare current_status text; direction_value text; bucket text;
begin
  if auth.uid() is null or not public.has_role('ADMIN_OCRI') then
    raise exception 'Solo OCRI puede adjuntar documentos oficiales.' using errcode = '42501';
  end if;
  select application.status, call.direction into current_status, direction_value
  from public.applications application join public.calls call on call.id = application.call_id
  where application.id = target for update of application;
  if not found or direction_value <> 'ENTRANTE' then
    raise exception 'No se encontró el expediente SGME.' using errcode = 'P0002';
  end if;
  if not (
    (kind = 'ACEPTACION_UNSAAC' and current_status in ('ENVIADA', 'OBSERVADA', 'ADMITIDO_UNSAAC'))
    or (kind = 'RESOLUCION_MATRICULA' and current_status in ('ADMITIDO_UNSAAC', 'MATRICULA_HABILITADA'))
    or (kind = 'CARTA_NO_APTO' and current_status = 'RECHAZADA')
    or (kind = 'GUIA_SUBSANACION' and current_status = 'OBSERVADA')
  ) then
    raise exception 'El documento no corresponde a la etapa actual.' using errcode = '22023';
  end if;
  if kind = 'RESOLUCION_MATRICULA' and (nullif(btrim(enrollment_code), '') is null or length(btrim(enrollment_code)) > 100) then
    raise exception 'Registra el código UNSAAC asignado al estudiante (máximo 100 caracteres).' using errcode = '22023';
  end if;
  bucket := case when kind = 'ACEPTACION_UNSAAC' then 'acceptance-letters' else 'incoming-official-documents' end;
  if path is null or split_part(path, '/', 1) <> target::text
    or (kind <> 'ACEPTACION_UNSAAC' and split_part(path, '/', 2) <> kind)
    or not exists (select 1 from storage.objects object where object.bucket_id = bucket and object.name = path)
    or nullif(btrim(filename), '') is null then
    raise exception 'No se encontró el PDF adjunto a este expediente.' using errcode = 'P0002';
  end if;
  if kind = 'ACEPTACION_UNSAAC' then
    insert into public.acceptance_letters(application_id, storage_path, file_name, status, comment)
    values (target, path, filename, 'VALIDADA', coalesce(btrim(note), ''))
    on conflict (application_id) do update set storage_path = excluded.storage_path,
      file_name = excluded.file_name, status = 'VALIDADA', comment = excluded.comment, updated_at = now();
    update public.applications set status = 'ADMITIDO_UNSAAC', status_note = coalesce(btrim(note), '') where id = target;
  else
    insert into public.incoming_official_documents(application_id, document_type, storage_path, file_name, uploaded_by)
    values (target, kind, path, filename, auth.uid())
    on conflict (application_id, document_type) do update set storage_path = excluded.storage_path,
      file_name = excluded.file_name, uploaded_by = excluded.uploaded_by, uploaded_at = now();
    if kind = 'RESOLUCION_MATRICULA' then
      update public.applications set student_code = btrim(enrollment_code),
        status = 'MATRICULA_HABILITADA', status_note = coalesce(btrim(note), '') where id = target;
    end if;
  end if;
end;
$$;
revoke all on function private.save_incoming_stage_document(uuid,text,text,text,text,text) from public, anon;
grant execute on function private.save_incoming_stage_document(uuid,text,text,text,text,text) to authenticated;

create function public.admin_save_incoming_document(
  target uuid, kind text, path text, filename text, enrollment_code text default null, note text default ''
) returns void language sql security invoker set search_path = '' as $$
  select private.save_incoming_stage_document(target, kind, path, filename, enrollment_code, note);
$$;
revoke all on function public.admin_save_incoming_document(uuid,text,text,text,text,text) from public, anon;
grant execute on function public.admin_save_incoming_document(uuid,text,text,text,text,text) to authenticated;

-- Compatibilidad con clientes anteriores: siguen sujetos a las nuevas reglas.
create or replace function public.save_incoming_acceptance_letter(target uuid, path text, filename text)
returns void language sql security invoker set search_path = '' as $$
  select private.save_incoming_stage_document(target, 'ACEPTACION_UNSAAC', path, filename, null, '');
$$;
create or replace function public.save_incoming_official_document(target uuid, kind text, path text, filename text)
returns void language sql security invoker set search_path = '' as $$
  select private.save_incoming_stage_document(target, kind, path, filename, null, '');
$$;
revoke all on function public.save_incoming_acceptance_letter(uuid,text,text) from public, anon;
revoke all on function public.save_incoming_official_document(uuid,text,text,text) from public, anon;
grant execute on function public.save_incoming_acceptance_letter(uuid,text,text) to authenticated;
grant execute on function public.save_incoming_official_document(uuid,text,text,text) to authenticated;

notify pgrst, 'reload schema';
