// La fecha límite incluye todo el día en la zona horaria de la UNSAAC.
export function callLifecycle(call, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const expired = Boolean(call.end && call.end < today);
  const concluded = Boolean(call.concludedAt || call.status === 'CERRADA');
  const archived = Boolean(call.archivedAt);
  const open = call.status === 'ACTIVA' && !expired && !concluded && !archived;
  return {
    expired,
    concluded,
    archived,
    open,
    label: concluded
      ? 'Concluida'
      : expired && call.status === 'ACTIVA'
        ? 'Plazo vencido'
        : call.status === 'ACTIVA'
          ? 'Activa'
          : 'Borrador',
  };
}
