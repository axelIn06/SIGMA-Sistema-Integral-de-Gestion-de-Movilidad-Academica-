-- La carta cargada acredita que existe una respuesta positiva, pero OCRI debe
-- comprobar su validez antes de confirmar la aceptación definitiva.
create or replace function public.save_acceptance_letter(target uuid, path text, filename text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  application public.applications;
  direction_value text;
begin
  select * into application from public.applications where id = target for update;
  select direction into direction_value from public.calls where id = application.call_id;
  if auth.uid() is null or not coalesce((
    public.has_role('ADMIN_OCRI')
      and application.status in ('NOMINADO_UNSAAC', 'CARTA_PENDIENTE', 'ACEPTADO')
    or application.applicant_id = auth.uid()
      and direction_value = 'SALIENTE'
      and application.status in ('NOMINADO_UNSAAC', 'CARTA_PENDIENTE')
  ), false) then
    raise exception 'No autorizado para adjuntar la carta en esta etapa';
  end if;
  if split_part(path, '/', 1) <> target::text
    or not exists (select 1 from storage.objects where bucket_id = 'acceptance-letters' and name = path) then
    raise exception 'Archivo no encontrado';
  end if;
  insert into public.acceptance_letters(application_id, storage_path, file_name, status)
  values(target, path, filename, 'PENDIENTE')
  on conflict(application_id) do update
    set storage_path = excluded.storage_path,
        file_name = excluded.file_name,
        status = 'PENDIENTE',
        comment = '',
        updated_at = now();
  if direction_value = 'SALIENTE' and application.status <> 'CARTA_PENDIENTE' then
    update public.applications
    set status = 'CARTA_PENDIENTE',
        status_note = 'Carta de aceptación cargada; pendiente de validación por OCRI.'
    where id = target;
  end if;
end;
$$;
revoke all on function public.save_acceptance_letter(uuid, text, text) from public, anon;
grant execute on function public.save_acceptance_letter(uuid, text, text) to authenticated;
