# Diccionario de migraciones de SIGMA

El esquema base fue consolidado y las funcionalidades nuevas se añaden mediante migraciones incrementales coherentes. Una instalación nueva crea directamente el modelo vigente, sin crear columnas temporales para eliminarlas después.

## 20260810174010_identity_foundation.sql

Construye identidad y acceso:

```text
auth.users → profiles → user_roles → roles
                    ↘ universities → university_email_domains
```

- Crea los cuatro roles operativos: `ADMIN_OCRI`, `ESTUDIANTE_UNSAAC`, `GESTOR_EXTERNO` y `ESTUDIANTE_EXTERNO`.
- Crea UNSAAC y `unsaac.edu.pe` como catálogo institucional inicial.
- Vincula automáticamente cada cuenta con una universidad mediante el dominio verificado.
- Asigna el rol base de estudiante después de confirmar el correo.
- Conserva las contraseñas exclusivamente en Supabase Auth.
- Permite editar nombre, teléfono, dirección y foto del propio perfil.
- Crea el bucket privado `profile-photos`, limitado a imágenes de 5 MB.
- Define RLS para que cada persona acceda a su perfil y OCRI administre los accesos autorizados.

Funciones principales:

- `has_role`: consulta segura utilizada por RLS.
- `handle_new_user`: crea el perfil al registrarse una cuenta Auth.
- `sync_profile_email_confirmation`: sincroniza la verificación y activa el rol estudiantil correspondiente.
- `bootstrap_global_admin`: asigna una sola vez `ADMIN_OCRI` a `ocri@unsaac.edu.pe` ya confirmado.
- `admin_set_user_role`: permite que OCRI designe un gestor externo.
- `admin_set_account_status`: cambia el estado de una cuenta sin permitir que el administrador se suspenda a sí mismo.
- `admin_create_university_with_domain`: registra una universidad y su dominio aprobado.
- `is_registration_domain_approved`: evita enviar correos de registro a dominios sin convenio.

## 20260818120000_convocatorias.sql

Construye el módulo real de convocatorias:

```text
calls
├── call_guidelines
├── call_requirements
├── call_resources
└── call_notices ── call_notice_links
```

- `calls`: información general, periodo, fecha límite, dirección, estado y portada.
- `call_guidelines`: requisitos generales mostrados como viñetas.
- `call_requirements`: documentos que deberá presentar el postulante.
- `call_resources`: brochures, cartas y otros materiales descargables de OCRI.
- `call_notice_links`: textos y enlaces opcionales de información importante.
- `call-assets`: bucket privado para portadas y materiales.
- `admin_upsert_call`: crea o actualiza toda la convocatoria en una transacción.
- `admin_delete_call`: elimina la convocatoria y sus registros relacionados.

Las políticas permiten que cualquier usuario autenticado consulte convocatorias activas y sus materiales. Los borradores y operaciones de escritura quedan reservados para `ADMIN_OCRI`.

## 20260827113000_postulaciones_estudiantiles.sql

Construye el primer flujo real de postulaciones SGMS:

```text
profiles ── applications ── calls
                │
                └── application_documents ── call_requirements
```

- `applications`: conserva datos académicos, presentación, etapa actual y estado del expediente.
- `application_documents`: vincula cada archivo privado con el documento solicitado por la convocatoria.
- `student_save_application_draft`: crea o actualiza el borrador y sincroniza sus documentos requeridos.
- `student_submit_application`: entrega el expediente únicamente después de superar las validaciones.
- `validate_application_submission`: bloquea el envío si falta foto, información académica, presentación o algún archivo obligatorio.
- `application-documents`: bucket privado organizado por UUID del estudiante y de su expediente.

RLS permite que cada estudiante consulte y modifique únicamente sus propios borradores. OCRI puede consultar los expedientes; ningún estudiante puede acceder a archivos pertenecientes a otra cuenta.

## 20260828152459_harden_function_execute_privileges.sql

Completa el endurecimiento del esquema antes de usarlo en el entorno remoto:

- Revoca la ejecución pública de funciones internas y de triggers.
- Expone cada RPC únicamente al rol que necesita invocarlo.
- Mantiene pública solo la comprobación previa del dominio de registro, que no devuelve información personal.
- Añade índices a claves foráneas de perfiles, convocatorias y documentos para evitar búsquedas completas al relacionar o eliminar registros.

Esta migración no cambia los datos funcionales; reduce la superficie de acceso y mejora el comportamiento del esquema al crecer.

## Cómo leer el SQL

- `create table`: crea una entidad y sus columnas.
- `references`: relaciona tablas y evita referencias inexistentes.
- `on delete cascade`: elimina automáticamente los registros hijos de una convocatoria.
- `create function`: agrupa lógica que PostgreSQL ejecuta de forma controlada.
- `create trigger`: ejecuta una función automáticamente ante un evento.
- `enable row level security`: activa la protección por fila.
- `create policy`: define qué filas puede leer o modificar cada sesión.
- `grant execute`: permite invocar una función sin conceder acceso general a las tablas.
