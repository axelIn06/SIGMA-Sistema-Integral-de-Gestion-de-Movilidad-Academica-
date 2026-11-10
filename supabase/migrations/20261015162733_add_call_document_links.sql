-- Cada documento puede enlazar su formato o formulario oficial sin mezclarlo
-- con los materiales generales ni con los pasos adicionales.
alter table public.call_requirements
  add column source_url text;

alter table public.call_requirements
  add constraint call_requirements_source_url_format
  check (source_url is null or (char_length(source_url) <= 2048 and source_url ~* '^https?://'));

comment on column public.call_requirements.source_url is
  'Enlace opcional al formato o formulario correspondiente a este documento.';

-- Conserva la transacción de creación existente y agrega los enlaces por el
-- mismo orden de documentos, incluidos los editados. El RPC original sigue
-- disponible para clientes anteriores.
create function public.admin_upsert_linked_call(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_call_id uuid;
begin
  saved_call_id := public.admin_upsert_classified_call(payload);

  update public.call_requirements as requirement
  set source_url = nullif(btrim(document.value ->> 'url'), '')
  from jsonb_array_elements(coalesce(payload -> 'documents', '[]'::jsonb))
       with ordinality as document(value, position)
  where requirement.call_id = saved_call_id
    and requirement.display_order = document.position - 1;

  return saved_call_id;
end;
$$;

revoke all on function public.admin_upsert_linked_call(jsonb) from public, anon;
grant execute on function public.admin_upsert_linked_call(jsonb) to authenticated;
