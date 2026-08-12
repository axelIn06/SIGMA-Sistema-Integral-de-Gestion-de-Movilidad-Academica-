-- Vincula cuentas a universidades únicamente por dominios institucionales
-- previamente aprobados por OCRI.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(new.email);
  v_email_domain text := lower(split_part(new.email, '@', 2));
  matched_university_id uuid;
begin
  select university_id
    into matched_university_id
  from public.university_email_domains
  where university_email_domains.email_domain = v_email_domain
    and is_active = true
    and is_verified = true;

  insert into public.profiles (
    user_id,
    email,
    full_name,
    university_id,
    email_verified_at
  )
  values (
    new.id,
    normalized_email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    matched_university_id,
    new.email_confirmed_at
  );
  return new;
end;
$$;

-- Users may only change harmless profile fields. University, account status,
-- email verification and roles are server-controlled.
revoke update on public.profiles from authenticated;
grant update (full_name, password_configured_at) on public.profiles to authenticated;

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
  email_domain text;
begin
  if auth.uid() is null or not public.has_role('ADMIN_OCRI') then
    raise exception 'Only an OCRI administrator can assign roles.' using errcode = '42501';
  end if;

  select email, university_id
    into target_email, target_university_id
  from public.profiles
  where user_id = target_user_id;

  if target_email is null then
    raise exception 'The target profile does not exist.';
  end if;

  target_role_code := upper(trim(target_role_code));
  email_domain := lower(split_part(target_email, '@', 2));

  select id into target_role_id
  from public.roles
  where code = target_role_code;

  if target_role_id is null then
    raise exception 'The requested role does not exist.';
  end if;

  select is_unsaac into target_is_unsaac
  from public.universities
  where id = target_university_id
    and is_active = true;

  if target_role_code = 'ADMIN_OCRI' and target_email <> 'ocri@unsaac.edu.pe' then
    raise exception 'ADMIN_OCRI is reserved for the global OCRI account.';
  end if;

  if target_role_code in ('ADMIN_OCRI', 'EVALUADOR_OCRI', 'ESTUDIANTE_UNSAAC')
    and coalesce(target_is_unsaac, false) is not true then
    raise exception 'This role requires a verified UNSAAC institutional email.';
  end if;

  if target_role_code in ('GESTOR_EXTERNO', 'ESTUDIANTE_EXTERNO')
    and (
      target_university_id is null
      or coalesce(target_is_unsaac, false)
      or not exists (
        select 1
        from public.university_email_domains
        where university_id = target_university_id
          and email_domain = email_domain
          and is_active = true
          and is_verified = true
      )
    ) then
    raise exception 'This external role requires a verified domain linked to an approved university.';
  end if;

  delete from public.user_roles where user_id = target_user_id;

  insert into public.user_roles (user_id, role_id, assigned_by)
  values (target_user_id, target_role_id, auth.uid());

  update public.profiles
  set status = 'ACTIVO', updated_at = now()
  where user_id = target_user_id;
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
    raise exception 'Only an OCRI administrator can approve university domains.' using errcode = '42501';
  end if;

  if normalized_domain like '%@%' then
    raise exception 'Store only the domain, for example universidad.edu.';
  end if;

  insert into public.universities (name, country, is_unsaac)
  values (trim(university_name), nullif(trim(university_country), ''), false)
  returning id into new_university_id;

  insert into public.university_email_domains (university_id, email_domain, is_verified, is_active)
  values (new_university_id, normalized_domain, true, true);

  -- Links existing pending accounts of that domain; it never activates them.
  update public.profiles
  set university_id = new_university_id,
      updated_at = now()
  where lower(split_part(email, '@', 2)) = normalized_domain
    and university_id is null;

  return new_university_id;
end;
$$;

grant execute on function public.admin_create_university_with_domain(text, text, text) to authenticated;
