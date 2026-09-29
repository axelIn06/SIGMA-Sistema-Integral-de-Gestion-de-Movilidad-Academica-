const STATUS_LABELS = {
  ACTIVA: 'Activa',
  SALIENTE: 'Saliente',
  ENTRANTE: 'Entrante',
  PENDIENTE: 'Pendiente',
  SUBIDO: 'Subido',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
  ENVIADA: 'Postulado',
  OBSERVADA: 'Subsanación requerida',
  APROBADA_OCRI: 'Listo para nominación',
  ADMITIDO_UNSAAC: 'Admitido por UNSAAC',
  FINALIZADA: 'Concluido',
  BORRADOR: 'Borrador',
  POSTULADO: 'Postulado',
  EN_REVISION_DOCUMENTAL: 'Postulado',
  EN_REVISION_OCRI: 'En revisión OCRI',
  OBSERVADO: 'Subsanación pendiente',
  APROBADO_OCRI: 'Aprobado por OCRI',
  NOMINADO: 'Nominado',
  NOMINADO_UNSAAC: 'Nominado · espera respuesta de destino',
  EN_EVALUACION_DESTINO: 'Nominado · espera respuesta de destino',
  CARTA_PENDIENTE: 'Carta de aceptación por validar',
  VALIDADO_ORIGEN: 'Validado por universidad de origen',
  ACEPTADO: 'Aceptado',
  NO_ADMITIDO_UNSAAC: 'No admitido por UNSAAC',
  NO_ADMITIDO: 'No admitido',
  NO_ACEPTADO_DESTINO: 'No aceptado por universidad destino',
  EN_MOVILIDAD: 'En movilidad',
  DOCUMENTACION_RETORNO: 'Documentación de retorno pendiente',
  CONCLUIDO: 'Concluido',
  FINALIZADO: 'Concluido',
  RECHAZADA: 'Rechazado',
  CANCELADO: 'Cancelado',
  INVITACION_ENVIADA: 'Invitación enviada',
  PENDIENTE_REGISTRO: 'Esperando registro del estudiante',
  PENDIENTE_ESTUDIANTE: 'Pendiente del estudiante',
};

const STATUS_DESCRIPTIONS = {
  BORRADOR: 'La postulación existe, pero todavía no fue enviada a OCRI.',
  ENVIADA: 'El estudiante envió su expediente y OCRI puede iniciar la revisión.',
  EN_REVISION_DOCUMENTAL: 'Estado heredado; OCRI debe decidir directamente desde Postulado.',
  OBSERVADA: 'OCRI solicitó una subsanación. El estudiante corrige y la devuelve a revisión.',
  OBSERVADO: 'Hay una subsanación pendiente de corrección antes de continuar.',
  APROBADA_OCRI: 'Estado heredado: el expediente está listo para ser nominado por OCRI.',
  ADMITIDO_UNSAAC:
    'OCRI determinó que el estudiante cumple los requisitos. Falta adjuntar el oficio para formalizar la nominación.',
  NOMINADO_UNSAAC:
    'OCRI comunicó la nominación a la universidad de destino; se espera su respuesta.',
  EN_EVALUACION_DESTINO: 'Estado heredado de espera de respuesta de la universidad de destino.',
  CARTA_PENDIENTE:
    'El estudiante cargó la carta. OCRI debe verificarla antes de confirmar la aceptación.',
  NO_ACEPTADO_DESTINO:
    'La universidad de destino no aceptó la postulación. Este resultado es definitivo para la convocatoria.',
  ACEPTADO: 'El estudiante cargó la carta de aceptación y puede continuar el trámite.',
  EN_MOVILIDAD: 'El periodo de movilidad académica ya está en curso.',
  DOCUMENTACION_RETORNO:
    'Al retornar, el estudiante debe cargar su convalidación de cursos y certificado de estudios para el cierre.',
  FINALIZADA: 'La movilidad académica concluyó.',
  RECHAZADA:
    'El postulante no es apto para esta convocatoria. El motivo queda registrado en el historial.',
  CANCELADO: 'La postulación fue retirada o cancelada y permanece visible en el historial.',
  INVITACION_ENVIADA:
    'La universidad de origen recibió la invitación para que el estudiante complete el proceso.',
  PENDIENTE: 'Aún falta una acción o una revisión.',
  SUBIDO: 'El archivo fue cargado y espera revisión.',
  APROBADO: 'El documento fue revisado favorablemente.',
  RECHAZADO: 'El documento no cumple con lo solicitado.',
  SALIENTE: 'Movilidad de estudiantes UNSAAC hacia otra universidad.',
  ENTRANTE: 'Movilidad de estudiantes externos hacia la UNSAAC.',
};

