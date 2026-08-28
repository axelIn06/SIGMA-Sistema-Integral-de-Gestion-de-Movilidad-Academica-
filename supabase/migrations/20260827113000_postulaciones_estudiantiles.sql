-- SIGMA OCRI: borradores y envío de postulaciones estudiantiles.
-- Esta migración agrega una funcionalidad nueva sobre las convocatorias ya
-- consolidadas. Los expedientes y sus archivos dejan de depender de localStorage.

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete restrict,
  applicant_id uuid not null references public.profiles(user_id) on delete restrict,
  status text not null default 'BORRADOR'
    check (status in (
      'BORRADOR', 'ENVIADA', 'EN_REVISION_DOCUMENTAL', 'OBSERVADA',
      'APROBADA_OCRI', 'RECHAZADA', 'FINALIZADA'
    )),
  student_code text,
  faculty text,
  academic_program text,
  motivation text,
  current_step smallint not null default 1 check (current_step between 1 and 4),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (call_id, applicant_id)
);

create table public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  requirement_id uuid references public.call_requirements(id) on delete set null,
  requirement_title text not null,
  is_required boolean not null default true,
  storage_path text,
  file_name text,
  status text not null default 'PENDIENTE'
    check (status in ('PENDIENTE', 'SUBIDO', 'APROBADO', 'OBSERVADO')),
  reviewer_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, requirement_id)
);

create index applications_applicant_status_idx
  on public.applications(applicant_id, status);
create index applications_call_status_idx
  on public.applications(call_id, status);
create index application_documents_application_idx
  on public.application_documents(application_id);

comment on table public.applications is
  'Postulaciones vinculadas a una cuenta y convocatoria; BORRADOR permite continuar después.';
comment on table public.application_documents is
  'Documentos privados que responden a los documentos solicitados por la convocatoria.';

create function public.set_application_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute procedure public.set_application_updated_at();

create trigger application_documents_set_updated_at
  before update on public.application_documents
  for each row execute procedure public.set_application_updated_at();

-- Impide enviar expedientes incompletos incluso si alguien intenta omitir la UI.
create function public.validate_application_submission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'ENVIADA' and old.status = 'BORRADOR' then
    if coalesce(trim(new.student_code), '') = ''
      or coalesce(trim(new.faculty), '') = ''
      or coalesce(trim(new.academic_program), '') = ''
      or coalesce(trim(new.motivation), '') = '' then
      raise exception 'Completa los datos académicos y la presentación antes de enviar.'
        using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.profiles p
      where p.user_id = new.applicant_id and p.photo_path is not null
    ) then
      raise exception 'La foto de perfil es obligatoria antes de enviar.'
        using errcode = '22023';
    end if;

    if exists (
      select 1 from public.application_documents d
      where d.application_id = new.id
        and d.is_required
        and (
          d.storage_path is null
          or not exists (
            select 1 from storage.objects o
            where o.bucket_id = 'application-documents' and o.name = d.storage_path
          )
        )
    ) then
      raise exception 'Aún faltan documentos obligatorios.' using errcode = '22023';
    end if;

    new.submitted_at = now();
    new.current_step = 4;
  end if;
  return new;
end;
$$;

create trigger applications_validate_submission
  before update of status on public.applications
  for each row execute procedure public.validate_application_submission();

alter table public.applications enable row level security;
alter table public.application_documents enable row level security;

create policy "applicants read their applications"
  on public.applications for select to authenticated
  using (applicant_id = auth.uid() or public.has_role('ADMIN_OCRI'));

create policy "UNSAAC students create outgoing application drafts"
  on public.applications for insert to authenticated
  with check (
    applicant_id = auth.uid()
    and status = 'BORRADOR'
    and public.has_role('ESTUDIANTE_UNSAAC')
    and exists (
      select 1 from public.calls c
      where c.id = call_id and c.direction = 'SALIENTE' and c.status = 'ACTIVA'
    )
  );

create policy "applicants update their application drafts"
  on public.applications for update to authenticated
  using (applicant_id = auth.uid() and status = 'BORRADOR')
  with check (applicant_id = auth.uid() and status in ('BORRADOR', 'ENVIADA'));

create policy "OCRI administrators manage applications"
  on public.applications for all to authenticated
  using (public.has_role('ADMIN_OCRI'))
  with check (public.has_role('ADMIN_OCRI'));

create policy "applicants read their application documents"
  on public.application_documents for select to authenticated
  using (
    public.has_role('ADMIN_OCRI')
    or exists (
      select 1 from public.applications a
      where a.id = application_id and a.applicant_id = auth.uid()
    )
  );

