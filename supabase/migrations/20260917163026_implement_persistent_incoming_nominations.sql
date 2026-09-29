-- Convierte las nominaciones SGME en registros institucionales persistentes.
-- La universidad de origen inicia el expediente; el estudiante externo solo
-- puede completarlo después de haber sido nominado.

create table public.incoming_nominations (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete restrict,
  university_id uuid not null references public.universities(id) on delete restrict,
  nominated_by uuid not null references public.profiles(user_id) on delete restrict,
  student_name text not null check (length(trim(student_name)) >= 3),
  student_email text not null check (student_email = lower(trim(student_email))),
  country text not null check (length(trim(country)) >= 2),
  applicant_id uuid references public.profiles(user_id) on delete restrict,
  application_id uuid unique references public.applications(id) on delete restrict,
  status text not null default 'PENDIENTE_REGISTRO' check (length(trim(status)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index incoming_nominations_call_email_idx
  on public.incoming_nominations(call_id, lower(student_email));
create index incoming_nominations_university_created_idx
  on public.incoming_nominations(university_id, created_at desc);
create index incoming_nominations_applicant_idx
  on public.incoming_nominations(applicant_id)
  where applicant_id is not null;

comment on table public.incoming_nominations is
  'Nominaciones SGME registradas por el gestor autorizado de la universidad de origen.';

alter table public.incoming_nominations enable row level security;
revoke all on public.incoming_nominations from anon, authenticated;
grant select on public.incoming_nominations to authenticated;

create policy "authorized users read incoming nominations"
  on public.incoming_nominations for select to authenticated
  using (
    public.has_role('ADMIN_OCRI')
    or applicant_id = (select auth.uid())
    or (
      public.has_role('GESTOR_EXTERNO')
      and exists (
        select 1
        from public.profiles manager
        where manager.user_id = (select auth.uid())
          and manager.university_id = incoming_nominations.university_id
      )
    )
  );

-- Vincula una nominación con una cuenta externa ya verificada y crea el
-- expediente borrador con sus documentos. No es una API pública.
create or replace function private.attach_incoming_nomination(target_nomination_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  nomination public.incoming_nominations;
  matched_applicant uuid;
  linked_application uuid;
begin
  select * into nomination
  from public.incoming_nominations
  where id = target_nomination_id
  for update;

  if nomination.id is null or nomination.application_id is not null then
    return;
  end if;

  select profile.user_id into matched_applicant
  from public.profiles profile
  join public.user_roles assignment on assignment.user_id = profile.user_id
  join public.roles role on role.id = assignment.role_id
  where lower(profile.email) = nomination.student_email
    and profile.university_id = nomination.university_id
    and profile.email_verified_at is not null
    and role.code = 'ESTUDIANTE_EXTERNO'
  limit 1;

  if matched_applicant is null then
    return;
  end if;

  insert into public.applications (
    call_id, applicant_id, student_code, status
  ) values (
    nomination.call_id,
    matched_applicant,
    split_part(nomination.student_email, '@', 1),
    'BORRADOR'
  )
  on conflict (call_id, applicant_id) do nothing
  returning id into linked_application;

  if linked_application is null then
    select id into linked_application
    from public.applications
    where call_id = nomination.call_id
      and applicant_id = matched_applicant;
  end if;

  insert into public.application_documents (
    application_id, requirement_id, requirement_title, is_required
  )
  select linked_application, requirement.id, requirement.title, requirement.is_required
  from public.call_requirements requirement
  where requirement.call_id = nomination.call_id
  on conflict (application_id, requirement_id) do update
    set requirement_title = excluded.requirement_title,
        is_required = excluded.is_required;

  update public.incoming_nominations
  set applicant_id = matched_applicant,
      application_id = linked_application,
      status = 'PENDIENTE_ESTUDIANTE',
      updated_at = now()
  where id = nomination.id;
end;
$$;
revoke all on function private.attach_incoming_nomination(uuid)
  from public, anon, authenticated;

create function public.external_manager_create_nomination(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  manager_university uuid;
  target_call uuid := nullif(payload ->> 'callId', '')::uuid;
  normalized_email text := lower(trim(coalesce(payload ->> 'email', '')));
  normalized_name text := trim(coalesce(payload ->> 'student', ''));
  country_value text;
  nomination_id uuid;
begin
  if auth.uid() is null or not public.has_role('GESTOR_EXTERNO') then
    raise exception 'Solo un gestor externo autorizado puede registrar nominaciones.'
      using errcode = '42501';
  end if;

  select profile.university_id, coalesce(nullif(trim(payload ->> 'country'), ''), university.country)
    into manager_university, country_value
  from public.profiles profile
  join public.universities university on university.id = profile.university_id
  where profile.user_id = auth.uid()
    and profile.status = 'ACTIVO'
    and university.is_active
    and not university.is_unsaac;

  if manager_university is null then
    raise exception 'Tu cuenta no tiene una universidad externa activa asignada.'
      using errcode = '42501';
  end if;
  if normalized_name = '' or normalized_email = '' or country_value is null then
    raise exception 'Completa el nombre, correo institucional y país del estudiante.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.calls call
    where call.id = target_call
      and call.direction = 'ENTRANTE'
      and call.status = 'ACTIVA'
  ) then
    raise exception 'La convocatoria SGME no está activa.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.university_email_domains domain
    where domain.university_id = manager_university
      and domain.email_domain = split_part(normalized_email, '@', 2)
      and domain.is_active
      and domain.is_verified
  ) then
    raise exception 'El correo del estudiante debe pertenecer al dominio aprobado de tu universidad.'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from public.incoming_nominations existing
    where existing.call_id = target_call
      and lower(existing.student_email) = normalized_email
  ) then
    raise exception 'Este estudiante ya fue nominado para la convocatoria seleccionada.'
      using errcode = '23505';
  end if;

  insert into public.incoming_nominations (
    call_id, university_id, nominated_by, student_name, student_email, country
  ) values (
    target_call, manager_university, auth.uid(), normalized_name, normalized_email,
    trim(country_value)
  )
  returning id into nomination_id;

  perform private.attach_incoming_nomination(nomination_id);
  return nomination_id;
end;
$$;
revoke all on function public.external_manager_create_nomination(jsonb) from public, anon;
grant execute on function public.external_manager_create_nomination(jsonb) to authenticated;

-- Si la cuenta del estudiante todavía no existía, se vincula automáticamente
-- al confirmarse y recibir su rol externo institucional.
create function private.attach_pending_nominations_after_role()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_record record;
begin
  if not exists (
    select 1 from public.roles role
    where role.id = new.role_id and role.code = 'ESTUDIANTE_EXTERNO'
  ) then
    return new;
  end if;

  for target_record in
    select nomination.id
    from public.incoming_nominations nomination
    join public.profiles profile on profile.user_id = new.user_id
    where nomination.application_id is null
      and nomination.student_email = lower(profile.email)
      and nomination.university_id = profile.university_id
  loop
    perform private.attach_incoming_nomination(target_record.id);
  end loop;
  return new;
end;
$$;
revoke all on function private.attach_pending_nominations_after_role()
  from public, anon, authenticated;

create trigger user_roles_attach_pending_incoming_nominations
  after insert on public.user_roles
  for each row execute procedure private.attach_pending_nominations_after_role();

-- El estudiante externo solo puede editar el expediente que nació de su
-- nominación; no puede iniciar por cuenta propia una postulación entrante.
create or replace function public.external_student_save_incoming_draft(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_application uuid := nullif(payload ->> 'applicationId', '')::uuid;
  student_code_value text := nullif(trim(payload ->> 'studentCode'), '');
  faculty_code_value text := nullif(trim(payload ->> 'facultyCode'), '');
  school_code_value text := nullif(trim(payload ->> 'schoolCode'), '');
  faculty_name_value text;
  school_name_value text;
begin
  if not public.has_role('ESTUDIANTE_EXTERNO') then
    raise exception 'Solo el estudiante externo nominado puede completar este expediente.'
      using errcode = '42501';
  end if;
  if student_code_value is null or faculty_code_value is null or school_code_value is null then
    raise exception 'Completa tu código y selecciona la facultad y carrera profesional UNSAAC.'
      using errcode = '22023';
  end if;

  select faculty.name into faculty_name_value
  from public.unsaac_faculties faculty
  where faculty.code = faculty_code_value and faculty.is_active;

  select school.name into school_name_value
  from public.unsaac_professional_schools school
  where school.code = school_code_value
    and school.faculty_code = faculty_code_value
    and school.is_active;

  if faculty_name_value is null or school_name_value is null then
    raise exception 'La carrera seleccionada no pertenece a la facultad UNSAAC indicada.'
      using errcode = '22023';
  end if;

  update public.applications application
  set student_code = student_code_value,
      faculty = faculty_name_value,
      academic_program = school_name_value
  where application.id = target_application
    and application.applicant_id = (select auth.uid())
    and application.status = 'BORRADOR'
    and exists (
      select 1
      from public.incoming_nominations nomination
      join public.calls call on call.id = nomination.call_id
      where nomination.application_id = application.id
        and nomination.applicant_id = (select auth.uid())
        and call.direction = 'ENTRANTE'
        and call.status = 'ACTIVA'
    );

  if not found then
    raise exception 'No se encontró una nominación entrante editable.' using errcode = 'P0002';
  end if;
  return target_application;
end;
$$;
revoke all on function public.external_student_save_incoming_draft(jsonb) from public, anon;
grant execute on function public.external_student_save_incoming_draft(jsonb) to authenticated;

-- Ambos flujos utilizan el catálogo académico UNSAAC: en SGMS representa la
-- escuela de origen y en SGME la escuela de destino durante la movilidad.
create or replace function public.validate_application_submission()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  direction_value text;
begin
  if new.status = 'ENVIADA' and old.status = 'BORRADOR' then
    select direction into direction_value from public.calls where id = new.call_id;

    if coalesce(trim(new.student_code), '') = ''
      or coalesce(trim(new.faculty), '') = ''
      or coalesce(trim(new.academic_program), '') = '' then
      raise exception 'Completa tu código, facultad y carrera profesional antes de enviar.'
        using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.unsaac_professional_schools school
      join public.unsaac_faculties faculty on faculty.code = school.faculty_code
      where faculty.name = new.faculty
        and school.name = new.academic_program
        and faculty.is_active
        and school.is_active
    ) then
      raise exception 'La facultad y la carrera profesional UNSAAC seleccionadas no son válidas.'
        using errcode = '22023';
    end if;

    if direction_value = 'SALIENTE' then
      if new.student_code <> split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 1) then
        raise exception 'El código de estudiante no coincide con el correo autenticado.'
          using errcode = '22023';
      end if;
    elsif direction_value = 'ENTRANTE' then
      if not public.has_role('ESTUDIANTE_EXTERNO')
        or not exists (
          select 1 from public.incoming_nominations nomination
          where nomination.application_id = new.id
            and nomination.applicant_id = (select auth.uid())
        ) then
        raise exception 'Este expediente entrante no proviene de una nominación válida.'
          using errcode = '42501';
      end if;
    else
      raise exception 'La convocatoria no tiene un flujo válido.' using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.profiles profile
      where profile.user_id = new.applicant_id and profile.photo_path is not null
    ) then
      raise exception 'La foto de perfil es obligatoria antes de enviar.' using errcode = '22023';
    end if;

    if exists (
      select 1 from public.application_documents document
      where document.application_id = new.id
        and document.is_required
        and (
          document.storage_path is null
          or not exists (
            select 1 from storage.objects object
            where object.bucket_id = 'application-documents'
              and object.name = document.storage_path
          )
        )
    ) then
      raise exception 'Aún faltan documentos obligatorios.' using errcode = '22023';
    end if;

    new.submitted_at = now();
  end if;
  return new;
end;
$$;

create function private.sync_incoming_nomination_status()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.status is distinct from old.status then
    update public.incoming_nominations
    set status = case
          when new.status = 'BORRADOR' then 'PENDIENTE_ESTUDIANTE'
          when new.status in ('ENVIADA', 'EN_REVISION_DOCUMENTAL') then 'POSTULADO'
          else new.status
        end,
        updated_at = now()
    where application_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_incoming_nomination_status()
  from public, anon, authenticated;

create trigger applications_sync_incoming_nomination_status
  after update of status on public.applications
  for each row execute procedure private.sync_incoming_nomination_status();
