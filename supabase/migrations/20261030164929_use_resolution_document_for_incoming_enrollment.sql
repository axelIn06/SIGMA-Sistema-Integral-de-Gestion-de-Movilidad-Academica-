-- El código figura en la resolución adjunta; SGME ya no exige transcribirlo.
-- Se mantiene la firma del RPC para clientes existentes, ignorando enrollment_code.
create or replace function private.enforce_incoming_application_flow()
returns trigger language plpgsql security definer set search_path = '' as $$
declare direction_value text;
begin
  select direction into direction_value from public.calls where id = new.call_id;
  if direction_value <> 'ENTRANTE' then
    if new.status = 'MATRICULA_HABILITADA' then
      raise exception 'Esta etapa corresponde solo a SGME.' using errcode = '22023';
    end if;
    return new;
  end if;
  if new.status is not distinct from old.status then return new; end if;
  if old.status in ('RECHAZADA', 'FINALIZADA', 'CANCELADO') then
    raise exception 'El resultado es definitivo y no admite reapertura.' using errcode = '22023';
  end if;
  if not (
    (old.status = 'BORRADOR' and new.status = 'ENVIADA')
    or (old.status in ('ENVIADA', 'OBSERVADA') and new.status in ('OBSERVADA', 'ENVIADA', 'RECHAZADA', 'ADMITIDO_UNSAAC'))
    or (old.status = 'ADMITIDO_UNSAAC' and new.status in ('MATRICULA_HABILITADA', 'CANCELADO'))
    or (old.status = 'MATRICULA_HABILITADA' and new.status in ('EN_MOVILIDAD', 'CANCELADO'))
    or (old.status = 'EN_MOVILIDAD' and new.status in ('FINALIZADA', 'CANCELADO'))
    or (new.status = 'CANCELADO' and old.status in ('BORRADOR', 'ENVIADA', 'OBSERVADA'))
  ) then
    raise exception 'Ese cambio no corresponde al flujo de movilidad entrante.' using errcode = '22023';
  end if;
  if new.status in ('ADMITIDO_UNSAAC', 'MATRICULA_HABILITADA', 'EN_MOVILIDAD') then
    if not exists (
      select 1 from public.acceptance_letters letter
      join storage.objects object on object.bucket_id = 'acceptance-letters' and object.name = letter.storage_path
      where letter.application_id = new.id and letter.status = 'VALIDADA'
    ) then
      raise exception 'Adjunta la carta oficial de aceptación antes de continuar.' using errcode = '22023';
    end if;
  end if;
  if new.status in ('MATRICULA_HABILITADA', 'EN_MOVILIDAD') and (
    not exists (
      select 1 from public.incoming_official_documents document
      join storage.objects object on object.bucket_id = 'incoming-official-documents' and object.name = document.storage_path
      where document.application_id = new.id and document.document_type = 'RESOLUCION_MATRICULA'
    )
  ) then
    raise exception 'Adjunta la resolución de matrícula antes de iniciar la movilidad.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_incoming_application_flow() from public, anon, authenticated;

create or replace function private.save_incoming_stage_document(
  target uuid, kind text, path text, filename text, enrollment_code text, note text
) returns void language plpgsql security definer set search_path = '' as $$
declare current_status text; direction_value text; bucket text;
begin
  if auth.uid() is null or not public.has_role('ADMIN_OCRI') then
    raise exception 'Solo OCRI puede adjuntar documentos oficiales.' using errcode = '42501';
  end if;
  select application.status, call.direction into current_status, direction_value
  from public.applications application join public.calls call on call.id = application.call_id
  where application.id = target for update of application;
  if not found or direction_value <> 'ENTRANTE' then
    raise exception 'No se encontró el expediente SGME.' using errcode = 'P0002';
  end if;
  if not (
    (kind = 'ACEPTACION_UNSAAC' and current_status in ('ENVIADA', 'OBSERVADA', 'ADMITIDO_UNSAAC'))
    or (kind = 'RESOLUCION_MATRICULA' and current_status in ('ADMITIDO_UNSAAC', 'MATRICULA_HABILITADA'))
    or (kind = 'CARTA_NO_APTO' and current_status = 'RECHAZADA')
    or (kind = 'GUIA_SUBSANACION' and current_status = 'OBSERVADA')
  ) then
    raise exception 'El documento no corresponde a la etapa actual.' using errcode = '22023';
  end if;
  bucket := case when kind = 'ACEPTACION_UNSAAC' then 'acceptance-letters' else 'incoming-official-documents' end;
  if path is null or split_part(path, '/', 1) <> target::text
    or (kind <> 'ACEPTACION_UNSAAC' and split_part(path, '/', 2) <> kind)
    or not exists (select 1 from storage.objects object where object.bucket_id = bucket and object.name = path)
    or nullif(btrim(filename), '') is null then
    raise exception 'No se encontró el PDF adjunto a este expediente.' using errcode = 'P0002';
  end if;
  if kind = 'ACEPTACION_UNSAAC' then
    insert into public.acceptance_letters(application_id, storage_path, file_name, status, comment)
    values (target, path, filename, 'VALIDADA', coalesce(btrim(note), ''))
    on conflict (application_id) do update set storage_path = excluded.storage_path,
      file_name = excluded.file_name, status = 'VALIDADA', comment = excluded.comment, updated_at = now();
    update public.applications set status = 'ADMITIDO_UNSAAC', status_note = coalesce(btrim(note), '') where id = target;
  else
    insert into public.incoming_official_documents(application_id, document_type, storage_path, file_name, uploaded_by)
    values (target, kind, path, filename, auth.uid())
    on conflict (application_id, document_type) do update set storage_path = excluded.storage_path,
      file_name = excluded.file_name, uploaded_by = excluded.uploaded_by, uploaded_at = now();
    if kind = 'RESOLUCION_MATRICULA' then
      update public.applications set status = 'MATRICULA_HABILITADA', status_note = coalesce(btrim(note), '') where id = target;
    end if;
  end if;
end;
$$;
revoke all on function private.save_incoming_stage_document(uuid,text,text,text,text,text) from public, anon;
grant execute on function private.save_incoming_stage_document(uuid,text,text,text,text,text) to authenticated;


notify pgrst, 'reload schema';
