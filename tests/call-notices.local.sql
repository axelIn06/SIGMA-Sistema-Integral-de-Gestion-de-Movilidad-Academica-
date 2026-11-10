-- Ejecutar únicamente contra Supabase local con una cuenta ADMIN_OCRI activa.
-- La subtransacción revierte la convocatoria ficticia incluso cuando la prueba pasa.
do $$
declare
  admin_id uuid;
  saved_call_id uuid;
  important_count integer;
  additional_count integer;
  saved_description text;
  saved_document_url text;
begin
  select ur.user_id into admin_id
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.profiles p on p.user_id = ur.user_id
  where r.code = 'ADMIN_OCRI' and p.status = 'ACTIVO'
  limit 1;

  if admin_id is null then
    raise exception 'Esta prueba necesita un administrador OCRI activo en Supabase local.';
  end if;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    saved_call_id := public.admin_upsert_categorized_call(
      jsonb_build_object(
        'title', 'Prueba transaccional de avisos SIGMA',
        'direction', 'SALIENTE',
        'period', '2027-I',
        'end', '2026-10-31',
        'status', 'BORRADOR',
        'activityType', 'MOVILIDAD',
        'mobilityScope', 'INTERNACIONAL',
        'guidelines', jsonb_build_array('Requisito de prueba'),
        'documents', jsonb_build_array(jsonb_build_object(
          'title', 'Solicitud de prueba',
          'required', true,
          'url', 'https://example.org/solicitud'
        )),
        'resources', '[]'::jsonb,
        'notice', jsonb_build_object(
          'description', 'Descripción adicional de prueba',
          'links', jsonb_build_array(
            jsonb_build_object('label', 'Aviso de prueba', 'url', 'https://example.org/aviso', 'kind', 'IMPORTANT'),
            jsonb_build_object('label', 'Paso de prueba', 'url', 'https://example.org/paso', 'kind', 'ADDITIONAL')
          )
        )
      )
    );

    select
      count(*) filter (where link.kind = 'IMPORTANT'),
      count(*) filter (where link.kind = 'ADDITIONAL'),
      max(parent.description)
    into important_count, additional_count, saved_description
    from public.call_notices parent
    join public.call_notice_links link on link.notice_id = parent.id
    where parent.call_id = saved_call_id;

    select source_url into saved_document_url
    from public.call_requirements
    where call_id = saved_call_id;

    if important_count <> 1
      or additional_count <> 1
      or saved_description <> 'Descripción adicional de prueba'
      or saved_document_url <> 'https://example.org/solicitud' then
      raise exception 'La convocatoria no conservó los avisos, la descripción y el enlace.';
    end if;

    raise exception 'SIGMA_TEST_ROLLBACK';
  exception when raise_exception then
    if sqlerrm <> 'SIGMA_TEST_ROLLBACK' then
      raise;
    end if;
    raise notice 'PASÓ: avisos, descripción y enlace guardados; prueba revertida.';
  end;
end;
$$;
