-- Clasifica cada convocatoria para aplicar las restricciones únicamente a
-- movilidades académicas. Los programas especiales y pasantías quedan exentos.
alter table public.calls
  add column activity_type text not null default 'MOVILIDAD',
  add column mobility_scope text default 'INTERNACIONAL';

alter table public.calls
  add constraint calls_activity_type_check
    check (activity_type in ('MOVILIDAD', 'PROGRAMA', 'PASANTIA')),
  add constraint calls_mobility_scope_check
    check (
      (activity_type = 'MOVILIDAD' and mobility_scope in ('NACIONAL', 'INTERNACIONAL'))
      or (activity_type in ('PROGRAMA', 'PASANTIA') and mobility_scope is null)
    );

comment on column public.calls.activity_type is
  'MOVILIDAD aplica límites; PROGRAMA y PASANTIA son oportunidades especiales exentas.';
comment on column public.calls.mobility_scope is
  'Ámbito nacional o internacional, obligatorio solo para movilidades académicas.';

-- Conserva la función consolidada de convocatorias y añade la clasificación en
-- la misma operación lógica que usa el cliente.
create function public.admin_upsert_classified_call(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  call_id uuid;
  activity_value text := upper(coalesce(nullif(payload ->> 'activityType', ''), 'MOVILIDAD'));
  scope_value text;
begin
  if activity_value not in ('MOVILIDAD', 'PROGRAMA', 'PASANTIA') then
    raise exception 'Tipo de oportunidad no válido.' using errcode = '22023';
  end if;

  if activity_value = 'MOVILIDAD' then
    scope_value := upper(coalesce(nullif(payload ->> 'mobilityScope', ''), 'INTERNACIONAL'));
    if scope_value not in ('NACIONAL', 'INTERNACIONAL') then
      raise exception 'La movilidad debe ser nacional o internacional.' using errcode = '22023';
    end if;
  else
    scope_value := null;
  end if;

  call_id := public.admin_upsert_call(payload);
  update public.calls
  set activity_type = activity_value,
      mobility_scope = scope_value,
      updated_at = now()
  where id = call_id;
  return call_id;
end;
$$;
revoke all on function public.admin_upsert_classified_call(jsonb) from public, anon;
grant execute on function public.admin_upsert_classified_call(jsonb) to authenticated;

-- Valida los límites al confirmar una aceptación. De este modo no pueden
-- eludirse con otro cliente o modificando el navegador.
create function private.enforce_outgoing_mobility_limits()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  current_call public.calls;
  mobility_year text;
begin
  if new.status <> 'ACEPTADO' or old.status = 'ACEPTADO' then
    return new;
  end if;

  select * into current_call from public.calls where id = new.call_id;
  if current_call.direction <> 'SALIENTE' or current_call.activity_type <> 'MOVILIDAD' then
    return new;
  end if;

  mobility_year := substring(current_call.period from '^[0-9]{4}');

  if exists (
    select 1
    from public.applications previous
    join public.calls previous_call on previous_call.id = previous.call_id
    where previous.applicant_id = new.applicant_id
      and previous.id <> new.id
      and previous.status in ('ACEPTADO', 'EN_MOVILIDAD', 'FINALIZADA')
      and previous_call.direction = 'SALIENTE'
      and previous_call.activity_type = 'MOVILIDAD'
      and substring(previous_call.period from '^[0-9]{4}') = mobility_year
  ) then
    raise exception 'El estudiante ya registra una movilidad en %. Solo puede realizar una movilidad por año.', mobility_year
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.applications previous
    join public.calls previous_call on previous_call.id = previous.call_id
    where previous.applicant_id = new.applicant_id
      and previous.id <> new.id
      and previous.status in ('ACEPTADO', 'EN_MOVILIDAD', 'FINALIZADA')
      and previous_call.direction = 'SALIENTE'
      and previous_call.activity_type = 'MOVILIDAD'
      and previous_call.mobility_scope = current_call.mobility_scope
  ) then
    raise exception 'El estudiante ya utilizó su única movilidad %.', lower(current_call.mobility_scope)
      using errcode = '23514';
  end if;

  return new;
