-- El cierre por fecha se calcula en Lima, sin tareas programadas ni cambios a expedientes.
alter table public.calls add column concluded_at timestamptz;
alter table public.calls add column archived_at timestamptz;
alter table public.calls add constraint calls_archive_requires_conclusion
  check (archived_at is null or concluded_at is not null or status = 'CERRADA');

create function private.guard_call_lifecycle()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.concluded_at is not null and old.concluded_at is null
    and (new.status = 'BORRADOR' or new.closes_on >= (clock_timestamp() at time zone 'America/Lima')::date) then
    raise exception 'Solo se puede concluir una convocatoria cuyo plazo haya vencido.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_call_lifecycle() from public, anon, authenticated;
create trigger guard_call_lifecycle before update on public.calls
  for each row execute function private.guard_call_lifecycle();

create function private.guard_call_deadline()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare must_check boolean;
begin
  must_check := tg_op = 'INSERT';
  -- Una nominación previa puede vincularse al confirmar la cuenta después del plazo.
  -- Esto no permite enviar el borrador fuera de plazo ni bloquea el alta del usuario.
  if tg_op = 'INSERT' and tg_table_name = 'applications' and new.status = 'BORRADOR' then
    if exists (select 1 from public.incoming_nominations n
      join public.profiles p on p.user_id = new.applicant_id
      where n.call_id = new.call_id and n.student_email = lower(p.email)
        and n.university_id = p.university_id) then
      must_check := false;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    -- Las subsanaciones y el seguimiento de expedientes enviados siguen disponibles.
    must_check := new.call_id is distinct from old.call_id
      or (new.status = 'ENVIADA' and old.status = 'BORRADOR');
  end if;
  if must_check then
    -- Serializa altas y envíos con el cierre administrativo de la convocatoria.
    perform 1 from public.calls c where c.id = new.call_id
      and c.status = 'ACTIVA' and c.concluded_at is null and c.archived_at is null
      and c.closes_on >= (clock_timestamp() at time zone 'America/Lima')::date
      for share;
    if not found then
      raise exception 'Esta convocatoria ya no recibe postulaciones ni nominaciones.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_call_deadline() from public, anon, authenticated;
create trigger guard_call_deadline before insert or update on public.applications
  for each row execute function private.guard_call_deadline();
create trigger guard_call_deadline before insert or update on public.incoming_nominations
  for each row execute function private.guard_call_deadline();
