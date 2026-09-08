-- Historial, estados terminales y lectura institucional de expedientes.
-- Consolida los cambios todavía no desplegados en una sola migración.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.application_status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  status text not null,
  changed_by uuid references public.profiles(user_id) on delete set null,
  changed_at timestamptz not null default now()
);

create index application_status_history_application_changed_idx
  on public.application_status_history(application_id, changed_at desc);

comment on table public.application_status_history is
  'Registro cronológico inmutable de los estados de una postulación.';

alter table public.application_status_history enable row level security;
revoke all on public.application_status_history from anon, authenticated;
grant select on public.application_status_history to authenticated;

create policy "applicants and OCRI read application status history"
  on public.application_status_history for select to authenticated
  using (
    public.has_role('ADMIN_OCRI')
    or exists (
      select 1 from public.applications application
      where application.id = application_id
        and application.applicant_id = (select auth.uid())
    )
  );

create function private.record_application_status_history()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.application_status_history (application_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function private.record_application_status_history() from public, anon, authenticated;

create trigger applications_record_status_history
  after insert or update of status on public.applications
  for each row execute procedure private.record_application_status_history();

-- Los expedientes previos también deben aparecer desde el primer despliegue.
insert into public.application_status_history (application_id, status, changed_at)
select id, status, coalesce(submitted_at, created_at)
from public.applications;

-- Rechazado por OCRI o no aceptado por destino son resultados definitivos.
create function private.prevent_terminal_application_reopen()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if old.status in ('RECHAZADA', 'NO_ACEPTADO_DESTINO')
    and new.status is distinct from old.status then
    raise exception 'Una postulación rechazada es definitiva y permanece únicamente en el historial.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_terminal_application_reopen() from public, anon, authenticated;

create trigger applications_prevent_terminal_reopen
  before update of status on public.applications
  for each row execute procedure private.prevent_terminal_application_reopen();

-- Carta pendiente es una etapa explícita entre evaluación y aceptación.
alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check check (status in (
  'BORRADOR', 'ENVIADA', 'EN_REVISION_DOCUMENTAL', 'OBSERVADA', 'APROBADA_OCRI',
  'RECHAZADA', 'FINALIZADA', 'NOMINADO_UNSAAC', 'EN_EVALUACION_DESTINO',
  'CARTA_PENDIENTE', 'ACEPTADO', 'NO_ACEPTADO_DESTINO', 'EN_MOVILIDAD', 'CANCELADO'
));

drop policy if exists "upload acceptance files" on storage.objects;
create policy "upload acceptance files" on storage.objects for insert to authenticated with check (
  bucket_id = 'acceptance-letters'
  and exists (
    select 1 from public.applications application
    join public.calls call on call.id = application.call_id
    where application.id::text = split_part(name, '/', 1)
      and (
        public.has_role('ADMIN_OCRI')
        and application.status in ('APROBADA_OCRI', 'NOMINADO_UNSAAC', 'EN_EVALUACION_DESTINO', 'CARTA_PENDIENTE', 'ACEPTADO')
        or application.applicant_id = (select auth.uid())
        and call.direction = 'SALIENTE'
        and application.status in ('NOMINADO_UNSAAC', 'EN_EVALUACION_DESTINO', 'CARTA_PENDIENTE')
      )
  )
);

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
      and application.status in ('APROBADA_OCRI', 'NOMINADO_UNSAAC', 'EN_EVALUACION_DESTINO', 'CARTA_PENDIENTE', 'ACEPTADO')
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
  values(target, path, filename, 'PENDIENTE')
  on conflict(application_id) do update
    set storage_path = excluded.storage_path,
        file_name = excluded.file_name,
        status = 'PENDIENTE',
        comment = '',
        updated_at = now();
end;
$$;

create or replace function public.review_acceptance_letter(target uuid, approved boolean, feedback text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role('ADMIN_OCRI') then
    raise exception 'Solo OCRI puede revisar';
  end if;
  perform 1 from public.applications
  where id = target
    and status in ('APROBADA_OCRI', 'NOMINADO_UNSAAC', 'EN_EVALUACION_DESTINO', 'CARTA_PENDIENTE', 'ACEPTADO')
  for update;
  if not found then raise exception 'Etapa no válida'; end if;
  update public.acceptance_letters
  set status = case when approved then 'VALIDADA' else 'OBSERVADA' end,
      comment = coalesce(feedback, ''),
      updated_at = now()
  where application_id = target;
  if not found then raise exception 'Primero adjunte una carta'; end if;
  if approved then update public.applications set status = 'ACEPTADO' where id = target; end if;
end;
$$;
revoke all on function public.save_acceptance_letter(uuid, text, text) from public, anon;
revoke all on function public.review_acceptance_letter(uuid, boolean, text) from public, anon;
grant execute on function public.save_acceptance_letter(uuid, text, text) to authenticated;
grant execute on function public.review_acceptance_letter(uuid, boolean, text) to authenticated;

-- Función privada para políticas del gestor/profesor externo. Verifica siempre
-- la identidad autenticada y solo permite expedientes entrantes afiliados.
create function private.external_manager_can_read_application(target_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select auth.uid() is not null
    and public.has_role('GESTOR_EXTERNO')
    and exists (
      select 1
      from public.applications application
      join public.profiles manager on manager.user_id = auth.uid()
      join public.profiles applicant on applicant.user_id = application.applicant_id
      join public.calls call on call.id = application.call_id
      where application.id = target_application_id
        and manager.university_id = applicant.university_id
        and call.direction = 'ENTRANTE'
    );
$$;
revoke all on function private.external_manager_can_read_application(uuid) from public, anon;
grant execute on function private.external_manager_can_read_application(uuid) to authenticated;

create policy "external managers read affiliated incoming applications"
  on public.applications for select to authenticated
  using (private.external_manager_can_read_application(id));

create policy "external managers read affiliated incoming documents"
  on public.application_documents for select to authenticated
  using (private.external_manager_can_read_application(application_id));

create policy "external managers read affiliated application history"
  on public.application_status_history for select to authenticated
  using (private.external_manager_can_read_application(application_id));

create policy "external managers read affiliated applicant profiles"
  on public.profiles for select to authenticated
  using (
    exists (
      select 1 from public.applications application
      where application.applicant_id = profiles.user_id
        and private.external_manager_can_read_application(application.id)
    )
  );

create policy "OCRI reads applicant profile photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'profile-photos' and public.has_role('ADMIN_OCRI'));

create policy "external managers read affiliated applicant photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and exists (
      select 1 from public.profiles applicant
      join public.applications application on application.applicant_id = applicant.user_id
      where applicant.photo_path = storage.objects.name
        and private.external_manager_can_read_application(application.id)
    )
  );

create policy "external managers read affiliated application files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    and private.external_manager_can_read_application((storage.foldername(name))[2]::uuid)
  );

create policy "external managers read affiliated acceptance letters"
  on public.acceptance_letters for select to authenticated
  using (private.external_manager_can_read_application(application_id));

create policy "external managers read affiliated acceptance files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'acceptance-letters'
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and private.external_manager_can_read_application(split_part(name, '/', 1)::uuid)
  );
