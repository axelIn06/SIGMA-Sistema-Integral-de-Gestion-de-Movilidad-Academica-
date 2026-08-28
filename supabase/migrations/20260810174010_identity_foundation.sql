-- SIGMA OCRI: modelo final de identidad, perfiles, roles y universidades.
-- Esta migración es autocontenida: una instalación nueva no crea roles ni
-- tablas temporales que deban eliminarse después.

create type public.account_status as enum ('PENDIENTE', 'ACTIVO', 'SUSPENDIDO');

create table public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  is_unsaac boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index universities_only_one_unsaac_idx
  on public.universities (is_unsaac)
  where is_unsaac;

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null,
  created_at timestamptz not null default now(),
  constraint roles_code_format check (code ~ '^[A-Z_]+$')
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  university_id uuid references public.universities(id) on delete set null,
  status public.account_status not null default 'PENDIENTE',
  email_verified_at timestamptz,
  password_configured_at timestamptz,
  phone text,
  address text,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_normalized check (email = lower(email))
);

create table public.user_roles (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  assigned_by uuid references public.profiles(user_id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table public.university_email_domains (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  email_domain text not null unique,
  is_verified boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint university_email_domains_normalized check (
    email_domain = lower(email_domain)
    and email_domain ~ '^[a-z0-9.-]+[.][a-z]{2,}$'
  )
);

create index profiles_university_id_idx on public.profiles(university_id);
create index user_roles_role_id_idx on public.user_roles(role_id);
create index university_email_domains_university_id_idx
  on public.university_email_domains(university_id);

comment on table public.universities is 'Universidades autorizadas para movilidad académica.';
comment on column public.profiles.photo_path is 'Ruta privada de la foto del perfil en Storage.';

-- Catálogos institucionales mínimos.
insert into public.universities (name, country, is_unsaac)
values ('Universidad Nacional de San Antonio Abad del Cusco', 'Perú', true);

insert into public.roles (code, name, description)
values
  ('ADMIN_OCRI', 'Administrador OCRI', 'Configura y supervisa SIGMA OCRI.'),
  ('ESTUDIANTE_UNSAAC', 'Estudiante UNSAAC', 'Postula a movilidad saliente.'),
  ('GESTOR_EXTERNO', 'Gestor externo', 'Gestiona nominaciones de su universidad.'),
  ('ESTUDIANTE_EXTERNO', 'Estudiante externo', 'Postula a movilidad entrante.');

insert into public.university_email_domains (university_id, email_domain, is_verified)
select id, 'unsaac.edu.pe', true
from public.universities
where is_unsaac;

-- Consulta de roles usada por las políticas RLS sin provocar recursión.
create function public.has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.code = required_role
  );
$$;

grant execute on function public.has_role(text) to authenticated;

-- Vincula automáticamente una cuenta verificada con su universidad y rol de estudiante.
create function public.assign_default_student_access(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_email text;
  verified_at timestamptz;
  current_status public.account_status;
  linked_university_id uuid;
  is_internal boolean;
  target_email_domain text;
  default_role_id uuid;
begin
  select email, email_verified_at, status, university_id
    into target_email, verified_at, current_status, linked_university_id
  from public.profiles
  where user_id = target_user_id;

  if target_email is null
    or verified_at is null
    or current_status <> 'PENDIENTE'
    or target_email = 'ocri@unsaac.edu.pe'
    or exists (select 1 from public.user_roles where user_id = target_user_id) then
    return;
  end if;

  target_email_domain := lower(split_part(target_email, '@', 2));

  select u.is_unsaac
    into is_internal
  from public.universities u
  join public.university_email_domains d on d.university_id = u.id
  where u.id = linked_university_id
    and u.is_active
    and d.email_domain = target_email_domain
    and d.is_active
    and d.is_verified;

  if is_internal is null then
    return;
  end if;

  select id into default_role_id
  from public.roles
  where code = case when is_internal then 'ESTUDIANTE_UNSAAC' else 'ESTUDIANTE_EXTERNO' end;

  insert into public.user_roles (user_id, role_id)
  values (target_user_id, default_role_id);

  update public.profiles
  set status = 'ACTIVO', updated_at = now()
  where user_id = target_user_id;
end;
$$;

revoke all on function public.assign_default_student_access(uuid)
  from public, anon, authenticated;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(new.email);
  new_email_domain text := lower(split_part(new.email, '@', 2));
  matched_university_id uuid;
begin
  select university_id into matched_university_id
  from public.university_email_domains
  where university_email_domains.email_domain = new_email_domain
    and is_active
    and is_verified;

  insert into public.profiles (
    user_id, email, full_name, university_id, email_verified_at
  )
  values (
    new.id,
    normalized_email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    matched_university_id,
    new.email_confirmed_at
  );

  if new.email_confirmed_at is not null then
    perform public.assign_default_student_access(new.id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create function public.sync_profile_email_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is distinct from old.email_confirmed_at then
    update public.profiles
    set email_verified_at = new.email_confirmed_at,
        updated_at = now()
    where user_id = new.id;

    if new.email_confirmed_at is not null then
      perform public.assign_default_student_access(new.id);
    end if;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute procedure public.sync_profile_email_confirmation();

-- Inicialización única del administrador global después de confirmar su cuenta.
create function public.bootstrap_global_admin()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  admin_user_id uuid;
  admin_role_id uuid;
begin
  select id into admin_user_id
  from auth.users
  where lower(email) = 'ocri@unsaac.edu.pe'
    and email_confirmed_at is not null;

  if admin_user_id is null then
    raise exception 'La cuenta confirmada ocri@unsaac.edu.pe debe existir.';
  end if;
  if exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where r.code = 'ADMIN_OCRI'
  ) then
    raise exception 'El administrador global ya fue inicializado.';
  end if;

  select id into admin_role_id from public.roles where code = 'ADMIN_OCRI';
  insert into public.user_roles (user_id, role_id, assigned_by)
  values (admin_user_id, admin_role_id, admin_user_id);
  update public.profiles set status = 'ACTIVO', updated_at = now()
  where user_id = admin_user_id;
end;
$$;

revoke all on function public.bootstrap_global_admin()
  from public, anon, authenticated;

create function public.admin_set_user_role(target_user_id uuid, target_role_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role_id uuid;
  target_email text;
  target_university_id uuid;
  target_is_unsaac boolean;
  target_email_domain text;
begin
  if auth.uid() is null or not public.has_role('ADMIN_OCRI') then
    raise exception 'Solo ADMIN_OCRI puede asignar roles.' using errcode = '42501';
  end if;

  select email, university_id into target_email, target_university_id
  from public.profiles where user_id = target_user_id;
  if target_email is null then raise exception 'El perfil no existe.'; end if;

  target_role_code := upper(trim(target_role_code));
  target_email_domain := lower(split_part(target_email, '@', 2));
  select id into target_role_id from public.roles where code = target_role_code;
  if target_role_id is null then raise exception 'El rol solicitado no existe.'; end if;

  select is_unsaac into target_is_unsaac
  from public.universities where id = target_university_id and is_active;

  if target_role_code = 'ADMIN_OCRI' and target_email <> 'ocri@unsaac.edu.pe' then
    raise exception 'ADMIN_OCRI está reservado para la cuenta global OCRI.';
  end if;
  if target_role_code in ('ADMIN_OCRI', 'ESTUDIANTE_UNSAAC')
    and coalesce(target_is_unsaac, false) is not true then
    raise exception 'Este rol requiere correo institucional UNSAAC verificado.';
  end if;
  if target_role_code in ('GESTOR_EXTERNO', 'ESTUDIANTE_EXTERNO')
    and (
      target_university_id is null
      or coalesce(target_is_unsaac, false)
      or not exists (
        select 1 from public.university_email_domains d
        where d.university_id = target_university_id
          and d.email_domain = target_email_domain
          and d.is_active and d.is_verified
      )
    ) then
    raise exception 'Este rol requiere un dominio externo aprobado.';
  end if;

  delete from public.user_roles where user_id = target_user_id;
  insert into public.user_roles (user_id, role_id, assigned_by)
  values (target_user_id, target_role_id, auth.uid());
  update public.profiles set status = 'ACTIVO', updated_at = now()
  where user_id = target_user_id;
end;
$$;

create function public.admin_set_account_status(
  target_user_id uuid,
  target_status public.account_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role('ADMIN_OCRI') then
    raise exception 'Solo ADMIN_OCRI puede cambiar el estado.' using errcode = '42501';
  end if;
  if target_user_id = auth.uid() and target_status <> 'ACTIVO' then
    raise exception 'Un administrador no puede suspender su propia cuenta.';
  end if;

  update public.profiles set status = target_status, updated_at = now()
  where user_id = target_user_id;
  if not found then raise exception 'El perfil no existe.'; end if;
end;
$$;

create function public.admin_create_university_with_domain(
  university_name text,
  university_country text,
  institutional_domain text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_university_id uuid;
  normalized_domain text := lower(trim(institutional_domain));
begin
  if auth.uid() is null or not public.has_role('ADMIN_OCRI') then
    raise exception 'Solo ADMIN_OCRI puede aprobar dominios.' using errcode = '42501';
  end if;
  if normalized_domain like '%@%' then
    raise exception 'Ingrese solo el dominio, por ejemplo universidad.edu.';
  end if;

  insert into public.universities (name, country, is_unsaac)
  values (trim(university_name), nullif(trim(university_country), ''), false)
  returning id into new_university_id;
  insert into public.university_email_domains (
    university_id, email_domain, is_verified, is_active
  ) values (new_university_id, normalized_domain, true, true);
  update public.profiles
  set university_id = new_university_id, updated_at = now()
  where lower(split_part(email, '@', 2)) = normalized_domain
    and university_id is null;
  return new_university_id;
end;
$$;

create function public.is_registration_domain_approved(candidate_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.university_email_domains
    where email_domain = lower(split_part(trim(candidate_email), '@', 2))
      and is_active and is_verified
  );
$$;

grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.admin_set_account_status(uuid, public.account_status) to authenticated;
grant execute on function public.admin_create_university_with_domain(text, text, text) to authenticated;
revoke all on function public.is_registration_domain_approved(text) from public;
grant execute on function public.is_registration_domain_approved(text) to anon, authenticated;

alter table public.universities enable row level security;
alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.university_email_domains enable row level security;

create policy "authenticated users can read active universities"
  on public.universities for select to authenticated
  using (is_active or public.has_role('ADMIN_OCRI'));
create policy "authenticated users can read roles"
  on public.roles for select to authenticated using (true);
create policy "authenticated users can read verified domains"
  on public.university_email_domains for select to authenticated
  using ((is_active and is_verified) or public.has_role('ADMIN_OCRI'));
create policy "users can read their own profile"
  on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.has_role('ADMIN_OCRI'));
create policy "users can update their own profile"
  on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users can read their own role assignments"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role('ADMIN_OCRI'));

revoke update on public.profiles from authenticated;
grant update (full_name, password_configured_at, phone, address, photo_path, updated_at)
  on public.profiles to authenticated;

-- Fotos privadas: cada usuario administra únicamente su propia carpeta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos', 'profile-photos', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "users manage their own profile photo"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
