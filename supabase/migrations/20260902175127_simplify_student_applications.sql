-- Catálogo académico UNSAAC usado por la postulación de movilidad saliente.
-- La relación facultad-escuela evita combinaciones inválidas y reemplaza los
-- campos libres del prototipo por opciones institucionales controladas.

create table public.unsaac_faculties (
  code text primary key,
  name text not null unique,
  display_order smallint not null,
  is_active boolean not null default true
);

create table public.unsaac_professional_schools (
  code text primary key,
  faculty_code text not null references public.unsaac_faculties(code) on update cascade,
  name text not null,
  display_order smallint not null,
  is_active boolean not null default true,
  unique (faculty_code, name)
);

insert into public.unsaac_faculties (code, name, display_order) values
  ('AGRONOMIA_ZOOTECNIA', 'Facultad de Agronomía y Zootecnia', 1),
  ('ARQUITECTURA_ARTES', 'Facultad de Arquitectura y Artes Plásticas', 2),
  ('ADMINISTRACION_TURISMO', 'Facultad de Administración y Turismo', 3),
  ('CIENCIAS_BIOLOGICAS', 'Facultad de Ciencias Biológicas', 4),
  ('CONTABLES_FINANCIERAS', 'Facultad de Ciencias Contables y Financieras', 5),
  ('QUIMICAS_FISICAS_MATEMATICAS', 'Facultad de Ciencias Químicas, Físicas y Matemáticas', 6),
  ('CIENCIAS_SOCIALES', 'Facultad de Ciencias Sociales', 7),
  ('COMUNICACION_IDIOMAS', 'Facultad de Comunicación Social e Idiomas', 8),
  ('DERECHO_POLITICAS', 'Facultad de Derecho y Ciencias Políticas', 9),
  ('ECONOMIA', 'Facultad de Economía', 10),
  ('EDUCACION', 'Facultad de Educación', 11),
  ('ENFERMERIA', 'Facultad de Enfermería', 12),
  ('INGENIERIA_CIVIL', 'Facultad de Ingeniería Civil', 13),
  ('ELECTRICA_ELECTRONICA_INFORMATICA_MECANICA', 'Facultad de Ingeniería Eléctrica, Electrónica, Informática y Mecánica', 14),
  ('INGENIERIA_PROCESOS', 'Facultad de Ingeniería de Procesos', 15),
  ('MEDICINA_HUMANA', 'Facultad de Medicina Humana', 16),
  ('GEOLOGICA_MINAS_METALURGICA', 'Facultad de Ingeniería Geológica, Minas y Metalúrgica', 17),
  ('CIENCIAS_SALUD', 'Facultad de Ciencias de la Salud', 18);

insert into public.unsaac_professional_schools
  (code, faculty_code, name, display_order)
