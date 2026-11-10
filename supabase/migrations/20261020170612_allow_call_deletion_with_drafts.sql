-- OCRI puede retirar una convocatoria si solo existen borradores privados.
-- Las postulaciones enviadas y las nominaciones institucionales la protegen.
-- Se devuelven las rutas de archivos de los borradores ya eliminados para
-- quitarlos después mediante Storage API, sin borrar objetos solo en SQL.

create function private.delete_call_with_drafts(target_call_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft_paths text[] := '{}';
begin
  if not public.has_role('ADMIN_OCRI') then
    raise exception 'Solo ADMIN_OCRI puede eliminar convocatorias.' using errcode = '42501';
  end if;

  perform 1 from public.calls where id = target_call_id for update;
  if not found then
    raise exception 'La convocatoria no existe.' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.applications
    where call_id = target_call_id and status <> 'BORRADOR'
  ) then
    raise exception 'No se puede eliminar una convocatoria con postulaciones enviadas.'
      using errcode = '23503';
  end if;

  if exists (
    select 1 from public.incoming_nominations where call_id = target_call_id
  ) then
    raise exception 'No se puede eliminar una convocatoria con nominaciones registradas.'
      using errcode = '23503';
  end if;

  select coalesce(array_agg(distinct document.storage_path), '{}')
    into draft_paths
  from public.application_documents document
  join public.applications application on application.id = document.application_id
  where application.call_id = target_call_id
    and application.status = 'BORRADOR'
    and document.storage_path is not null;

  delete from public.applications
  where call_id = target_call_id and status = 'BORRADOR';

  delete from public.calls where id = target_call_id;
  return draft_paths;
end;
$$;

revoke all on function private.delete_call_with_drafts(uuid) from public, anon;
grant execute on function private.delete_call_with_drafts(uuid) to authenticated;

create function public.admin_delete_call_with_drafts(target_call_id uuid)
returns text[]
language sql
security invoker
set search_path = ''
as $$
  select private.delete_call_with_drafts(target_call_id);
$$;

revoke all on function public.admin_delete_call_with_drafts(uuid) from public, anon;
grant execute on function public.admin_delete_call_with_drafts(uuid) to authenticated;

create policy "OCRI removes orphaned draft files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'application-documents'
    and public.has_role('ADMIN_OCRI')
    and not exists (
      select 1 from public.applications application
      where application.id::text = (storage.foldername(name))[2]
    )
  );
