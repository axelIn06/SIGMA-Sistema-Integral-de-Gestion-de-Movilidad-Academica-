-- SIGMA OCRI: identidad institucional, roles y dominios autorizados.
-- Las asignaciones de roles se administran desde el servidor con la service role.

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

comment on table public.universities is 'Universidades vinculadas a movilidad académica.';

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
  email_domain text not null,
  is_verified boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (email_domain),
  constraint university_email_domains_normalized check (
    email_domain = lower(email_domain)
    and email_domain ~ '^[a-z0-9.-]+[.][a-z]{2,}$'
  )
);

create index profiles_university_id_idx on public.profiles(university_id);
create index user_roles_role_id_idx on public.user_roles(role_id);
create index university_email_domains_university_id_idx on public.university_email_domains(university_id);

-- Creates the public profile immediately after Supabase Auth creates a user.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, full_name, email_verified_at)
  values (
    new.id,
    lower(new.email),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    new.email_confirmed_at
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Used only in RLS policies. SECURITY DEFINER prevents role-policy recursion.
create function public.has_role(required_role text)
returns boolean
language sql
stable
security definer set search_path = public
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

alter table public.universities enable row level security;
alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.university_email_domains enable row level security;

-- Catálogos visibles únicamente para usuarios autenticados.
create policy "authenticated users can read active universities"
  on public.universities for select to authenticated
  using (is_active or public.has_role('ADMIN_OCRI'));

create policy "authenticated users can read roles"
  on public.roles for select to authenticated
  using (true);

create policy "authenticated users can read verified domains"
  on public.university_email_domains for select to authenticated
  using ((is_active and is_verified) or public.has_role('ADMIN_OCRI'));

-- Un usuario solo consulta y actualiza su propio perfil. El servidor controla
-- las asignaciones de universidad y el estado de la cuenta.
create policy "users can read their own profile"
  on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.has_role('ADMIN_OCRI'));

create policy "users can update their own profile"
  on public.profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users can read their own role assignments"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role('ADMIN_OCRI'));

-- Seed mínimo para desarrollo. Los dominios reales se validarán con OCRI.
insert into public.universities (name, country, is_unsaac)
values ('Universidad Nacional de San Antonio Abad del Cusco', 'Perú', true);

insert into public.roles (code, name, description)
values
  ('ADMIN_OCRI', 'Administrador OCRI', 'Configura y supervisa SIGMA OCRI.'),
  ('EVALUADOR_OCRI', 'Evaluador OCRI', 'Revisa expedientes asignados.'),
  ('ESTUDIANTE_UNSAAC', 'Estudiante UNSAAC', 'Postula a movilidad saliente.'),
  ('GESTOR_EXTERNO', 'Gestor externo', 'Gestiona nominaciones de una universidad externa.'),
  ('ESTUDIANTE_EXTERNO', 'Estudiante externo', 'Postula a movilidad entrante.');

insert into public.university_email_domains (university_id, email_domain, is_verified)
select id, 'unsaac.edu.pe', true
from public.universities
where is_unsaac = true;
