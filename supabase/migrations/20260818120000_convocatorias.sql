-- SIGMA OCRI: modelo final de convocatorias y materiales.
-- Cada convocatoria representa una oportunidad concreta; no se crean destinos,
-- vacantes ni fecha de apertura que la interfaz actual no utiliza.

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  direction text not null check (direction in ('SALIENTE', 'ENTRANTE')),
  period text not null check (period ~ '^20[0-9]{2}-(I|II)$'),
  closes_on date not null,
  student_description text not null,
  status text not null default 'BORRADOR'
    check (status in ('BORRADOR', 'ACTIVA', 'CERRADA')),
  cover_image_path text,
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.call_guidelines (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  content text not null,
  display_order smallint not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now()
);

create table public.call_requirements (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  title text not null,
  description text,
  is_required boolean not null default true,
  display_order smallint not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now()
);

create table public.call_resources (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  title text not null,
  description text,
  storage_path text not null,
  file_name text,
  display_order smallint not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now()
);

create table public.call_notices (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique references public.calls(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.call_notice_links (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.call_notices(id) on delete cascade,
  label text not null,
  url text,
  display_order smallint not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  constraint call_notice_links_url_format check (url is null or url ~ '^https?://')
);

create index calls_status_period_idx on public.calls(status, period);
create index calls_direction_idx on public.calls(direction);
create index call_guidelines_call_id_idx on public.call_guidelines(call_id, display_order);
create index call_requirements_call_id_idx on public.call_requirements(call_id, display_order);
create index call_resources_call_id_idx on public.call_resources(call_id, display_order);
create index call_notice_links_notice_id_idx on public.call_notice_links(notice_id, display_order);

comment on table public.calls is 'Convocatorias de movilidad publicadas o en borrador.';
comment on table public.call_guidelines is 'Condiciones generales visibles como viñetas.';
comment on table public.call_requirements is 'Documentos que debe presentar el postulante.';
comment on table public.call_resources is 'Archivos descargables proporcionados por OCRI.';
comment on table public.call_notice_links is 'Información importante y enlaces adicionales.';

create function public.set_call_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger calls_set_updated_at
  before update on public.calls
  for each row execute procedure public.set_call_updated_at();

alter table public.calls enable row level security;
alter table public.call_guidelines enable row level security;
alter table public.call_requirements enable row level security;
alter table public.call_resources enable row level security;
alter table public.call_notices enable row level security;
alter table public.call_notice_links enable row level security;

create policy "authenticated users can read active calls"
  on public.calls for select to authenticated
  using (status = 'ACTIVA' or public.has_role('ADMIN_OCRI'));
create policy "OCRI administrators manage calls"
  on public.calls for all to authenticated
  using (public.has_role('ADMIN_OCRI')) with check (public.has_role('ADMIN_OCRI'));

create policy "authenticated users can read visible call guidelines"
  on public.call_guidelines for select to authenticated
  using (
    public.has_role('ADMIN_OCRI')
    or exists (select 1 from public.calls c where c.id = call_id and c.status = 'ACTIVA')
  );
create policy "OCRI administrators manage call guidelines"
  on public.call_guidelines for all to authenticated
  using (public.has_role('ADMIN_OCRI')) with check (public.has_role('ADMIN_OCRI'));

create policy "authenticated users can read visible call requirements"
  on public.call_requirements for select to authenticated
  using (
    public.has_role('ADMIN_OCRI')
    or exists (select 1 from public.calls c where c.id = call_id and c.status = 'ACTIVA')
  );
create policy "OCRI administrators manage call requirements"
  on public.call_requirements for all to authenticated
  using (public.has_role('ADMIN_OCRI')) with check (public.has_role('ADMIN_OCRI'));

create policy "authenticated users can read visible call resources"
  on public.call_resources for select to authenticated
  using (
    public.has_role('ADMIN_OCRI')
    or exists (select 1 from public.calls c where c.id = call_id and c.status = 'ACTIVA')
  );
create policy "OCRI administrators manage call resources"
  on public.call_resources for all to authenticated
  using (public.has_role('ADMIN_OCRI')) with check (public.has_role('ADMIN_OCRI'));

create policy "authenticated users can read visible call notices"
  on public.call_notices for select to authenticated
  using (
    public.has_role('ADMIN_OCRI')
    or exists (select 1 from public.calls c where c.id = call_id and c.status = 'ACTIVA')
  );
create policy "OCRI administrators manage call notices"
  on public.call_notices for all to authenticated
  using (public.has_role('ADMIN_OCRI')) with check (public.has_role('ADMIN_OCRI'));

create policy "authenticated users can read visible call notice links"
  on public.call_notice_links for select to authenticated
  using (
    public.has_role('ADMIN_OCRI')
    or exists (
      select 1 from public.call_notices n
      join public.calls c on c.id = n.call_id
      where n.id = notice_id and c.status = 'ACTIVA'
    )
  );
create policy "OCRI administrators manage call notice links"
  on public.call_notice_links for all to authenticated
  using (public.has_role('ADMIN_OCRI')) with check (public.has_role('ADMIN_OCRI'));

revoke all on public.calls, public.call_guidelines, public.call_requirements,
  public.call_resources, public.call_notices, public.call_notice_links from anon;
grant select, insert, update, delete on public.calls, public.call_guidelines,
  public.call_requirements, public.call_resources, public.call_notices,
  public.call_notice_links to authenticated;

-- Portadas y materiales privados. Los usuarios autenticados acceden solamente
-- a archivos de convocatorias activas; OCRI administra el bucket completo.
insert into storage.buckets (id, name, public)
values ('call-assets', 'call-assets', false)
on conflict (id) do nothing;

create policy "OCRI administrators manage call assets"
  on storage.objects for all to authenticated
  using (bucket_id = 'call-assets' and public.has_role('ADMIN_OCRI'))
  with check (bucket_id = 'call-assets' and public.has_role('ADMIN_OCRI'));

create policy "authenticated users read assets of visible calls"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'call-assets'
    and (
      public.has_role('ADMIN_OCRI')
      or exists (
        select 1 from public.calls c
        where c.status = 'ACTIVA' and c.cover_image_path = name
      )
      or exists (
        select 1 from public.call_resources r
        join public.calls c on c.id = r.call_id
        where c.status = 'ACTIVA' and r.storage_path = name
      )
    )
  );

-- Guarda la convocatoria y sus secciones en una sola transacción.
create function public.admin_upsert_call(payload jsonb)
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
    or coalesce(trim(payload ->> 'end'), '') = ''
    or coalesce(trim(payload ->> 'description'), '') = '' then
    raise exception 'Faltan datos obligatorios de la convocatoria.' using errcode = '22023';
  end if;

  call_id_value := nullif(payload ->> 'id', '')::uuid;
  generated_code := coalesce(
    nullif(payload ->> 'code', ''),
    'CV-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS')
  );

  if call_id_value is null then
    insert into public.calls (
      code, title, direction, period, closes_on, student_description,
      status, cover_image_path, created_by
    ) values (
      generated_code,
      trim(payload ->> 'title'),
      payload ->> 'direction',
      payload ->> 'period',
      (payload ->> 'end')::date,
      trim(payload ->> 'description'),
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
        student_description = trim(payload ->> 'description'),
        status = payload ->> 'status',
        cover_image_path = nullif(payload ->> 'coverImagePath', '')
    where id = call_id_value;
    if not found then raise exception 'La convocatoria no existe.' using errcode = 'P0002'; end if;
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
        call_id, title, description, is_required, display_order
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
        call_id, title, description, storage_path, file_name, display_order
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

create function public.admin_delete_call(target_call_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.has_role('ADMIN_OCRI') then
    raise exception 'Solo ADMIN_OCRI puede eliminar convocatorias.' using errcode = '42501';
  end if;
  delete from public.calls where id = target_call_id;
  if not found then raise exception 'La convocatoria no existe.' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function public.admin_upsert_call(jsonb) from public, anon;
revoke all on function public.admin_delete_call(uuid) from public, anon;
grant execute on function public.admin_upsert_call(jsonb) to authenticated;
grant execute on function public.admin_delete_call(uuid) to authenticated;