export function esc(s) {
  return String(s ?? '').replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character],
  );
}

export function shortDate(value) {
  const [year, month, day] = String(value || '').split('-');
  return year && month && day ? `${day}/${month}/${year.slice(-2)}` : 'Por definir';
}

export function fullDateTime(value) {
  if (!value) return 'Sin fecha registrada';
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value || '',
  );
}

export function badge(status) {
  const s = STATUS_LABELS[status] || status.replaceAll('_', ' ');
  const description = STATUS_DESCRIPTIONS[status] || `Estado actual: ${s}.`;
  const cls = /APROBAD|ACEPTAD|ACTIVA|COMPLETO|CONFIRMADO|CONCLUID|FINALIZAD/.test(status)
    ? 'ok'
    : /OBSERVAD|RECHAZAD|NO_ACEPTADO|CANCELADO/.test(status)
      ? 'bad'
      : /REVISION|VALIDACION|ENVIADA|SUBIDO|NOMINADO|EVALUACION|MOVILIDAD/.test(status)
        ? 'info'
        : /PENDIENTE|BORRADOR|INVITACION/.test(status)
          ? 'warn'
          : 'neutral';
  return { label: s, description, class: cls };
}

export function isClosedApplication(application) {
  return /RECHAZAD|NO_ACEPTADO|FINALIZAD|CONCLUID|CANCELAD/.test(application.status);
}

export function isOperationalApplication(application) {
  return application.status !== 'BORRADOR' && !isClosedApplication(application);
}

export function successfulMobilityHistory(application, allApplications) {
  return allApplications.filter(
    (item) =>
      item.applicantId === application.applicantId &&
      item.id !== application.id &&
      item.direction === 'SALIENTE' &&
      item.activityType === 'MOVILIDAD' &&
      ['ACEPTADO', 'EN_MOVILIDAD', 'FINALIZADA'].includes(item.status),
  );
}

export function mobilityEligibility(application, allApplications) {
  if (application.direction !== 'SALIENTE' || application.activityType !== 'MOVILIDAD')
    return { applies: false, conflicts: [] };
  const previous = successfulMobilityHistory(application, allApplications);
  const year = String(application.period || '').slice(0, 4);
  const conflicts = [];
  if (previous.some((item) => String(item.period || '').startsWith(year)))
    conflicts.push(`Ya registra una movilidad durante ${year}.`);
  if (previous.some((item) => item.mobilityScope === application.mobilityScope))
    conflicts.push(
      `Ya utilizó su única movilidad ${String(application.mobilityScope).toLowerCase()}.`,
    );
  return { applies: true, conflicts };
}

export function canStudentWithdrawApplication(session, application) {
  return (
    session?.role === 'student' &&
    application.direction === 'SALIENTE' &&
    application.applicantId === session.userId &&
    application.status === 'ENVIADA'
  );
}

export function opportunityLabel(application) {
  if (application.activityType === 'PROGRAMA') return 'Programa especial · sin restricciones';
  if (application.activityType === 'PASANTIA') return 'Pasantía · sin restricciones';
  return `Movilidad ${String(application.mobilityScope || 'por clasificar').toLowerCase()}`;
}

export function filteredApps(applications, session, direction) {
  let a = applications.filter((x) => x.direction === direction);
  if (['student', 'external'].includes(session?.role))
    a = a.filter((x) => x.applicantId === session.userId);
  if (session?.role === 'external_manager')
    a = a.filter((x) => session.university && x.applicant.university === session.university);
  return a;
}

export function getActiveStudentApplication(applications, session) {
  const studentApps = filteredApps(applications, session, 'SALIENTE');
  return studentApps.find((application) => !isClosedApplication(application)) || null;
}

export function getActiveMobilityApplication(applications, session, direction) {
  const apps = filteredApps(
    applications,
    session,
    direction || (session?.role === 'external' ? 'ENTRANTE' : 'SALIENTE'),
  );
  return apps.find((application) => !isClosedApplication(application)) || null;
}

export function pendingApplications(applications, direction = '') {
  return applications.filter(
    (application) =>
      isOperationalApplication(application) &&
      application.status !== 'EN_MOVILIDAD' &&
      (!direction || application.direction === direction),
  );
}

export function applicationsInMobility(applications) {
  return applications.filter(
    (application) => isOperationalApplication(application) && application.status === 'EN_MOVILIDAD',
  );
}

export { STATUS_LABELS, STATUS_DESCRIPTIONS };
