-- Los avisos del apartado «Importante» se distinguen de los pasos adicionales.
-- Las filas anteriores siguen siendo Adicionales para no reclasificarlas sin certeza.
alter table public.call_notice_links
  add column kind text not null default 'ADDITIONAL'
  check (kind in ('ADDITIONAL', 'IMPORTANT'));

comment on column public.call_notice_links.kind is
  'Sección de presentación: aviso importante o paso/información adicional.';

create function public.admin_upsert_categorized_call(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_call_id uuid;
begin
  saved_call_id := public.admin_upsert_enriched_call(payload);

  update public.call_notice_links as link
  set kind = case
    when upper(coalesce(notice.value ->> 'kind', '')) = 'IMPORTANT' then 'IMPORTANT'
    else 'ADDITIONAL'
  end
  from public.call_notices as parent,
       jsonb_array_elements(coalesce(payload #> '{notice,links}', '[]'::jsonb))
         with ordinality as notice(value, position)
  where parent.call_id = saved_call_id
    and link.notice_id = parent.id
    and link.display_order = notice.position - 1;

  return saved_call_id;
end;
$$;

revoke all on function public.admin_upsert_categorized_call(jsonb) from public, anon;
grant execute on function public.admin_upsert_categorized_call(jsonb) to authenticated;
