-- Flujo saliente legible: OCRI revisa, nomina y acompaña el retorno sin
-- convertir cada acción en un estado o botón independiente.

alter table public.applications
  add column status_note text not null default '';

alter table public.application_status_history
  add column note text not null default '';

create or replace function private.record_application_status_history()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.application_status_history (application_id, status, note, changed_by)
    values (new.id, new.status, coalesce(new.status_note, ''), auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function private.record_application_status_history() from public, anon, authenticated;

alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check check (status in (
  'BORRADOR', 'ENVIADA', 'EN_REVISION_DOCUMENTAL', 'OBSERVADA', 'APROBADA_OCRI',
  'RECHAZADA', 'FINALIZADA', 'NOMINADO_UNSAAC', 'EN_EVALUACION_DESTINO',
  'CARTA_PENDIENTE', 'ACEPTADO', 'NO_ACEPTADO_DESTINO', 'EN_MOVILIDAD',
  'DOCUMENTACION_RETORNO', 'CANCELADO'
));

-- Al recibir la carta oficial, el resultado ya es aceptado. OCRI conserva la
-- facultad de registrar que la universidad de destino no aceptó el expediente.
create or replace function public.save_acceptance_letter(target uuid, path text, filename text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  application public.applications;
  direction_value text;
begin
  select * into application from public.applications where id = target for update;
  select direction into direction_value from public.calls where id = application.call_id;
  if auth.uid() is null or not coalesce((
    public.has_role('ADMIN_OCRI')
      and application.status in ('NOMINADO_UNSAAC', 'EN_EVALUACION_DESTINO', 'CARTA_PENDIENTE', 'ACEPTADO')
    or application.applicant_id = auth.uid()
      and direction_value = 'SALIENTE'
      and application.status in ('NOMINADO_UNSAAC', 'EN_EVALUACION_DESTINO', 'CARTA_PENDIENTE')
  ), false) then
    raise exception 'No autorizado para adjuntar la carta en esta etapa';
  end if;
  if split_part(path, '/', 1) <> target::text
    or not exists (select 1 from storage.objects where bucket_id = 'acceptance-letters' and name = path) then
    raise exception 'Archivo no encontrado';
  end if;
  insert into public.acceptance_letters(application_id, storage_path, file_name, status)
  values(target, path, filename, 'VALIDADA')
  on conflict(application_id) do update
    set storage_path = excluded.storage_path,
        file_name = excluded.file_name,
        status = 'VALIDADA',
        comment = '',
        updated_at = now();
  if direction_value = 'SALIENTE' and application.status <> 'ACEPTADO' then
    update public.applications
    set status = 'ACEPTADO',
        status_note = 'Carta de aceptación cargada por el estudiante.'
    where id = target;
  end if;
end;
$$;
revoke all on function public.save_acceptance_letter(uuid, text, text) from public, anon;
grant execute on function public.save_acceptance_letter(uuid, text, text) to authenticated;

-- Permite que el estudiante subsane archivos observados y los devuelva a OCRI.
drop policy if exists "applicants update documents in their drafts" on public.application_documents;
create policy "applicants update draft or observed application documents"
  on public.application_documents for update to authenticated
  using (exists (
    select 1 from public.applications application
    where application.id = application_id
      and application.applicant_id = (select auth.uid())
      and application.status in ('BORRADOR', 'OBSERVADA')
  ))
  with check (exists (
    select 1 from public.applications application
    where application.id = application_id
      and application.applicant_id = (select auth.uid())
      and application.status in ('BORRADOR', 'OBSERVADA')
  ));

drop policy if exists "applicants update their private application files" on storage.objects;
create policy "applicants update draft or observed application files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.applications application
      where application.id::text = (storage.foldername(name))[2]
        and application.applicant_id = (select auth.uid())
        and application.status in ('BORRADOR', 'OBSERVADA')
    )
  )
  with check (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.applications application
      where application.id::text = (storage.foldername(name))[2]
        and application.applicant_id = (select auth.uid())
        and application.status in ('BORRADOR', 'OBSERVADA')
    )
  );

drop policy if exists "applicants upload private application files" on storage.objects;
create policy "applicants upload draft or observed application files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.applications application
      where application.id::text = (storage.foldername(name))[2]
        and application.applicant_id = (select auth.uid())
        and application.status in ('BORRADOR', 'OBSERVADA')
    )
  );

create or replace function public.student_resubmit_observed_application(target_application_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.applications
  set status = 'EN_REVISION_DOCUMENTAL',
      status_note = 'El estudiante presentó la subsanación solicitada.'
  where id = target_application_id
    and applicant_id = (select auth.uid())
    and status = 'OBSERVADA';
  if not found then
    raise exception 'No se encontró una subsanación pendiente.' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.student_resubmit_observed_application(uuid) from public, anon;
grant execute on function public.student_resubmit_observed_application(uuid) to authenticated;

-- Dos documentos del retorno son obligatorios para cerrar una movilidad.
create table public.mobility_return_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  document_type text not null check (document_type in ('CONVALIDACION_CURSOS', 'CERTIFICADO_ESTUDIOS')),
  storage_path text not null,
  file_name text not null,
  status text not null default 'PENDIENTE' check (status in ('PENDIENTE', 'OBSERVADA', 'VALIDADA')),
  reviewer_comment text not null default '',
  validated_credits numeric(5,2),
  updated_at timestamptz not null default now(),
  unique(application_id, document_type),
  check (validated_credits is null or (document_type = 'CONVALIDACION_CURSOS' and validated_credits >= 0))
);
create index mobility_return_documents_application_idx
  on public.mobility_return_documents(application_id);
