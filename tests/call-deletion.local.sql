-- Prueba transaccional: nunca conserva las convocatorias ni expedientes ficticios.
do $$
declare
  admin_id uuid;
  student_id uuid;
  draft_call_id uuid := gen_random_uuid();
  submitted_call_id uuid := gen_random_uuid();
  deleted_paths text[];
begin
  select ur.user_id into admin_id
  from public.user_roles ur
  join public.roles role on role.id = ur.role_id
  where role.code = 'ADMIN_OCRI'
  limit 1;

  if admin_id is null then
    raise exception 'La prueba necesita un administrador OCRI local.';
  end if;

  select ur.user_id into student_id
  from public.user_roles ur
  join public.roles role on role.id = ur.role_id
  where role.code = 'ESTUDIANTE_UNSAAC'
  limit 1;
  if student_id is null then
    raise exception 'La prueba necesita un estudiante UNSAAC local.';
  end if;

  begin
    insert into public.calls (id, code, title, direction, period, closes_on, created_by)
    values
      (draft_call_id, 'TEST-' || draft_call_id, 'Prueba borrador', 'SALIENTE', '2027-I', '2026-12-31', admin_id),
      (submitted_call_id, 'TEST-' || submitted_call_id, 'Prueba enviada', 'SALIENTE', '2027-I', '2026-12-31', admin_id);

    update public.calls set status = 'ACTIVA' where id in (draft_call_id, submitted_call_id);

    insert into public.applications (call_id, applicant_id, status)
    values (draft_call_id, admin_id, 'BORRADOR');

    insert into public.application_documents (application_id, requirement_title, storage_path, file_name)
    select id, 'Archivo de prueba', 'prueba/borrador/documento.pdf', 'documento.pdf'
    from public.applications where call_id = draft_call_id;

    insert into public.applications (call_id, applicant_id, status)
    values (submitted_call_id, admin_id, 'ENVIADA');

    perform set_config('request.jwt.claim.sub', admin_id::text, true);
    perform set_config('role', 'authenticated', true);

    deleted_paths := public.admin_delete_call_with_drafts(draft_call_id);
    if deleted_paths <> array['prueba/borrador/documento.pdf']::text[]
      or exists (select 1 from public.calls where id = draft_call_id)
      or exists (select 1 from public.applications where call_id = draft_call_id) then
      raise exception 'No se eliminaron correctamente la convocatoria y su borrador.';
    end if;

    begin
      perform public.admin_delete_call_with_drafts(submitted_call_id);
      raise exception 'Se permitió eliminar una convocatoria con postulación enviada.';
    exception when foreign_key_violation then
      null;
    end;

    if not exists (select 1 from public.calls where id = submitted_call_id) then
      raise exception 'La convocatoria con postulación enviada no quedó protegida.';
    end if;

    perform set_config('request.jwt.claim.sub', student_id::text, true);
    begin
      perform public.admin_delete_call_with_drafts(submitted_call_id);
      raise exception 'Se permitió eliminar una convocatoria a un estudiante.';
    exception when insufficient_privilege then
      null;
    end;

    raise exception 'SIGMA_TEST_ROLLBACK';
  exception when raise_exception then
    if sqlerrm <> 'SIGMA_TEST_ROLLBACK' then raise; end if;
    raise notice 'PASÓ: borradores eliminables, postulación enviada protegida; prueba revertida.';
  end;
end;
$$;
