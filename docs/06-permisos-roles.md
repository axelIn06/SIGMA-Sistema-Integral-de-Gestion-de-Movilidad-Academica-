# Roles y permisos vigentes

SIGMA trabaja con cuatro roles operativos. El principio es de **mínimo privilegio**: cada persona ve y modifica únicamente lo que necesita para su proceso.

| Rol                  | Forma de asignación                                                          | Alcance permitido                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_OCRI`         | Cuenta global `ocri@unsaac.edu.pe` mediante bootstrap técnico único.         | Administración transversal: universidades, dominios, gestores externos, convocatorias, requisitos, expedientes, decisiones y reportes. |
| `ESTUDIANTE_UNSAAC`  | Automática al confirmar un correo con dominio institucional UNSAAC aprobado. | SGMS: convocatorias salientes, su perfil, su postulación y sus documentos.                                                             |
| `ESTUDIANTE_EXTERNO` | Automática al confirmar un correo de una universidad externa aprobada.       | SGME: su invitación/nominación, perfil, postulación y documentos.                                                                      |
| `GESTOR_EXTERNO`     | Designación directa de OCRI a una cuenta de universidad externa aprobada.    | Solo SGME de su universidad: nominaciones y seguimiento de los expedientes que corresponden a su institución.                          |

No existe autoasignación ni solicitud pública de roles elevados. OCRI registra universidades y dominios asociados, y designa al gestor externo cuando corresponde.

## Reglas de seguridad

- El servidor valida permisos mediante Row Level Security (RLS) y funciones de PostgreSQL; ocultar una opción en la interfaz no reemplaza esa validación.
- Las contraseñas las gestiona exclusivamente Supabase Auth; la base de datos de SIGMA no las almacena.
- Las acciones sensibles, como registrar universidades o asignar gestores, se restringen a `ADMIN_OCRI`.
- Los archivos de expedientes serán privados y se entregarán mediante enlaces firmados y temporales cuando se implemente Storage.