values
  ('AGRONOMIA', 'AGRONOMIA_ZOOTECNIA', 'Agronomía', 1),
  ('ZOOTECNIA', 'AGRONOMIA_ZOOTECNIA', 'Zootecnia', 2),
  ('VETERINARIA_ESPINAR', 'AGRONOMIA_ZOOTECNIA', 'Medicina Veterinaria - Espinar', 3),
  ('VETERINARIA_SICUANI', 'AGRONOMIA_ZOOTECNIA', 'Medicina Veterinaria - Sicuani', 4),
  ('AGROPECUARIA_ANDAHUAYLAS', 'AGRONOMIA_ZOOTECNIA', 'Ingeniería Agropecuaria - Andahuaylas', 5),
  ('AGROPECUARIA_SANTO_TOMAS', 'AGRONOMIA_ZOOTECNIA', 'Ingeniería Agropecuaria - Santo Tomás', 6),
  ('FORESTAL_PUERTO_MALDONADO', 'AGRONOMIA_ZOOTECNIA', 'Ingeniería Forestal - Puerto Maldonado', 7),
  ('MEDIO_AMBIENTE_CURAHUASI', 'AGRONOMIA_ZOOTECNIA', 'Ingeniería del Medio Ambiente y Recursos Naturales - Curahuasi', 8),
  ('ARQUITECTURA', 'ARQUITECTURA_ARTES', 'Arquitectura', 1),
  ('CIENCIAS_ADMINISTRATIVAS', 'ADMINISTRACION_TURISMO', 'Ciencias Administrativas', 1),
  ('TURISMO', 'ADMINISTRACION_TURISMO', 'Turismo', 2),
  ('BIOLOGIA', 'CIENCIAS_BIOLOGICAS', 'Biología', 1),
  ('CONTABILIDAD', 'CONTABLES_FINANCIERAS', 'Contabilidad', 1),
  ('QUIMICA', 'QUIMICAS_FISICAS_MATEMATICAS', 'Química', 1),
  ('FISICA', 'QUIMICAS_FISICAS_MATEMATICAS', 'Física', 2),
  ('MATEMATICA', 'QUIMICAS_FISICAS_MATEMATICAS', 'Matemática', 3),
  ('MATEMATICA_ESTADISTICA', 'QUIMICAS_FISICAS_MATEMATICAS', 'Matemática con mención en Estadística', 4),
  ('ANTROPOLOGIA', 'CIENCIAS_SOCIALES', 'Antropología', 1),
  ('ARQUEOLOGIA', 'CIENCIAS_SOCIALES', 'Arqueología', 2),
  ('HISTORIA', 'CIENCIAS_SOCIALES', 'Historia', 3),
  ('FILOSOFIA', 'CIENCIAS_SOCIALES', 'Filosofía', 4),
  ('PSICOLOGIA', 'CIENCIAS_SOCIALES', 'Psicología', 5),
  ('CIENCIAS_COMUNICACION', 'COMUNICACION_IDIOMAS', 'Ciencias de la Comunicación', 1),
  ('DERECHO', 'DERECHO_POLITICAS', 'Derecho', 1),
  ('ECONOMIA', 'ECONOMIA', 'Economía', 1),
  ('EDUCACION_SEC_MATEMATICA_FISICA', 'EDUCACION', 'Educación Secundaria - Matemática y Física', 1),
  ('EDUCACION_SEC_CIENCIAS_NATURALES', 'EDUCACION', 'Educación Secundaria - Ciencias Naturales', 2),
  ('EDUCACION_SEC_LENGUA_LITERATURA', 'EDUCACION', 'Educación Secundaria - Lengua y Literatura', 3),
  ('EDUCACION_SEC_CIENCIAS_SOCIALES', 'EDUCACION', 'Educación Secundaria - Ciencias Sociales', 4),
  ('EDUCACION_SEC_EDUCACION_FISICA', 'EDUCACION', 'Educación Secundaria - Educación Física', 5),
  ('EDUCACION_PRIMARIA', 'EDUCACION', 'Educación Primaria - Cusco', 6),
  ('EDUCACION_PRIMARIA_CANAS', 'EDUCACION', 'Educación Primaria - Canas', 7),
  ('EDUCACION_INICIAL_CANAS', 'EDUCACION', 'Educación Inicial - Canas', 8),
  ('EDUCACION_CN_ESPINAR', 'EDUCACION', 'Educación Secundaria - Ciencias Naturales - Espinar', 9),
  ('EDUCACION_MF_ESPINAR', 'EDUCACION', 'Educación Secundaria - Matemática y Física - Espinar', 10),
  ('EDUCACION_PRIMARIA_ESPINAR', 'EDUCACION', 'Educación Primaria - Espinar', 11),
  ('ENFERMERIA', 'ENFERMERIA', 'Enfermería', 1),
  ('INGENIERIA_CIVIL', 'INGENIERIA_CIVIL', 'Ingeniería Civil', 1),
  ('INGENIERIA_ELECTRICA', 'ELECTRICA_ELECTRONICA_INFORMATICA_MECANICA', 'Ingeniería Eléctrica', 1),
  ('INGENIERIA_ELECTRONICA', 'ELECTRICA_ELECTRONICA_INFORMATICA_MECANICA', 'Ingeniería Electrónica', 2),
  ('INGENIERIA_INFORMATICA', 'ELECTRICA_ELECTRONICA_INFORMATICA_MECANICA', 'Ingeniería Informática y de Sistemas', 3),
  ('INGENIERIA_MECANICA', 'ELECTRICA_ELECTRONICA_INFORMATICA_MECANICA', 'Ingeniería Mecánica', 4),
  ('INGENIERIA_QUIMICA', 'INGENIERIA_PROCESOS', 'Ingeniería Química', 1),
  ('INGENIERIA_AGROINDUSTRIAL_SICUANI', 'INGENIERIA_PROCESOS', 'Ingeniería Agroindustrial - Sicuani', 2),
  ('INGENIERIA_PETROQUIMICA', 'INGENIERIA_PROCESOS', 'Ingeniería Petroquímica', 3),
  ('MEDICINA_HUMANA', 'MEDICINA_HUMANA', 'Medicina Humana', 1),
  ('ODONTOLOGIA', 'MEDICINA_HUMANA', 'Odontología', 2),
  ('INGENIERIA_GEOLOGICA', 'GEOLOGICA_MINAS_METALURGICA', 'Ingeniería Geológica', 1),
  ('INGENIERIA_MINAS', 'GEOLOGICA_MINAS_METALURGICA', 'Ingeniería de Minas', 2),
  ('INGENIERIA_METALURGICA', 'GEOLOGICA_MINAS_METALURGICA', 'Ingeniería Metalúrgica', 3),
  ('FARMACIA_BIOQUIMICA', 'CIENCIAS_SALUD', 'Farmacia y Bioquímica', 1),
  ('OBSTETRICIA_ANDAHUAYLAS', 'CIENCIAS_SALUD', 'Obstetricia - Andahuaylas', 2);

