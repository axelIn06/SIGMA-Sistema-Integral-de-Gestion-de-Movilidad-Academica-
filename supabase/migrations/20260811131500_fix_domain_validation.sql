-- Corrects domain variable resolution and links accounts created before
-- automatic university matching was introduced.

update public.profiles p
set university_id = d.university_id,
    updated_at = now()
from public.university_email_domains d
where lower(split_part(p.email, '@', 2)) = d.email_domain
  and d.is_active = true
  and d.is_verified = true
  and p.university_id is null;

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

  select email, university_id
    into target_email, target_university_id
  from public.profiles
  where user_id = target_user_id;

  if target_email is null then
    raise exception 'The target profile does not exist.';
  end if;

  target_role_code := upper(trim(target_role_code));
  target_email_domain := lower(split_part(target_email, '@', 2));

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
        from public.university_email_domains d
        where d.university_id = target_university_id
          and d.email_domain = target_email_domain
          and d.is_active = true
          and d.is_verified = true
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
