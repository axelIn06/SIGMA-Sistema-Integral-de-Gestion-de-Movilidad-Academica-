-- Valida cualquier entrada a un estado que confirma la movilidad, incluso si
-- un cliente intenta omitir ACEPTADO y saltar directamente a EN_MOVILIDAD.
create or replace function private.enforce_outgoing_mobility_limits()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  current_call public.calls;
  mobility_year text;
begin
  if new.status not in ('ACEPTADO', 'EN_MOVILIDAD', 'FINALIZADA')
    or old.status in ('ACEPTADO', 'EN_MOVILIDAD', 'FINALIZADA') then
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

create index if not exists application_status_history_changed_by_idx
  on public.application_status_history(changed_by);
