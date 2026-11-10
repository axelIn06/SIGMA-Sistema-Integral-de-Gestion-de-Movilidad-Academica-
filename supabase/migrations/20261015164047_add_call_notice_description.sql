-- Texto introductorio de Adicionales, independiente de sus viñetas enlazables.
alter table public.call_notices add column description text;

comment on column public.call_notices.description is
  'Descripción opcional que precede las viñetas y enlaces adicionales de una convocatoria.';

-- El RPC anterior se mantiene para clientes existentes. Este conserva ambos
-- tipos de enlace y guarda la descripción aun cuando no haya viñetas.
create function public.admin_upsert_enriched_call(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_call_id uuid;
  notice_description text;
begin
  saved_call_id := public.admin_upsert_linked_call(payload);
  notice_description := nullif(btrim(payload #>> '{notice,description}'), '');

  if notice_description is not null then
    insert into public.call_notices (call_id, description)
    values (saved_call_id, notice_description)
    on conflict (call_id) do update
      set description = excluded.description;
  end if;

  return saved_call_id;
end;
$$;

revoke all on function public.admin_upsert_enriched_call(jsonb) from public, anon;
grant execute on function public.admin_upsert_enriched_call(jsonb) to authenticated;
