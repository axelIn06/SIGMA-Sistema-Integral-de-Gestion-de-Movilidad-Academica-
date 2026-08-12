-- El correo se verifica mediante enlace únicamente al crear o recuperar una cuenta.
-- Todo ingreso ordinario se realiza con correo y contraseña.

alter table public.profiles
  add column password_configured_at timestamptz;

comment on column public.profiles.password_configured_at is
  'Timestamp recorded after the user configures a password following verified email access.';

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
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute procedure public.sync_profile_email_confirmation();

-- Synchronizes profiles created before this confirmation trigger existed.
update public.profiles p
set email_verified_at = u.email_confirmed_at,
    updated_at = now()
from auth.users u
where u.id = p.user_id
  and u.email_confirmed_at is not null
  and p.email_verified_at is distinct from u.email_confirmed_at;
