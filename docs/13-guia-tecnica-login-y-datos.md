# Guía técnica: login, roles y datos

## Flujo de una cuenta

1. La persona ingresa nombre y correo en **Crear mi cuenta**.
2. SIGMA consulta `is_registration_domain_approved`. Si el dominio no pertenece a una universidad aprobada, no crea cuenta ni envía correo.
3. Supabase Auth envía un enlace de verificación. En local llega a Mailpit; en producción llegará al correo institucional.
4. Al abrir el enlace, Auth confirma la propiedad del correo y crea una sesión temporal.
5. SIGMA muestra **Crea tu contraseña**. `auth.updateUser` guarda la contraseña solo en Supabase Auth; SIGMA nunca la guarda ni puede leerla.
6. Un trigger crea el perfil y lo vincula a su universidad por dominio.
7. Si el dominio es aprobado, `assign_default_student_access` activa la cuenta y asigna el rol base: `ESTUDIANTE_UNSAAC` o `ESTUDIANTE_EXTERNO`.
8. Los siguientes ingresos usan correo y contraseña. Los enlaces quedan reservados para verificación y recuperación.

## Roles

| Rol | Asignación | Alcance |
|---|---|---|
| `ADMIN_OCRI` | Bootstrap técnico único para `ocri@unsaac.edu.pe` | Administración transversal. |
| `ESTUDIANTE_UNSAAC` | Automática con dominio UNSAAC | SGMS. |
| `ESTUDIANTE_EXTERNO` | Automática con dominio externo aprobado | SGME. |
| `GESTOR_EXTERNO` | Designación directa de OCRI | Nominaciones SGME de su universidad. |

Nadie solicita ni se autoasigna roles. Las reglas se validan en PostgreSQL, no solo en la interfaz.

## Archivos del frontend

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Punto de entrada de la web. |
| `src/styles.css` | Diseño visual adaptable. |
| `src/app.js` | Vistas, prototipo temporal y llamadas a Supabase. |
| `.env.local` | Variables locales; no se sube a Git. |
| `package.json` | Dependencias y comandos de Vite. |

`boot` restaura la sesión. `loadSession` carga perfil y rol. `login`, `register`, `setPassword` y `requestPasswordReset` controlan Auth. `access`, `createUniversity` y `designateExternalManager` son el panel OCRI. Convocatorias y postulaciones siguen siendo demostración en `localStorage` hasta el siguiente sprint.

## Migraciones

Una migración es un cambio ordenado e inmutable de PostgreSQL. `supabase migration up --local` aplica cada archivo pendiente una vez. No se editan ni borran migraciones ya aplicadas; una corrección se agrega como una nueva.

| Migración | Propósito |
|---|---|
| `20260810174010_identity_foundation` | Perfiles, roles, universidades, dominios, trigger inicial y RLS. |
| `20260811100000_access_administration` | Bootstrap de administrador y funciones administrativas. |
| `20260811113000_email_verification_and_password_setup` | Verificación de correo y configuración de contraseña. |
| `20260811130000_university_domain_enforcement` | Vínculo por dominio y protección de campos del perfil. |
| `20260811131500_fix_domain_validation` | Corrección y vínculo de cuentas existentes. |
| `20260811140000_automatic_student_access_and_role_requests` | Rol base automático; las solicitudes fueron retiradas posteriormente. |
| `20260811150000_simplify_operational_roles` | Reduce a los cuatro roles aprobados. |
| `20260811160000_remove_role_requests` | OCRI designa gestores directamente. |
| `20260811170000_restrict_registration_to_approved_domains` | Rechaza dominios no aprobados antes de enviar correo. |

## Seguridad

- La clave pública del navegador no concede permisos administrativos: RLS controla cada sesión.
- Contraseñas y claves `service_role` nunca se colocan en `src/app.js` ni se suben a Git.
- Las funciones `admin_*` comprueban `ADMIN_OCRI` en PostgreSQL.
- Docker y Mailpit son pruebas locales; Supabase Cloud será producción.
