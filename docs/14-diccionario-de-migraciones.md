# Diccionario de migraciones de SIGMA

Este documento explica cada migración sin alterar los archivos SQL que ya fueron aplicados. Las migraciones son historial ejecutable: se aplican una vez, en orden, y juntas reconstruyen la base de datos.

## 20260810174010_identity_foundation.sql

**Objetivo:** crear la identidad mínima de SIGMA.

```text
auth.users (Supabase Auth)
        ↓ trigger
profiles ── user_roles ── roles
        ↓
universities ── university_email_domains
```

- `account_status`: enum con `PENDIENTE`, `ACTIVO` y `SUSPENDIDO`.
- `universities`: universidades vinculadas a movilidad. El índice parcial garantiza que solo exista una marcada como UNSAAC.
- `roles`: catálogo de roles.
- `profiles`: información pública-operativa de cada cuenta Auth; no contiene contraseñas.
- `user_roles`: relación entre persona y rol.
- `university_email_domains`: dominios institucionales autorizados.
- `handle_new_user`: trigger que crea un perfil cuando Supabase Auth crea una cuenta.
- `has_role`: función interna que consulta si la sesión tiene un rol.
- RLS: un usuario solo ve su perfil y sus roles; el administrador puede ver los necesarios para administrar.
- Seed: crea UNSAAC y `unsaac.edu.pe` como dominio verificado.

## 20260811100000_access_administration.sql

**Objetivo:** permitir administración sin exponer permisos críticos al navegador.

- `bootstrap_global_admin()`: se ejecuta una sola vez desde una conexión técnica. Busca `ocri@unsaac.edu.pe` confirmado, le asigna `ADMIN_OCRI` y lo activa. La función no tiene permiso para `anon` ni `authenticated`.
- `admin_set_user_role(user_id, role)`: solo funciona si la sesión ya es `ADMIN_OCRI`. Asigna un único rol operativo y activa la cuenta.
- `admin_set_account_status(user_id, status)`: permite activar, dejar pendiente o suspender. Evita que el administrador se suspenda a sí mismo.

La palabra `security definer` significa que la función puede realizar el cambio en tablas protegidas, pero primero valida explícitamente quién llamó a la función. No es una puerta abierta.

## 20260811113000_email_verification_and_password_setup.sql

**Objetivo:** separar verificación de correo y contraseña.

- Agrega `profiles.password_configured_at`: solo marca cuándo la persona terminó de definir su contraseña; la contraseña sigue almacenada exclusivamente por Supabase Auth.
- `sync_profile_email_confirmation`: escucha cuando `auth.users.email_confirmed_at` cambia y copia esa fecha a `profiles.email_verified_at`.
- El `update` final sincroniza cuentas creadas antes del trigger.

Esto permite el flujo: correo verificado por enlace una vez → contraseña personal para ingresos posteriores.

## 20260811130000_university_domain_enforcement.sql

**Objetivo:** relacionar una cuenta con su universidad según su dominio y evitar autoedición sensible.

- Reemplaza `handle_new_user` para buscar el dominio del correo en `university_email_domains`.
- Si el dominio está activo y verificado, asigna `university_id` al perfil recién creado.
- Revoca actualización general de `profiles` a usuarios autenticados.
- Solo permite actualizar `full_name` y `password_configured_at`; universidad, estado y verificación son controlados por servidor.
- Agrega `admin_create_university_with_domain`: solo `ADMIN_OCRI` puede crear una universidad externa y aprobar su dominio. También vincula cuentas pendientes ya existentes de ese dominio.
- Fortalece `admin_set_user_role` para exigir dominio UNSAAC en roles internos y dominio externo aprobado en roles externos.

## 20260811131500_fix_domain_validation.sql

**Objetivo:** corrección técnica de la migración anterior.

En PL/pgSQL, una variable y una columna con el mismo nombre podían ser ambiguas. Esta migración reemplaza la función con nombres inequívocos y actualiza perfiles existentes para asociarlos al dominio institucional ya aprobado. No agrega una regla de negocio nueva.

## 20260811140000_automatic_student_access_and_role_requests.sql

**Objetivo original:** automatizar el rol base después de verificar correo.

- Agrega `GESTOR_OCRI` de manera temporal.
- `assign_default_student_access(user_id)`: si la cuenta está confirmada, pendiente, sin rol y su dominio está aprobado, la activa como `ESTUDIANTE_UNSAAC` o `ESTUDIANTE_EXTERNO`.
- Actualiza el trigger de confirmación para llamar a esa función.
- Agrega inicialmente tablas para solicitudes de roles elevados.

Las solicitudes y el rol temporal `GESTOR_OCRI` fueron decisiones reemplazadas en migraciones posteriores. Se conserva esta migración porque forma parte del historial ya ejecutado.

## 20260811150000_simplify_operational_roles.sql

**Objetivo:** dejar solo los cuatro roles aprobados por OCRI.

- Elimina `EVALUADOR_OCRI` y `GESTOR_OCRI`.
- Elimina asignaciones o solicitudes asociadas a esos roles antes de borrar sus filas, para respetar claves foráneas.
- Ajusta `admin_set_user_role` para permitir solo:
  - `ADMIN_OCRI` con el correo global OCRI;
  - `ESTUDIANTE_UNSAAC` con dominio UNSAAC;
  - `ESTUDIANTE_EXTERNO` y `GESTOR_EXTERNO` con dominio externo aprobado.

## 20260811160000_remove_role_requests.sql

**Objetivo:** eliminar las solicitudes de rol.

OCRI decidió que el gestor externo no se solicita: la oficina lo designa directamente. Por ello esta migración revoca la ejecución de la función de decisión, elimina la tabla de solicitudes, su trigger de validación y el enum de estados.

## 20260811170000_restrict_registration_to_approved_domains.sql

**Objetivo:** bloquear el registro antes de enviar correo a dominios no asociados.

- `is_registration_domain_approved(email)`: devuelve verdadero solo si el dominio extraído del correo figura activo y verificado.
- La función es `security definer` para que una persona sin sesión pueda preguntar si puede iniciar el registro, sin obtener acceso directo a las tablas de dominios.
- Solo se concede `execute`; no se concede lectura de tablas.
- El frontend la llama antes de `signInWithOtp`. Por ello Gmail, Hotmail o dominios sin convenio no reciben enlace ni crean cuenta.

## Cómo leer el SQL

- `create table`: crea una entidad y sus columnas.
- `references`: crea una relación con otra tabla y evita referencias inexistentes.
- `create function`: define lógica que se ejecuta dentro de PostgreSQL.
- `create trigger`: ejecuta una función automáticamente ante un evento, por ejemplo crear o confirmar una cuenta.
- `enable row level security`: activa la barrera de permisos por fila.
- `create policy`: expresa quién puede leer, insertar o modificar cada fila.
- `grant execute`: permite invocar una función, no leer o editar sus tablas libremente.
- `security definer`: ejecuta una función con privilegios controlados; por eso cada función administrativa valida `auth.uid()` y `has_role('ADMIN_OCRI')`.