alter table public.mobility_return_documents enable row level security;
revoke all on public.mobility_return_documents from anon, authenticated;
grant select on public.mobility_return_documents to authenticated;
create policy "students and OCRI read return documents"
  on public.mobility_return_documents for select to authenticated
  using (public.has_role('ADMIN_OCRI') or exists (
    select 1 from public.applications application
    where application.id = application_id and application.applicant_id = (select auth.uid())
  ));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('mobility-return-documents', 'mobility-return-documents', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "students and OCRI read return files" on storage.objects for select to authenticated
using (bucket_id = 'mobility-return-documents' and exists (
  select 1 from public.applications application
  where application.id::text = split_part(name, '/', 1)
    and (application.applicant_id = (select auth.uid()) or public.has_role('ADMIN_OCRI'))
));
create policy "students upload return files" on storage.objects for insert to authenticated
with check (bucket_id = 'mobility-return-documents' and exists (
  select 1 from public.applications application
  join public.calls call on call.id = application.call_id
  where application.id::text = split_part(name, '/', 1)
    and application.applicant_id = (select auth.uid())
    and call.direction = 'SALIENTE'
    and application.status = 'DOCUMENTACION_RETORNO'
));

create function public.save_mobility_return_document(target uuid, kind text, path text, filename text)
returns void language plpgsql security definer set search_path = public as $$
declare application public.applications;
begin
  select * into application from public.applications where id = target for update;
  if auth.uid() is null or application.applicant_id <> auth.uid() or application.status <> 'DOCUMENTACION_RETORNO' then
    raise exception 'Solo el estudiante puede adjuntar documentos durante el cierre de su movilidad.';
  end if;
  if kind not in ('CONVALIDACION_CURSOS', 'CERTIFICADO_ESTUDIOS') then raise exception 'Tipo de documento no válido.'; end if;
  if split_part(path, '/', 1) <> target::text
    or not exists (select 1 from storage.objects where bucket_id = 'mobility-return-documents' and name = path) then
    raise exception 'Archivo no encontrado.';
  end if;
  insert into public.mobility_return_documents(application_id, document_type, storage_path, file_name)
  values(target, kind, path, filename)
  on conflict(application_id, document_type) do update
    set storage_path = excluded.storage_path, file_name = excluded.file_name, status = 'PENDIENTE',
        reviewer_comment = '', validated_credits = null, updated_at = now();
end;
$$;

create function public.review_mobility_return_document(target uuid, kind text, approved boolean, feedback text default '', credits numeric default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_role('ADMIN_OCRI') then raise exception 'Solo OCRI puede revisar.'; end if;
  update public.mobility_return_documents
  set status = case when approved then 'VALIDADA' else 'OBSERVADA' end,
      reviewer_comment = coalesce(feedback, ''),
      validated_credits = case when kind = 'CONVALIDACION_CURSOS' and approved then credits else validated_credits end,
      updated_at = now()
  where application_id = target and document_type = kind;
  if not found then raise exception 'Primero adjunte el documento.'; end if;
end;
$$;

create function public.conclude_mobility_application(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_role('ADMIN_OCRI') then raise exception 'Solo OCRI puede concluir el expediente.'; end if;
  if not exists (
    select 1 from public.applications application
    where application.id = target and application.status = 'DOCUMENTACION_RETORNO'
  ) then raise exception 'El expediente no está en etapa de documentación de retorno.'; end if;
  if not exists (select 1 from public.mobility_return_documents where application_id = target and document_type = 'CERTIFICADO_ESTUDIOS' and status = 'VALIDADA')
    or not exists (select 1 from public.mobility_return_documents where application_id = target and document_type = 'CONVALIDACION_CURSOS' and status = 'VALIDADA' and validated_credits >= 12) then
    raise exception 'Se requiere certificado validado y al menos 12 créditos convalidados para concluir.' using errcode = '23514';
  end if;
  update public.applications set status = 'FINALIZADA', status_note = 'OCRI verificó los documentos de retorno y la convalidación mínima de 12 créditos.' where id = target;
end;
$$;
revoke all on function public.save_mobility_return_document(uuid, text, text, text) from public, anon;
revoke all on function public.review_mobility_return_document(uuid, text, boolean, text, numeric) from public, anon;
revoke all on function public.conclude_mobility_application(uuid) from public, anon;
grant execute on function public.save_mobility_return_document(uuid, text, text, text) to authenticated;
grant execute on function public.review_mobility_return_document(uuid, text, boolean, text, numeric) to authenticated;
grant execute on function public.conclude_mobility_application(uuid) to authenticated;
