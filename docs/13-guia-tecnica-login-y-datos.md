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

| Rol                  | Asignación                                        | Alcance                              |
| -------------------- | ------------------------------------------------- | ------------------------------------ |
| `ADMIN_OCRI`         | Bootstrap técnico único para `ocri@unsaac.edu.pe` | Administración transversal.          |
| `ESTUDIANTE_UNSAAC`  | Automática con dominio UNSAAC                     | SGMS.                                |
| `ESTUDIANTE_EXTERNO` | Automática con dominio externo aprobado           | SGME.                                |
| `GESTOR_EXTERNO`     | Designación directa de OCRI                       | Nominaciones SGME de su universidad. |

Nadie solicita ni se autoasigna roles. Las reglas se validan en PostgreSQL, no solo en la interfaz.

## Archivos del frontend

| Archivo          | Responsabilidad                                         |
| ---------------- | ------------------------------------------------------- |
| `index.html`     | Punto de entrada de la web.                             |
| `src/styles.css` | Diseño visual adaptable.                                |
| `src/app.js`     | Vistas, estado temporal restante y llamadas a Supabase. |
| `.env.local`     | Variables locales; no se sube a Git.                    |
| `package.json`   | Dependencias y comandos de Vite.                        |

`boot` restaura la sesión. `loadSession` carga perfil, rol, convocatorias y postulaciones autorizadas. `login`, `register`, `setPassword` y `requestPasswordReset` controlan Auth. `access`, `createUniversity` y `designateExternalManager` son el panel OCRI. Perfiles, convocatorias, borradores SGMS y documentos se guardan en Supabase; solamente las nominaciones del prototipo continúan en `localStorage`.

## Migraciones

Una migración es un cambio ordenado de PostgreSQL. `supabase migration up --local` aplica cada archivo pendiente una vez. Durante el prototipado se consolidó el historial antes de publicarlo, de modo que una instalación nueva crea directamente el modelo vigente.

| Migración                                    | Propósito                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `20260810174010_identity_foundation`         | Identidad, perfiles, cuatro roles, universidades, fotos privadas y RLS.   |
| `20260818120000_convocatorias`               | Convocatorias, requisitos, materiales, enlaces, Storage y funciones OCRI. |
| `20260827113000_postulaciones_estudiantiles` | Borradores SGMS, documentos privados, validación de envío y RLS.          |

## Seguridad

- La clave pública del navegador no concede permisos administrativos: RLS controla cada sesión.
- Contraseñas y claves `service_role` nunca se colocan en `src/app.js` ni se suben a Git.
- Las funciones `admin_*` comprueban `ADMIN_OCRI` en PostgreSQL.
- Docker y Mailpit son pruebas locales; Supabase Cloud será producción.

## Correo local con Mailpit

Durante el desarrollo, Supabase local no envía correos a Internet. Su servicio de Auth entrega los mensajes a **Mailpit**, el buzón de pruebas incluido en los contenedores de Supabase.

1. Inicie el entorno con `supabase start` (o manténgalo iniciado si Docker ya muestra los contenedores de SIGMA).
2. Abra `http://localhost:54324` para ver Mailpit.
3. Cree una cuenta o solicite recuperar la contraseña desde SIGMA.
4. Abra el mensaje más reciente en Mailpit y use el enlace de verificación o recuperación.

Mailpit permite comprobar el flujo completo sin usar correos reales ni exponer datos personales. No guarda los mensajes de manera permanente y no reemplaza el SMTP institucional que se configurará al desplegar SIGMA.
