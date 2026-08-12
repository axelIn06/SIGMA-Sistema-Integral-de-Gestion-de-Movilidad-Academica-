-- Las cuentas verificadas reciben el rol base automáticamente según su
-- universidad. Los roles de gestión se obtienen únicamente por solicitud.

insert into public.roles (code, name, description)
values ('GESTOR_OCRI', 'Gestor OCRI', 'Gestiona procesos operativos de OCRI sin administrar la plataforma.')
on conflict (code) do nothing;

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

  -- Never changes approved, suspended or administrator accounts.
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
    and u.is_active = true
    and d.email_domain = target_email_domain
    and d.is_active = true
    and d.is_verified = true;

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

revoke all on function public.assign_default_student_access(uuid) from public, anon, authenticated;

create or replace function public.sync_profile_email_confirmation()
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

-- Applies the same default rule to verified accounts created before this change.
select public.assign_default_student_access(user_id)
from public.profiles;

create or replace function public.admin_set_user_role(
  target_user_id uuid,
  target_role_code text
)
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
    raise exception 'Only an OCRI administrator can assign roles.' using errcode = '42501';
  end if;

  select email, university_id into target_email, target_university_id
  from public.profiles where user_id = target_user_id;
  if target_email is null then raise exception 'The target profile does not exist.'; end if;

  target_role_code := upper(trim(target_role_code));
  target_email_domain := lower(split_part(target_email, '@', 2));
  select id into target_role_id from public.roles where code = target_role_code;
  if target_role_id is null then raise exception 'The requested role does not exist.'; end if;

  select is_unsaac into target_is_unsaac
  from public.universities where id = target_university_id and is_active = true;

  if target_role_code = 'ADMIN_OCRI' and target_email <> 'ocri@unsaac.edu.pe' then
    raise exception 'ADMIN_OCRI is reserved for the global OCRI account.';
  end if;

  if target_role_code in ('ADMIN_OCRI', 'EVALUADOR_OCRI', 'GESTOR_OCRI', 'ESTUDIANTE_UNSAAC')
    and coalesce(target_is_unsaac, false) is not true then
    raise exception 'This role requires a verified UNSAAC institutional email.';
  end if;

  if target_role_code in ('GESTOR_EXTERNO', 'ESTUDIANTE_EXTERNO')
    and (
      target_university_id is null or coalesce(target_is_unsaac, false)
      or not exists (
        select 1 from public.university_email_domains d
        where d.university_id = target_university_id
          and d.email_domain = target_email_domain
          and d.is_active = true and d.is_verified = true
      )
    ) then
    raise exception 'This external role requires a verified domain linked to an approved university.';
  end if;

  delete from public.user_roles where user_id = target_user_id;
  insert into public.user_roles (user_id, role_id, assigned_by)
  values (target_user_id, target_role_id, auth.uid());
  update public.profiles set status = 'ACTIVO', updated_at = now() where user_id = target_user_id;
end;
$$;

create type public.role_request_status as enum ('PENDIENTE', 'APROBADA', 'RECHAZADA');

create table public.role_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  requested_role_id uuid not null references public.roles(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 20 and 1000),
  status public.role_request_status not null default 'PENDIENTE',
  reviewed_by uuid references public.profiles(user_id) on delete set null,
  reviewed_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

create unique index role_change_requests_one_pending_idx
  on public.role_change_requests (user_id, requested_role_id)
  where status = 'PENDIENTE';

create function public.validate_role_change_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare requested_code text;
begin
  select code into requested_code from public.roles where id = new.requested_role_id;
  if requested_code not in ('EVALUADOR_OCRI', 'GESTOR_OCRI', 'GESTOR_EXTERNO') then
    raise exception 'Only elevated management roles can be requested.';
  end if;
  return new;
end;
$$;

create trigger role_change_request_is_elevated
  before insert on public.role_change_requests
  for each row execute procedure public.validate_role_change_request();

alter table public.role_change_requests enable row level security;
grant select, insert on public.role_change_requests to authenticated;
grant update on public.role_change_requests to authenticated;

create policy "users can read their own role requests"
  on public.role_change_requests for select to authenticated
  using (user_id = auth.uid() or public.has_role('ADMIN_OCRI'));

create policy "users can request their own elevated role"
  on public.role_change_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'PENDIENTE');

create policy "administrators can review role requests"
  on public.role_change_requests for update to authenticated
  using (public.has_role('ADMIN_OCRI'))
  with check (public.has_role('ADMIN_OCRI'));

create function public.admin_decide_role_request(
  request_id uuid,
  approve boolean,
  review_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare target_user_id uuid; target_role_code text;
begin
  if auth.uid() is null or not public.has_role('ADMIN_OCRI') then
    raise exception 'Only an OCRI administrator can decide role requests.' using errcode = '42501';
  end if;
  select rr.user_id, r.code into target_user_id, target_role_code
  from public.role_change_requests rr join public.roles r on r.id = rr.requested_role_id
  where rr.id = request_id and rr.status = 'PENDIENTE';
  if target_user_id is null then raise exception 'The pending role request does not exist.'; end if;
  if approve then perform public.admin_set_user_role(target_user_id, target_role_code); end if;
  update public.role_change_requests
  set status = case when approve then 'APROBADA'::public.role_request_status else 'RECHAZADA'::public.role_request_status end,
      reviewed_by = auth.uid(), reviewed_at = now(), decision_note = nullif(trim(review_note), '')
  where id = request_id;
end;
$$;

grant execute on function public.admin_decide_role_request(uuid, boolean, text) to authenticated;
