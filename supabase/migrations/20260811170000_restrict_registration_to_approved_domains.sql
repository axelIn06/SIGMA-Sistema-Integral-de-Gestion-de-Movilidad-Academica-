-- Permite iniciar el registro únicamente con dominios institucionales activos
-- y previamente aprobados por OCRI.
create function public.is_registration_domain_approved(candidate_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.university_email_domains
    where email_domain = lower(split_part(trim(candidate_email), '@', 2))
      and is_active = true
      and is_verified = true
  );
$$;

revoke all on function public.is_registration_domain_approved(text) from public;
grant execute on function public.is_registration_domain_approved(text) to anon, authenticated;