create policy "applicants add documents to their drafts"
  on public.application_documents for insert to authenticated
  with check (
    exists (
      select 1 from public.applications a
      where a.id = application_id and a.applicant_id = auth.uid() and a.status = 'BORRADOR'
    )
  );

create policy "applicants update documents in their drafts"
  on public.application_documents for update to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_id and a.applicant_id = auth.uid() and a.status = 'BORRADOR'
    )
  )
  with check (
    exists (
      select 1 from public.applications a
      where a.id = application_id and a.applicant_id = auth.uid() and a.status = 'BORRADOR'
    )
  );

create policy "OCRI administrators manage application documents"
  on public.application_documents for all to authenticated
  using (public.has_role('ADMIN_OCRI'))
  with check (public.has_role('ADMIN_OCRI'));

revoke all on public.applications, public.application_documents from anon;
grant select, insert, update, delete on public.applications to authenticated;
grant select, insert, delete on public.application_documents to authenticated;
grant update (storage_path, file_name, status) on public.application_documents to authenticated;

-- Crea o actualiza el borrador y sincroniza la lista de documentos solicitados.
create function public.student_save_application_draft(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  application_id_value uuid;
  call_id_value uuid := nullif(payload ->> 'callId', '')::uuid;
begin
  if not public.has_role('ESTUDIANTE_UNSAAC') then
    raise exception 'Solo un estudiante UNSAAC puede iniciar esta postulación.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.calls c
    where c.id = call_id_value and c.direction = 'SALIENTE' and c.status = 'ACTIVA'
  ) then
    raise exception 'La convocatoria no está disponible para postular.' using errcode = '22023';
  end if;

  insert into public.applications (
    call_id, applicant_id, student_code, faculty, academic_program,
    motivation, current_step, status
  ) values (
    call_id_value,
    auth.uid(),
    nullif(trim(payload ->> 'studentCode'), ''),
    nullif(trim(payload ->> 'faculty'), ''),
    nullif(trim(payload ->> 'academicProgram'), ''),
    nullif(trim(payload ->> 'motivation'), ''),
    greatest(1, least(coalesce((payload ->> 'currentStep')::smallint, 1), 4)),
    'BORRADOR'
  )
  on conflict (call_id, applicant_id) do update
    set student_code = excluded.student_code,
        faculty = excluded.faculty,
        academic_program = excluded.academic_program,
        motivation = excluded.motivation,
        current_step = greatest(public.applications.current_step, excluded.current_step)
    where public.applications.status = 'BORRADOR'
  returning id into application_id_value;

  if application_id_value is null then
    raise exception 'La postulación ya fue enviada y no puede editarse como borrador.'
      using errcode = '22023';
  end if;

  insert into public.application_documents (
    application_id, requirement_id, requirement_title, is_required
  )
  select application_id_value, r.id, r.title, r.is_required
  from public.call_requirements r
  where r.call_id = call_id_value
  on conflict (application_id, requirement_id) do update
    set requirement_title = excluded.requirement_title,
        is_required = excluded.is_required;

  return application_id_value;
end;
$$;

create function public.student_submit_application(target_application_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.applications
  set status = 'ENVIADA'
  where id = target_application_id
    and applicant_id = auth.uid()
    and status = 'BORRADOR';

  if not found then
    raise exception 'No se encontró un borrador editable.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.student_save_application_draft(jsonb) from public, anon;
revoke all on function public.student_submit_application(uuid) from public, anon;
grant execute on function public.student_save_application_draft(jsonb) to authenticated;
grant execute on function public.student_submit_application(uuid) to authenticated;

-- Los documentos de postulación son privados. Cada estudiante escribe dentro
-- de una carpeta cuyo primer segmento es su propio UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-documents',
  'application-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "applicants read their private application files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'application-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.has_role('ADMIN_OCRI'))
  );

create policy "applicants upload private application files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.applications a
      where a.id::text = (storage.foldername(name))[2]
        and a.applicant_id = auth.uid()
        and a.status = 'BORRADOR'
    )
  );

create policy "applicants update their private application files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.applications a
      where a.id::text = (storage.foldername(name))[2]
        and a.applicant_id = auth.uid()
        and a.status = 'BORRADOR'
    )
  )
  with check (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.applications a
      where a.id::text = (storage.foldername(name))[2]
        and a.applicant_id = auth.uid()
        and a.status = 'BORRADOR'
    )
  );

create policy "applicants delete their private application files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.applications a
      where a.id::text = (storage.foldername(name))[2]
        and a.applicant_id = auth.uid()
        and a.status = 'BORRADOR'
    )
  );