end;
$$;
revoke all on function private.enforce_outgoing_mobility_limits() from public, anon, authenticated;

create trigger applications_enforce_outgoing_mobility_limits
  before update of status on public.applications
  for each row execute procedure private.enforce_outgoing_mobility_limits();

create function private.prevent_new_outgoing_application_after_rejection()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if exists (
    select 1 from public.calls current_call
    where current_call.id = new.call_id and current_call.direction = 'SALIENTE'
  ) and exists (
    select 1
    from public.applications previous
    join public.calls previous_call on previous_call.id = previous.call_id
    where previous.applicant_id = new.applicant_id
      and previous_call.direction = 'SALIENTE'
      and previous.status in ('RECHAZADA', 'NO_ACEPTADO_DESTINO')
  ) then
    raise exception 'El estudiante tiene una postulación rechazada y no puede iniciar una nueva. El expediente permanece en su historial.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_new_outgoing_application_after_rejection()
  from public, anon, authenticated;

create trigger applications_prevent_new_after_rejection
  before insert on public.applications
  for each row execute procedure private.prevent_new_outgoing_application_after_rejection();

-- El borrador pertenece exclusivamente al estudiante. OCRI recibe visibilidad
-- desde ENVIADA; la restricción se aplica con RLS y no depende de la interfaz.
drop policy if exists "applicants read their applications" on public.applications;
drop policy if exists "OCRI administrators manage applications" on public.applications;

create policy "applicants read their own applications"
  on public.applications for select to authenticated
  using (applicant_id = (select auth.uid()));

create policy "OCRI reads submitted applications"
  on public.applications for select to authenticated
  using (public.has_role('ADMIN_OCRI') and status <> 'BORRADOR');

create policy "OCRI updates submitted applications"
  on public.applications for update to authenticated
  using (public.has_role('ADMIN_OCRI') and status <> 'BORRADOR')
  with check (public.has_role('ADMIN_OCRI') and status <> 'BORRADOR');

create policy "OCRI deletes submitted applications"
  on public.applications for delete to authenticated
  using (public.has_role('ADMIN_OCRI') and status <> 'BORRADOR');

drop policy if exists "applicants read their application documents" on public.application_documents;
drop policy if exists "OCRI administrators manage application documents" on public.application_documents;

create policy "applicants read their own application documents"
  on public.application_documents for select to authenticated
  using (
    exists (
      select 1 from public.applications application
      where application.id = application_id
        and application.applicant_id = (select auth.uid())
    )
  );

create policy "OCRI reads submitted application documents"
  on public.application_documents for select to authenticated
  using (
    public.has_role('ADMIN_OCRI')
    and exists (
      select 1 from public.applications application
      where application.id = application_id and application.status <> 'BORRADOR'
    )
  );

create policy "OCRI updates submitted application documents"
  on public.application_documents for update to authenticated
  using (
    public.has_role('ADMIN_OCRI')
    and exists (
      select 1 from public.applications application
      where application.id = application_id and application.status <> 'BORRADOR'
    )
  )
  with check (
    public.has_role('ADMIN_OCRI')
    and exists (
      select 1 from public.applications application
      where application.id = application_id and application.status <> 'BORRADOR'
    )
  );

create policy "OCRI deletes submitted application documents"
  on public.application_documents for delete to authenticated
  using (
    public.has_role('ADMIN_OCRI')
    and exists (
      select 1 from public.applications application
      where application.id = application_id and application.status <> 'BORRADOR'
    )
  );

drop policy if exists "applicants and OCRI read application status history"
  on public.application_status_history;
create policy "applicants and OCRI read visible application history"
  on public.application_status_history for select to authenticated
  using (
    exists (
      select 1 from public.applications application
      where application.id = application_id
        and (
          application.applicant_id = (select auth.uid())
          or (public.has_role('ADMIN_OCRI') and application.status <> 'BORRADOR')
        )
    )
  );

create or replace function private.external_manager_can_read_application(target_application_id uuid)
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
        and application.status <> 'BORRADOR'
        and manager.university_id = applicant.university_id
        and call.direction = 'ENTRANTE'
    );
$$;
