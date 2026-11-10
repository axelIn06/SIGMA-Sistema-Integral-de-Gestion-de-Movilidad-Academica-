-- Prueba transaccional SGME. Solo local: todos los datos ficticios se revierten.
do $$
declare
  admin_id uuid;
  student_id uuid;
  call_id_value uuid := gen_random_uuid();
  application_id_value uuid := gen_random_uuid();
  current_status text;
begin
  select user_id into admin_id from public.user_roles ur join public.roles role on role.id = ur.role_id
  where role.code = 'ADMIN_OCRI' limit 1;
  select user_id into student_id from public.user_roles ur join public.roles role on role.id = ur.role_id
  where role.code = 'ESTUDIANTE_EXTERNO' limit 1;
  if admin_id is null or student_id is null then raise exception 'Se requiere OCRI y estudiante externo locales.'; end if;
  begin
    insert into public.calls(id, code, title, direction, period, closes_on, created_by)
    values (call_id_value, 'TEST-' || call_id_value, 'Prueba etapas SGME', 'ENTRANTE', '2027-I', '2027-01-01', admin_id);
    update public.calls set status = 'ACTIVA' where id = call_id_value;
    insert into public.applications(id, call_id, applicant_id, status)
    values (application_id_value, call_id_value, student_id, 'ENVIADA');
    insert into storage.objects(bucket_id, name) values
      ('acceptance-letters', application_id_value || '/carta.pdf'),
      ('incoming-official-documents', application_id_value || '/RESOLUCION_MATRICULA/resolucion.pdf'),
      ('incoming-official-documents', application_id_value || '/CERTIFICADO_ESTUDIOS/certificado.pdf');

    perform set_config('request.jwt.claim.sub', admin_id::text, true);
    perform set_config('role', 'authenticated', true);
    begin
      update public.applications set status = 'ADMITIDO_UNSAAC' where id = application_id_value;
      raise exception 'Se permitió aceptar sin carta.';
    exception when sqlstate '22023' then null;
    end;
    begin
      perform public.admin_save_incoming_document(application_id_value, 'RESOLUCION_MATRICULA',
        application_id_value || '/RESOLUCION_MATRICULA/resolucion.pdf', 'resolucion.pdf', 'SGME-001', '');
      raise exception 'Se permitió la resolución antes de aceptar.';
    exception when sqlstate '22023' then null;
    end;

    perform public.admin_save_incoming_document(application_id_value, 'ACEPTACION_UNSAAC',
      application_id_value || '/carta.pdf', 'carta.pdf', null, 'Carta oficial emitida.');
    select status into current_status from public.applications where id = application_id_value;
    if current_status <> 'ADMITIDO_UNSAAC' then raise exception 'La carta no actualizó la aceptación.'; end if;
    begin
      perform public.admin_save_incoming_document(application_id_value, 'CERTIFICADO_ESTUDIOS',
        application_id_value || '/CERTIFICADO_ESTUDIOS/certificado.pdf', 'certificado.pdf', null, '');
      raise exception 'Se permitió adjuntar el certificado antes de la movilidad.';
    exception when sqlstate '22023' then null;
    end;
    begin
      update public.applications set status = 'EN_MOVILIDAD' where id = application_id_value;
      raise exception 'Se permitió iniciar movilidad sin resolución y código.';
    exception when sqlstate '22023' then null;
    end;
    perform public.admin_save_incoming_document(application_id_value, 'RESOLUCION_MATRICULA',
      application_id_value || '/RESOLUCION_MATRICULA/resolucion.pdf', 'resolucion.pdf', null, 'Resolución emitida.');
    if not exists (select 1 from public.applications where id = application_id_value
      and status = 'MATRICULA_HABILITADA' and student_code is null) then
      raise exception 'La resolución debe habilitar la matrícula sin transcribir el código.';
    end if;
    update public.applications set status = 'EN_MOVILIDAD' where id = application_id_value;
    begin
      update public.applications set status = 'FINALIZADA' where id = application_id_value;
      raise exception 'Se permitió concluir sin certificado de estudios.';
    exception when sqlstate '22023' then null;
    end;
    perform public.admin_save_incoming_document(application_id_value, 'CERTIFICADO_ESTUDIOS',
      application_id_value || '/CERTIFICADO_ESTUDIOS/certificado.pdf', 'certificado.pdf', null, '');
    select status into current_status from public.applications where id = application_id_value;
    if current_status <> 'EN_MOVILIDAD' then raise exception 'Adjuntar el certificado no debe concluir automáticamente.'; end if;
    update public.applications set status = 'FINALIZADA' where id = application_id_value;
    if (select count(*) from public.application_status_history where application_id = application_id_value) <> 5 then
      raise exception 'El historial no conserva las cinco etapas con fecha.';
    end if;
    if not exists (select 1 from public.application_status_history where application_id = application_id_value
      and status = 'ADMITIDO_UNSAAC' and note = 'Carta oficial emitida.' and changed_at is not null) then
      raise exception 'No se conservó el comentario de aceptación.';
    end if;
    perform set_config('request.jwt.claim.sub', student_id::text, true);
    begin
      perform public.admin_save_incoming_document(application_id_value, 'CERTIFICADO_ESTUDIOS',
        application_id_value || '/CERTIFICADO_ESTUDIOS/certificado.pdf', 'certificado.pdf', null, '');
      raise exception 'Un estudiante pudo emitir un certificado oficial.';
    exception when sqlstate '42501' then null;
    end;
    perform set_config('role', 'postgres', true);
    raise exception using errcode = 'ZX001', message = 'revertir datos de prueba';
  exception when sqlstate 'ZX001' then
    raise notice 'SGME OK: aceptación, matrícula, código, movilidad, cierre, historial y permisos. Datos revertidos.';
  end;
end;
$$;
