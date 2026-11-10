// Las relaciones múltiples no garantizan el orden de sus filas en la API.
export function orderedCallItems(items) {
  return [...(items || [])].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

// call_notices.call_id es único: PostgREST devuelve un objeto, no una lista.
// También se aceptan listas para mantener compatibilidad con respuestas anteriores.
export function mapCallNotice(relation) {
  const notice = Array.isArray(relation) ? relation[0] : relation;
  return {
    description: notice?.description || '',
    links: orderedCallItems(notice?.call_notice_links).map((item) => ({
      label: item.label,
      url: item.url || '',
      kind: item.kind || 'ADDITIONAL',
    })),
  };
}
