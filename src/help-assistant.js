import { STATUS_DESCRIPTIONS, STATUS_LABELS } from './utils.js';

const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const topics = [
  {
    id: 'return-documents',
    terms: [
      'convalidacion',
      '12 creditos',
      'certificado de estudios',
      'documentos de retorno',
      'concluir movilidad',
      'volver',
    ],
    answer: (context) =>
      context.direction === 'ENTRANTE'
        ? 'Al terminar tu movilidad en la UNSAAC, coordina con OCRI y tu universidad de origen los documentos académicos de cierre. OCRI registra la conclusión del expediente entrante. La exigencia de 12 créditos convalidados corresponde a estudiantes UNSAAC en movilidad saliente.'
        : 'Al terminar la movilidad, sube dos archivos: la convalidación de cursos (debe acreditar al menos 12 créditos) y el certificado de estudios de la universidad de destino. OCRI revisará ambos; el expediente se concluye cuando los dos tengan visto bueno.',
  },
  {
    id: 'letter',
    terms: ['carta de aceptacion', 'carta', 'aceptacion', 'validar carta'],
    answer: (context) =>
      context.direction === 'ENTRANTE'
        ? 'En movilidad entrante, OCRI registra la aceptación por UNSAAC y adjunta tu carta oficial de aceptación. También debe adjuntar la resolución de matrícula antes de iniciar la movilidad. Si el resultado es “No apto”, OCRI adjunta el documento correspondiente.'
        : 'Subir la carta no confirma la aceptación automáticamente. OCRI verifica que sea válida y recién entonces actualiza el expediente a “Aceptado”. Si la universidad no te aceptó, OCRI registra ese resultado.',
  },
  {
    id: 'observed',
    terms: ['subsanar', 'observada', 'observacion', 'corregir', 'comentario ocri'],
    answer: (context) =>
      context.status === 'OBSERVADA' && context.statusNote
        ? `Tu expediente requiere una corrección: ${context.statusNote} Corrige lo indicado y vuelve a enviar la postulación desde el expediente.`
        : '“Subsanación requerida” significa que OCRI dejó una observación para corregir. Revisa el comentario del expediente, corrige el documento o dato indicado y vuelve a enviarlo; luego regresará a la decisión de OCRI.',
  },
  {
    id: 'not-eligible',
    terms: ['no apto', 'no admitido', 'no cumple', 'rechazado', 'por que me rechazaron'],
    answer: () =>
      '“No apto” o “No admitido” indica que no se cumplieron uno o más requisitos de esa convocatoria. Revisa el motivo registrado en el historial o expediente. El resultado es definitivo para esa postulación, que permanece en tu historial.',
  },
  {
    id: 'status',
    terms: [
      'mi estado',
      'estado actual',
      'que significa mi estado',
      'significado del estado',
      'en que estado',
    ],
    answer: (context) => {
      if (!context.status)
        return 'Abre tu postulación o expediente para consultar el estado actual y su historial con fechas.';
      const label =
        context.statusLabel || STATUS_LABELS[context.status] || context.status.replaceAll('_', ' ');
      const description =
        context.statusDescription ||
        STATUS_DESCRIPTIONS[context.status] ||
        'Consulta el historial del expediente para ver qué ocurrió y cuándo.';
      const note =
        context.status === 'OBSERVADA' && context.statusNote
          ? ` OCRI indicó: ${context.statusNote}`
          : '';
      return `Tu expediente está en “${label}”. ${description}${note}`;
    },
  },
  {
    id: 'flow',
    terms: ['flujo', 'proceso', 'pasos', 'que sigue', 'como funciona', 'etapas'],
    answer: (context) =>
      context.direction === 'ENTRANTE'
        ? 'En SGME, la universidad de origen nomina al estudiante; este completa sus datos académicos UNSAAC y documentos; OCRI evalúa y puede pedir subsanación, declarar no apto o aceptarlo. OCRI adjunta la carta de aceptación y la resolución de matrícula, registra el inicio de la movilidad y finalmente concluye el expediente.'
        : 'En SGMS, el estudiante completa y envía la postulación; OCRI puede pedir subsanación, marcarla como no apta o admitir al estudiante por UNSAAC. Tras adjuntar el oficio se espera la respuesta de destino y OCRI valida la carta de aceptación. Durante y al volver de movilidad se registran los documentos y la conclusión del expediente.',
  },
  {
    id: 'requirements',
    terms: [
      'requisitos',
      'documentos obligatorios',
      'que debo subir',
      'que documentos',
      'documentos de postulacion',
    ],
    answer: (context) => {
      const required = (context.documents || []).filter((document) => document.required);
      if (!required.length)
        return 'Los documentos dependen de cada convocatoria. Abre Convocatorias y revisa la sección “Documentos a presentar”; allí se indica qué es obligatorio y qué es opcional.';
      const missing = required
        .filter((document) => !document.storagePath)
        .map((document) => document.name);
      return missing.length
        ? `En tu expediente aún falta${missing.length === 1 ? '' : 'n'}: ${missing.join('; ')}. Revisa también los requisitos particulares de la convocatoria.`
        : 'Los documentos obligatorios de tu expediente aparecen cargados. Antes de enviar, revisa que sean legibles y correspondan a los requisitos de la convocatoria.';
    },
  },
  {
    id: 'nomination',
    terms: ['nominacion', 'oficio', 'admitido por unsaac', 'nominar'],
    answer: (context) =>
      context.direction === 'ENTRANTE'
        ? 'Tu universidad de origen registra la nominación. Después completas la facultad y escuela profesional de destino en la UNSAAC y los documentos solicitados. OCRI revisa tu expediente y registra el resultado de la postulación.'
        : '“Admitido por UNSAAC” indica que OCRI confirmó que cumples los requisitos. Luego OCRI adjunta el oficio para formalizar la nominación; el expediente pasa a esperar la respuesta de la universidad de destino.',
  },
];

export function answerHelpQuestion(question, context = {}) {
  const query = normalize(question);
  if (!query) return 'Escribe tu duda o elige uno de los temas sugeridos.';
  const match = topics
    .map((topic) => ({
      topic,
      score: topic.terms.reduce(
        (score, term) =>
          score + (query.includes(normalize(term)) ? normalize(term).split(' ').length : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score)[0];
  if (match?.score) return match.topic.answer(context);
  return 'Puedo orientarte sobre estados, subsanaciones, nominaciones, cartas de aceptación, requisitos y documentos de retorno. Para una consulta específica de tu expediente que no aparece aquí, revisa el historial o comunícate con OCRI.';
}
