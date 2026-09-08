-- Historial inmutable de cada cambio de estado de un expediente.
-- Se crea desde un trigger para que no dependa de que una pantalla recuerde registrarlo.
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
  'Registro cronológico generado automáticamente cuando cambia el estado de una postulación.';

alter table public.application_status_history enable row level security;

create policy "applicants and OCRI read application status history"
  on public.application_status_history for select to authenticated
  using (
    public.has_role('ADMIN_OCRI')
    or exists (
      select 1
      from public.applications a
      where a.id = application_id
        and a.applicant_id = (select auth.uid())
    )
  );

-- El trigger se ejecuta con privilegios controlados; ningún cliente inserta
-- ni altera el historial directamente.
create function public.record_application_status_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_status_history (application_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.application_status_history (application_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger applications_record_status_history
  after insert or update of status on public.applications
  for each row execute procedure public.record_application_status_history();

-- Los expedientes existentes reciben un punto inicial para que su seguimiento
-- no aparezca vacío al habilitar la funcionalidad.
insert into public.application_status_history (application_id, status, changed_at)
select id, status, coalesce(submitted_at, created_at)
from public.applications;

revoke all on public.application_status_history from anon, authenticated;
grant select on public.application_status_history to authenticated;
revoke all on function public.record_application_status_history() from public, anon, authenticated;

-- OCRI revisa expedientes y necesita abrir la foto oficial privada del postulante.
create policy "OCRI reads applicant profile photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'profile-photos' and public.has_role('ADMIN_OCRI'));
