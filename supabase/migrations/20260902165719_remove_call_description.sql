-- La convocatoria ya se explica mediante requisitos, documentos, materiales y enlaces.
-- Se elimina el texto descriptivo general para evitar información duplicada.

alter table public.calls
  drop column student_description;

-- Mantiene la operación atómica de creación y edición, pero deja de exigir o guardar
-- el campo `description` dentro del JSON enviado por la aplicación.
create or replace function public.admin_upsert_call(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  call_id_value uuid;
  notice_id_value uuid;
  item jsonb;
  item_index integer;
  generated_code text;
begin
  if not public.has_role('ADMIN_OCRI') then
    raise exception 'Solo ADMIN_OCRI puede gestionar convocatorias.' using errcode = '42501';
  end if;

  if coalesce(trim(payload ->> 'title'), '') = ''
    or coalesce(trim(payload ->> 'period'), '') = ''
    or coalesce(trim(payload ->> 'end'), '') = '' then
    raise exception 'Faltan datos obligatorios de la convocatoria.' using errcode = '22023';
  end if;

  call_id_value := nullif(payload ->> 'id', '')::uuid;
  generated_code := coalesce(
    nullif(payload ->> 'code', ''),
    'CV-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS')
  );

  if call_id_value is null then
    insert into public.calls (
      code,
      title,
      direction,
      period,
      closes_on,
      status,
      cover_image_path,
      created_by
    ) values (
      generated_code,
      trim(payload ->> 'title'),
      payload ->> 'direction',
      payload ->> 'period',
      (payload ->> 'end')::date,
      payload ->> 'status',
      nullif(payload ->> 'coverImagePath', ''),
      auth.uid()
    ) returning id into call_id_value;
  else
    update public.calls
    set title = trim(payload ->> 'title'),
        direction = payload ->> 'direction',
        period = payload ->> 'period',
        closes_on = (payload ->> 'end')::date,
        status = payload ->> 'status',
        cover_image_path = nullif(payload ->> 'coverImagePath', '')
    where id = call_id_value;

    if not found then
      raise exception 'La convocatoria no existe.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.call_guidelines where call_id = call_id_value;
  delete from public.call_requirements where call_id = call_id_value;
  delete from public.call_resources where call_id = call_id_value;
  delete from public.call_notices where call_id = call_id_value;

  for item, item_index in
    select value, ordinality::integer - 1
    from jsonb_array_elements(coalesce(payload -> 'guidelines', '[]'::jsonb)) with ordinality
  loop
    if coalesce(trim(item #>> '{}'), '') <> '' then
      insert into public.call_guidelines (call_id, content, display_order)
      values (call_id_value, trim(item #>> '{}'), item_index);
    end if;
  end loop;

  for item, item_index in
    select value, ordinality::integer - 1
    from jsonb_array_elements(coalesce(payload -> 'documents', '[]'::jsonb)) with ordinality
  loop
    if coalesce(trim(item ->> 'title'), '') <> '' then
      insert into public.call_requirements (
        call_id,
        title,
        description,
        is_required,
        display_order
      ) values (
        call_id_value,
        trim(item ->> 'title'),
        nullif(trim(item ->> 'description'), ''),
        coalesce((item ->> 'required')::boolean, true),
        item_index
      );
    end if;
  end loop;

  for item, item_index in
    select value, ordinality::integer - 1
    from jsonb_array_elements(coalesce(payload -> 'resources', '[]'::jsonb)) with ordinality
  loop
    if coalesce(trim(item ->> 'storagePath'), '') <> '' then
      insert into public.call_resources (
        call_id,
        title,
        description,
        storage_path,
        file_name,
        display_order
      ) values (
        call_id_value,
        coalesce(nullif(trim(item ->> 'fileName'), ''), 'Material OCRI'),
        nullif(trim(item ->> 'description'), ''),
        item ->> 'storagePath',
        nullif(trim(item ->> 'fileName'), ''),
        item_index
      );
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(payload #> '{notice,links}', '[]'::jsonb)) as link_item
    where coalesce(trim(link_item ->> 'label'), '') <> ''
  ) then
    insert into public.call_notices (call_id)
    values (call_id_value)
    returning id into notice_id_value;

    for item, item_index in
      select value, ordinality::integer - 1
      from jsonb_array_elements(coalesce(payload #> '{notice,links}', '[]'::jsonb)) with ordinality
    loop
      if coalesce(trim(item ->> 'label'), '') <> '' then
        insert into public.call_notice_links (notice_id, label, url, display_order)
        values (
          notice_id_value,
          trim(item ->> 'label'),
          nullif(trim(item ->> 'url'), ''),
          item_index
        );
      end if;
    end loop;
  end if;

  return call_id_value;
end;
$$;
