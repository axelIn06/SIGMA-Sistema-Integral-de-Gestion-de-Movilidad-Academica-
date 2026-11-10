-- Solo fixtures locales; la transacción interna revierte todas las filas.
do $$
declare
  admin_id uuid;
  test_call uuid := gen_random_uuid();
  test_app uuid := gen_random_uuid();
begin
  select ur.user_id into strict admin_id from public.user_roles ur
    join public.roles r on r.id = ur.role_id where r.code = 'ADMIN_OCRI' limit 1;
  begin
    insert into public.calls(id, code, title, direction, period, closes_on, status, created_by)
      values(test_call, 'TEST-' || test_call, 'Cierre de prueba', 'SALIENTE', '2027-I',
        (clock_timestamp() at time zone 'America/Lima')::date, 'ACTIVA', admin_id);
    insert into public.applications(id, call_id, applicant_id) values(test_app, test_call, admin_id);
    begin
      update public.calls set concluded_at = now() where id = test_call;
      raise exception 'Se permitió concluir antes de vencer.';
    exception when invalid_parameter_value then null;
    end;
    begin
      update public.calls set archived_at = now() where id = test_call;
      raise exception 'Se permitió archivar sin concluir.';
    exception when check_violation then null;
    end;
    update public.calls set closes_on = (clock_timestamp() at time zone 'America/Lima')::date - 1
      where id = test_call;
    begin
      insert into public.applications(call_id, applicant_id, status)
        values(test_call, admin_id, 'ENVIADA');
      raise exception 'Se permitió postular fuera de plazo.';
    exception when invalid_parameter_value then null;
    end;
    perform set_config('request.jwt.claim.sub', admin_id::text, true);
    perform set_config('role', 'authenticated', true);
    update public.calls set concluded_at = now() where id = test_call;
    update public.calls set archived_at = now() where id = test_call;
    if not exists(select 1 from public.calls where id = test_call and archived_at is not null)
      or not exists(select 1 from public.applications where id = test_app) then
      raise exception 'Archivar eliminó datos o falló.';
    end if;
    update public.calls set archived_at = null where id = test_call;
    if not exists(select 1 from public.calls where id = test_call and concluded_at is not null and archived_at is null) then
      raise exception 'Desarchivar perdió la conclusión.';
    end if;
    raise exception using errcode = 'ZX001', message = 'rollback';
  exception when sqlstate 'ZX001' then
    raise notice 'PASÓ: fecha límite, conclusión, archivo reversible y conservación del expediente.';
  end;
end;
$$;
