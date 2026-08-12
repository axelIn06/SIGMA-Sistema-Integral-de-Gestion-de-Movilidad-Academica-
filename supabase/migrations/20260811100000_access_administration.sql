-- Administración de acceso para SIGMA OCRI.
-- El bootstrap se ejecuta una sola vez por un operador técnico autorizado.

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
  select id
    into admin_user_id
  from auth.users
  where lower(email) = 'ocri@unsaac.edu.pe'
    and email_confirmed_at is not null;

  if admin_user_id is null then
    raise exception 'The confirmed account ocri@unsaac.edu.pe must exist before bootstrap.';
  end if;

  if exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where r.code = 'ADMIN_OCRI'
  ) then
    raise exception 'A global SIGMA administrator has already been initialized.';
  end if;

  select id into admin_role_id
  from public.roles
  where code = 'ADMIN_OCRI';

  insert into public.user_roles (user_id, role_id, assigned_by)
  values (admin_user_id, admin_role_id, admin_user_id);

  update public.profiles
  set status = 'ACTIVO', updated_at = now()
  where user_id = admin_user_id;
end;
$$;

comment on function public.bootstrap_global_admin() is
  'One-time technical bootstrap for the confirmed global OCRI account. Not callable by web users.';

-- No browser, anonymous user or regular authenticated user can invoke bootstrap.
revoke all on function public.bootstrap_global_admin() from public, anon, authenticated;

create function public.admin_set_user_role(
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
begin
  if auth.uid() is null or not public.has_role('ADMIN_OCRI') then
    raise exception 'Only an OCRI administrator can assign roles.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where user_id = target_user_id) then
    raise exception 'The target profile does not exist.';
  end if;

  select id into target_role_id
  from public.roles
  where code = upper(trim(target_role_code));

  if target_role_id is null then
    raise exception 'The requested role does not exist.';
  end if;

  -- Sprint 1 uses one operational role per account. Multi-role selection
  -- can be introduced later without granting roles from the client.
  delete from public.user_roles where user_id = target_user_id;

  insert into public.user_roles (user_id, role_id, assigned_by)
  values (target_user_id, target_role_id, auth.uid());

  update public.profiles
  set status = 'ACTIVO', updated_at = now()
  where user_id = target_user_id;
end;
$$;

comment on function public.admin_set_user_role(uuid, text) is
  'Assigns one operational role and activates an account. Requires ADMIN_OCRI.';

grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

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
    raise exception 'Only an OCRI administrator can change account status.' using errcode = '42501';
  end if;

  if target_user_id = auth.uid() and target_status <> 'ACTIVO' then
    raise exception 'An administrator cannot suspend or deactivate their own account.';
  end if;

  update public.profiles
  set status = target_status, updated_at = now()
  where user_id = target_user_id;

  if not found then
    raise exception 'The target profile does not exist.';
  end if;
end;
$$;

grant execute on function public.admin_set_account_status(uuid, public.account_status) to authenticated;
