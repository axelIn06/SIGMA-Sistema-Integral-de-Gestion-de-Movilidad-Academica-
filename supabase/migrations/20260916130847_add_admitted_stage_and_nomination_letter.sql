-- Separa la admisión institucional de la nominación formal. El expediente
-- solo pasa a NOMINADO_UNSAAC cuando OCRI adjunta el oficio correspondiente.

alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check check (status in (
  'BORRADOR', 'ENVIADA', 'EN_REVISION_DOCUMENTAL', 'OBSERVADA', 'APROBADA_OCRI',
  'ADMITIDO_UNSAAC', 'RECHAZADA', 'FINALIZADA', 'NOMINADO_UNSAAC',
  'EN_EVALUACION_DESTINO', 'CARTA_PENDIENTE', 'ACEPTADO',
  'NO_ACEPTADO_DESTINO', 'EN_MOVILIDAD', 'DOCUMENTACION_RETORNO', 'CANCELADO'
));

create table public.nomination_letters (
  application_id uuid primary key references public.applications(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  uploaded_at timestamptz not null default now()
);

comment on table public.nomination_letters is
  'Oficio de nominación formal adjuntado por OCRI para una movilidad saliente.';

alter table public.nomination_letters enable row level security;
revoke all on public.nomination_letters from anon, authenticated;
grant select on public.nomination_letters to authenticated;

create policy "students and OCRI read nomination letters"
  on public.nomination_letters for select to authenticated
  using (
    public.has_role('ADMIN_OCRI')
    or exists (
      select 1 from public.applications application
      where application.id = application_id
        and application.applicant_id = (select auth.uid())
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nomination-letters', 'nomination-letters', false, 10485760,
  array['application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "students and OCRI read nomination files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'nomination-letters'
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and exists (
      select 1 from public.applications application
      where application.id::text = split_part(name, '/', 1)
        and (
          application.applicant_id = (select auth.uid())
          or public.has_role('ADMIN_OCRI')
        )
    )
  );

create policy "OCRI uploads nomination files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'nomination-letters'
    and public.has_role('ADMIN_OCRI')
    and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    and exists (
      select 1 from public.applications application
      join public.calls call on call.id = application.call_id
      where application.id::text = split_part(name, '/', 1)
        and call.direction = 'SALIENTE'
        and application.status in ('ADMITIDO_UNSAAC', 'NOMINADO_UNSAAC')
    )
  );

create function public.save_nomination_letter(target uuid, path text, filename text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  application_status text;
begin
  if auth.uid() is null or not public.has_role('ADMIN_OCRI') then
    raise exception 'Solo OCRI puede registrar el oficio de nominación.' using errcode = '42501';
  end if;

  select status into application_status
  from public.applications
  where id = target
  for update;

  if application_status not in ('ADMITIDO_UNSAAC', 'NOMINADO_UNSAAC') then
    raise exception 'Primero debes admitir al estudiante por la UNSAAC.' using errcode = '22023';
  end if;

  if split_part(path, '/', 1) <> target::text
    or not exists (
      select 1 from storage.objects
      where bucket_id = 'nomination-letters' and name = path
    ) then
    raise exception 'No se encontró el oficio cargado.' using errcode = 'P0002';
  end if;

  insert into public.nomination_letters (application_id, storage_path, file_name)
  values (target, path, filename)
  on conflict (application_id) do update
  set storage_path = excluded.storage_path,
      file_name = excluded.file_name,
      uploaded_at = now();

  if application_status = 'ADMITIDO_UNSAAC' then
    update public.applications
    set status = 'NOMINADO_UNSAAC',
        status_note = 'OCRI adjuntó el oficio de nominación.'
    where id = target;
  end if;
end;
$$;

revoke all on function public.save_nomination_letter(uuid, text, text) from public, anon;
grant execute on function public.save_nomination_letter(uuid, text, text) to authenticated;
