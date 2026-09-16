# Actividad 2: Diseño funcional y arquitectura de SIGMA OCRI

## Correspondencia con el plan

- Periodo: 24/08/2026 al 13/09/2026
- Actividad: Diseño funcional y arquitectura del sistema SIGMA OCRI
- Entregable: especificación de roles, permisos, flujos de trabajo, modelo de datos y arquitectura tecnológica.

Este documento resume la base técnica del segundo informe de prácticas. Su propósito es describir cómo debe funcionar el sistema, no declarar terminados los módulos de implementación programados para etapas posteriores.

## Actores y roles

| Rol                  | Responsabilidad principal                                                   | Restricción central                                                                              |
| -------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ADMIN_OCRI`         | Administra configuración, convocatorias, accesos y expedientes autorizados. | Las operaciones sensibles deben quedar registradas.                                              |
| `ESTUDIANTE_UNSAAC`  | Gestiona su perfil y su postulación de movilidad saliente.                  | Solo consulta y modifica su propio expediente.                                                   |
| `GESTOR_EXTERNO`     | Registra o confirma nominaciones de su universidad.                         | Solo actúa sobre la institución que representa.                                                  |
| `ESTUDIANTE_EXTERNO` | Completa su postulación de movilidad entrante.                              | Solo accede a su propio proceso y requiere una relación válida con una institución o nominación. |

## Flujos diseñados

### Acceso y administración

1. La persona utiliza un correo perteneciente a un dominio institucional autorizado.
2. Supabase Auth verifica la identidad y administra la sesión.
3. SIGMA consulta el perfil y el rol asignado.
4. La interfaz muestra las funciones permitidas para ese rol.
5. PostgreSQL y las políticas RLS verifican nuevamente la autorización al leer o modificar datos.

### Movilidad saliente (SGMS)

1. OCRI publica una convocatoria con requisitos, documentos y plazos.
2. El estudiante UNSAAC completa su información y crea una postulación.
3. El estudiante carga documentos y envía el expediente.
4. OCRI revisa, observa o registra una decisión.
5. El expediente conserva nominación, carta, movilidad, retorno e historial cuando corresponda.

### Movilidad entrante (SGME)

1. OCRI publica la convocatoria entrante.
2. El gestor externo registra o confirma una nominación.
3. El estudiante externo completa su perfil, postulación y documentos.
4. OCRI revisa y coordina la validación académica.
5. El resultado y las cartas se vinculan al expediente autorizado.

## Modelo de datos

Las migraciones del repositorio materializan el diseño en las siguientes agrupaciones:

| Grupo            | Entidades principales                                                             | Finalidad                                                         |
| ---------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Identidad        | `profiles`, `roles`, `user_roles`                                                 | Perfil, catálogo de roles y autorizaciones.                       |
| Instituciones    | `universities`, `university_email_domains`                                        | Universidades y dominios permitidos.                              |
| Catálogos UNSAAC | `unsaac_faculties`, `unsaac_professional_schools`                                 | Facultades y escuelas usadas en postulaciones.                    |
| Convocatorias    | `calls`, `call_guidelines`, `call_requirements`, `call_resources`, `call_notices` | Configuración y contenido de convocatorias.                       |
| Expedientes      | `applications`, `application_documents`                                           | Postulación y documentos asociados.                               |
| Trazabilidad     | `application_status_history`                                                      | Estado, fecha, responsable y nota de cada cambio.                 |
| Cartas y cierre  | `acceptance_letters`, `nomination_letters`, `mobility_return_documents`           | Resultados, nominaciones y documentos posteriores a la movilidad. |

## Arquitectura tecnológica

| Capa         | Tecnología                        | Responsabilidad                                            |
| ------------ | --------------------------------- | ---------------------------------------------------------- |
| Presentación | Vite, HTML, CSS y JavaScript      | Interfaz, navegación, formularios y vistas por rol.        |
| Integración  | Supabase JS                       | Sesión, consultas, RPC y acceso a archivos.                |
| Identidad    | Supabase Auth                     | Registro, verificación y autenticación.                    |
| Datos        | PostgreSQL                        | Catálogos, convocatorias, expedientes e historial.         |
| Seguridad    | RLS, validaciones y funciones SQL | Autorización por rol, propietario, institución y estado.   |
| Archivos     | Supabase Storage                  | Documentos privados y evidencias del expediente.           |
| Versionado   | GitHub                            | Código, migraciones, documentación e historial de cambios. |

## Evidencias que deben incorporarse al informe final

1. Recorte de la actividad 2 y sus fechas en el Plan de Prácticas.
2. Diagrama de actores y límites de acceso.
3. Diagrama del flujo de autenticación y autorización.
4. Diagrama del flujo SGMS.
5. Diagrama del flujo SGME.
6. Modelo entidad-relación.
7. Diagrama de arquitectura tecnológica.
8. Captura del esquema o de una política RLS en Supabase, sin secretos ni datos personales.
9. Capturas de prototipos o pantallas principales con datos ficticios.
10. Captura de la planificación y las historias de usuario en GitHub.

## Límites de la actividad

- Las historias de usuario sirven para demostrar trazabilidad del diseño; su implementación y prueba pertenecen a las actividades posteriores.
- No deben exponerse claves, tokens, UUID, correos privados, documentos reales ni URL privadas del proyecto en las capturas.
- El estado académico del cronograma y el avance técnico real deben informarse por separado.