alter table public.unsaac_faculties enable row level security;
alter table public.unsaac_professional_schools enable row level security;

create policy "authenticated users read UNSAAC faculties"
  on public.unsaac_faculties for select to authenticated
  using (true);

create policy "authenticated users read UNSAAC professional schools"
  on public.unsaac_professional_schools for select to authenticated
  using (true);

revoke all on public.unsaac_faculties, public.unsaac_professional_schools from anon;
grant select on public.unsaac_faculties, public.unsaac_professional_schools to authenticated;

-- El formulario deja de usar una presentación escrita y ya no necesita guardar
-- un número de etapa: es una sola vista con datos académicos y documentos.
alter table public.applications
  drop column motivation,
  drop column current_step;

-- La base de datos valida el expediente completo antes del envío. El código se
-- contrasta con el prefijo del correo autenticado y la combinación académica
-- debe existir en el catálogo anterior.
create or replace function public.validate_application_submission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'ENVIADA' and old.status = 'BORRADOR' then
    if coalesce(trim(new.student_code), '') = ''
      or coalesce(trim(new.faculty), '') = ''
      or coalesce(trim(new.academic_program), '') = '' then
      raise exception 'Completa la facultad y la escuela profesional antes de enviar.'
        using errcode = '22023';
    end if;

    if new.student_code <> split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 1) then
      raise exception 'El código de estudiante no coincide con el correo autenticado.'
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
      raise exception 'La facultad y la escuela profesional seleccionadas no son válidas.'
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
  end if;
  return new;
end;
$$;

-- Crea o actualiza un único borrador por convocatoria. El cliente envía los
-- códigos del catálogo; PostgreSQL resuelve y guarda sus nombres oficiales.
-- El código del estudiante nunca se acepta desde el navegador: se obtiene del
-- prefijo del correo contenido en el JWT de Supabase Auth.
create or replace function public.student_save_application_draft(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  application_id_value uuid;
  call_id_value uuid := nullif(payload ->> 'callId', '')::uuid;
  faculty_code_value text := nullif(trim(payload ->> 'facultyCode'), '');
  school_code_value text := nullif(trim(payload ->> 'schoolCode'), '');
  faculty_name_value text;
  school_name_value text;
  student_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  student_code_value text;
begin
  if not public.has_role('ESTUDIANTE_UNSAAC') then
    raise exception 'Solo un estudiante UNSAAC puede iniciar esta postulación.'
      using errcode = '42501';
  end if;

  if student_email not like '%@unsaac.edu.pe' then
    raise exception 'La cuenta no tiene un correo institucional UNSAAC válido.'
      using errcode = '22023';
  end if;
  student_code_value := split_part(student_email, '@', 1);

  if not exists (
    select 1 from public.calls c
    where c.id = call_id_value and c.direction = 'SALIENTE' and c.status = 'ACTIVA'
  ) then
    raise exception 'La convocatoria no está disponible para postular.' using errcode = '22023';
  end if;

  if faculty_code_value is not null then
    select name into faculty_name_value
    from public.unsaac_faculties
    where code = faculty_code_value and is_active;

    if faculty_name_value is null then
      raise exception 'La facultad seleccionada no es válida.' using errcode = '22023';
    end if;
  end if;

  if school_code_value is not null then
    if faculty_code_value is null then
      raise exception 'Selecciona primero una facultad.' using errcode = '22023';
    end if;

    select name into school_name_value
    from public.unsaac_professional_schools
    where code = school_code_value
      and faculty_code = faculty_code_value
      and is_active;

    if school_name_value is null then
      raise exception 'La escuela profesional no pertenece a la facultad seleccionada.'
        using errcode = '22023';
    end if;
  end if;

  insert into public.applications (
    call_id, applicant_id, student_code, faculty, academic_program, status
  ) values (
    call_id_value,
    auth.uid(),
    student_code_value,
    faculty_name_value,
    school_name_value,
    'BORRADOR'
  )
  on conflict (call_id, applicant_id) do update
    set student_code = excluded.student_code,
        faculty = excluded.faculty,
        academic_program = excluded.academic_program
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

revoke all on function public.validate_application_submission() from public, anon, authenticated;
revoke all on function public.student_save_application_draft(jsonb) from public, anon;
grant execute on function public.student_save_application_draft(jsonb) to authenticated;

comment on table public.unsaac_faculties is
  'Facultades vigentes de la UNSAAC disponibles para postulaciones SGMS.';
comment on table public.unsaac_professional_schools is
  'Escuelas profesionales y filiales vigentes, relacionadas con su facultad UNSAAC.';
