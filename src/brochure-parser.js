const normalizeForMatch = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const cleanText = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?%)])/g, '$1')
    .replace(/([(¿¡])\s+/g, '$1')
    .replace(/\.{2,}/g, '.')
    .replace(/^(\p{Lu})\s+(\p{Ll}{2,})/u, '$1$2')
    .replace(/\bd\s+ocente\b/gi, 'docente')
    .replace(/\bEncontrase\b/gi, 'Encontrarse')
    .trim();

const sentenceCase = (value) => {
  const text = cleanText(value);
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : '';
};

const titleCase = (value) =>
  cleanText(value)
    .toLocaleLowerCase('es-PE')
    .replace(/(^|[\s(-])([a-záéíóúñü])/g, (_, prefix, letter) => prefix + letter.toUpperCase())
    .replace(/\b(De|Del|La|Las|El|Los|Y|E|En)\b/g, (word, offset) =>
      offset === 0 ? word : word.toLowerCase(),
    )
    .replace(/\b(UNSAAC|BUAP|PUCP|UNAM)\b/gi, (word) => word.toUpperCase());

const unique = (values) => [...new Set(values.filter(Boolean))];

const COUNTRIES = [
  'Argentina',
  'Bolivia',
  'Brasil',
  'Canadá',
  'Chile',
  'Colombia',
  'Costa Rica',
  'Cuba',
  'Ecuador',
  'España',
  'Estados Unidos',
  'Francia',
  'Italia',
  'Japón',
  'México',
  'Panamá',
  'Paraguay',
  'Perú',
  'Portugal',
  'Reino Unido',
  'Uruguay',
];

const PERUVIAN_INSTITUTION_PATTERN =
  /\b(pucp|pontificia universidad catolica del peru|unmsm|universidad nacional mayor de san marcos|universidad del pacifico|universidad peruana de ciencias aplicadas|\bupc\b|universidad de lima|ulima|universidad san ignacio de loyola|\busil\b|universidad nacional de ingenieria|\buni\b|universidad nacional agraria la molina|\bunal?m\b|universidad nacional de san antonio abad|unsaac|universidad catolica santa maria|ucsm|universidad nacional de san agustin|unsa|universidad cesar vallejo|\bucv\b)\b/i;

const PERUVIAN_CITY_PATTERN =
  /\b(lima|cusco|cuzco|arequipa|trujillo|piura|chiclayo|huancayo|ica|tacna|puno|ayacucho|cajamarca|huanuco|tarapoto|chimbote|moquegua)\b/i;

const EXTERNAL_UNIVERSITY_PATTERN =
  /\b(buap|unam|ipn|tec de monterrey|udem|universidad autonoma de puebla|universidad nacional autonoma de mexico)\b/i;

const MONTHS = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

function sectionLines(pages, startsSection, endsSection) {
  const result = [];
  let active = false;
  for (const page of pages) {
    for (const originalLine of page.lines || []) {
      const line = cleanText(originalLine);
      const normalized = normalizeForMatch(line);
      if (!active && startsSection(normalized)) {
        active = true;
        continue;
      }
      if (active && endsSection(normalized)) return result;
      if (active && line) result.push(line);
    }
  }
  return result;
}

function groupNumberedLines(lines) {
  const groups = [];
  let current = '';
  let currentNumber = null;
  const numbers = [];

  for (const line of lines) {
    const match = line.match(/^\s*(\d{1,2})\s*[.)-]\s*(.*)$/);
    if (match) {
      if (current) groups.push(cleanText(current));
      currentNumber = Number(match[1]);
      numbers.push(currentNumber);
      current = match[2];
    } else if (currentNumber !== null) {
      current = `${current} ${line}`;
    }
  }
  if (current) groups.push(cleanText(current));
  return { groups, numbers };
}

function groupRequirements(lines) {
  const requirements = [];
  let current = '';
  const startsRequirement =
    /^(ser|estar|encontrar(?:se)?|encontrarse|pertenecer|no haber|haber|tener|contar|acreditar|presentar|cursar|poseer|mantener|promedio)\b/i;

  for (const originalLine of lines) {
    const line = cleanText(originalLine).replace(/^[•*·-]\s*/, '');
    const numbered = line.match(/^\d{1,2}\s*[.)-]\s*(.*)$/);
    const content = numbered ? numbered[1] : line;
    const isNew = Boolean(numbered || (current && startsRequirement.test(content)));
    if (isNew) {
      if (current) requirements.push(sentenceCase(current));
      current = content;
    } else {
      current = `${current} ${content}`.trim();
    }
  }
  if (current) requirements.push(sentenceCase(current));
  return unique(requirements);
}

function parseDocument(value) {
  const withoutClicks = cleanText(value)
    .replace(/\((?:hacer\s+)?click\)/gi, '')
    .trim();
  const parenthetical = [...withoutClicks.matchAll(/\(([^)]+)\)/g)].map((match) => match[1]);
  const title = cleanText(withoutClicks.replace(/\s*\([^)]+\)\s*/g, ' '));
  const afterAcceptance = /despu[eé]s de (?:su |la )?carta de aceptaci[oó]n/i.test(withoutClicks);
  return {
    title: sentenceCase(title),
    description: parenthetical.map(sentenceCase).join(' '),
    required: !afterAcceptance,
    stage: afterAcceptance ? 'AFTER_ACCEPTANCE' : 'APPLICATION',
  };
}

function findUniversity(lines, fileName = '') {
  const candidates = [
    ...lines,
    String(fileName || '')
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' '),
  ]
    .map(cleanText)
    .filter((line) => {
      const normalized = normalizeForMatch(line);
      return (
        normalized.includes('universidad') &&
        !normalized.includes('unsaac') &&
        !/universidad (?:de origen|de destino)/.test(normalized) &&
        normalized.length < 130
      );
    });
  if (!candidates.length) return '';
  const candidate = candidates
    .sort((a, b) => b.length - a.length)[0]
    .replace(/^(.{20,}?)\s*[-–]\s*\1(?:\s*[-–])?$/i, '$1')
    .replace(/\s*[-–]\s*$/, '');
  return titleCase(candidate);
}

function inferMobilityScope(country, university, fileName) {
  if (country) return country === 'Perú' ? 'NACIONAL' : 'INTERNACIONAL';
  const context = `${university || ''} ${fileName || ''}`;
  if (PERUVIAN_INSTITUTION_PATTERN.test(context) || PERUVIAN_CITY_PATTERN.test(context))
    return 'NACIONAL';
  if (EXTERNAL_UNIVERSITY_PATTERN.test(context) || university) return 'INTERNACIONAL';
  return 'UNKNOWN';
}

function findCountry(text) {
  const normalized = normalizeForMatch(text);
  return COUNTRIES.find((country) => normalized.includes(normalizeForMatch(country))) || '';
}

function findClosingDate(pages, fallbackYear) {
  const firstPagesText = pages
    .slice(0, 2)
    .flatMap((page) => page.lines || [])
    .map(cleanText)
    .join(' ');
  const normalized = normalizeForMatch(firstPagesText);
  const month = Object.keys(MONTHS).find((name) => normalized.includes(name));
  if (!month) return { date: null, text: null };

  const monthIndex = normalized.indexOf(month);
  const nearby = normalized.slice(Math.max(0, monthIndex - 90), monthIndex + month.length + 30);
  const directDate = normalized.match(
    new RegExp(`\\b([1-9]|[12]\\d|3[01])\\s+(?:de\\s+)?${month}\\b(?:\\s+de\\s+(20\\d{2}))?`),
  );
  const nearbyDays = [...nearby.matchAll(/\b([1-9]|[12]\d|3[01])\b/g)].map((match) =>
    Number(match[1]),
  );
  const day = Number(directDate?.[1] || nearbyDays.at(-1) || 0);
  const explicitYear = directDate?.[2];
  const text = day ? `${day} de ${month}${explicitYear ? ` de ${explicitYear}` : ''}` : month;
  if (!day) return { date: null, text };
  const year = explicitYear || String(fallbackYear);
  return {
    date: `${year}-${String(MONTHS[month]).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    text,
  };
}

export function academicPeriodForDate(referenceDate = new Date()) {
  const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  if (Number.isNaN(date.getTime())) throw new Error('La fecha de referencia no es válida.');
  const year = date.getFullYear();
  return date.getMonth() < 6 ? `${year}-II` : `${year + 1}-I`;
}

export function parseBrochureContent(pages, links = [], options = {}) {
  const referenceDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
  if (Number.isNaN(referenceDate.getTime()))
    throw new Error('La fecha de referencia no es válida.');
  const lines = pages
    .flatMap((page) => page.lines || [])
    .map(cleanText)
    .filter(Boolean);
  const fullText = lines.join('\n');
  if (normalizeForMatch(fullText).length < 80) {
    throw new Error(
      'El PDF no contiene suficiente texto seleccionable. Si es un documento escaneado, crea la convocatoria manualmente o utiliza una versión exportada desde Word, Canva o PowerPoint.',
    );
  }

  const headingLines = [];
  let reachedDetailSection = false;
  pages.forEach((page) =>
    (page.lines || []).forEach((line) => {
      if (/requisitos? generales?|documentos? (?:a |por )?presentar/i.test(line))
        reachedDetailSection = true;
      if (!reachedDetailSection) headingLines.push(line);
    }),
  );
  const periodMatch = headingLines.join('\n').match(/\b(20\d{2})\s*[-–]\s*(I{1,2})\b/i);
  const period = periodMatch
    ? `${periodMatch[1]}-${periodMatch[2].toUpperCase()}`
    : academicPeriodForDate(referenceDate);
  const fileName = String(options.fileName || '');
  const university = findUniversity(lines, fileName);
  const country = findCountry(`${fullText}\n${fileName}`);
  const mobilityScope = inferMobilityScope(country, university, fileName);
  const deadline = findClosingDate(pages, referenceDate.getFullYear());

  const requirementLines = sectionLines(
    pages,
    (line) => /requisitos? generales?/.test(line),
    (line) => /documentos? (?:a |por )?presentar|documentacion requerida/.test(line),
  );
  const guidelines = groupRequirements(requirementLines);

  const documentLines = sectionLines(
    pages,
    (line) => /documentos? (?:a |por )?presentar|documentacion requerida/.test(line),
    (line) => /^(ojo|importante)\b/.test(line),
  );
  const numberedDocuments = groupNumberedLines(documentLines);
  const documents = numberedDocuments.groups.map(parseDocument).filter((item) => item.title);

  const linkEntries = links.map((link) =>
    typeof link === 'string' ? { url: link, pageNumber: null } : link,
  );
  const importantPage = pages.find((page) =>
    (page.lines || []).some((line) => /^importante\b/.test(normalizeForMatch(line))),
  )?.pageNumber;
  const importantUrls = linkEntries
    .filter((link) => importantPage && link.pageNumber === importantPage)
    .map((link) => link.url);
  const documentUrls = linkEntries
    .filter((link) => importantPage && link.pageNumber && link.pageNumber < importantPage)
    .map((link) => link.url);
  const importantLines = sectionLines(
    pages,
    (line) => /^importante\b/.test(line),
    () => false,
  );
  const numberedNotices = groupNumberedLines(importantLines).groups;
  const notices = numberedNotices.map((text, index) => ({
    text: sentenceCase(text.replace(/\((?:hacer\s+)?click\)/gi, '').trim()),
    url: importantUrls[index] || '',
  }));
  const eyeNotice = pages
    .map((page) => {
      const index = (page.lines || []).findIndex((line) => /^ojo\s*:/i.test(cleanText(line)));
      if (index < 0) return '';
      return cleanText(
        (page.lines || [])
          .slice(index, index + 3)
          .join(' ')
          .replace(/^ojo\s*:\s*/i, ''),
      );
    })
    .find(Boolean);
  if (eyeNotice) notices.unshift({ text: sentenceCase(eyeNotice), url: '' });
  documentUrls.forEach((url, index) => {
    const linkedDocuments = documents.filter((document) =>
      /contrato de estudios|carta de compromiso/i.test(document.title),
    );
    notices.push({
      text: linkedDocuments[index]
        ? `Formato: ${linkedDocuments[index].title.replace(/[.]$/, '')}`
        : `Formato incluido en el brochure ${index + 1}`,
      url,
    });
  });
  importantUrls
    .slice(numberedNotices.length)
    .forEach((url, index) =>
      notices.push({ text: `Enlace adicional del brochure ${index + 1}`, url }),
    );

  const normalizedText = normalizeForMatch(fullText);
  const warnings = [];
  if (!periodMatch)
    warnings.push(
      `El brochure no muestra el periodo; SIGMA asignó ${period} según la fecha actual.`,
    );
  if (!university) warnings.push('No se reconoció claramente la universidad; completa el título.');
  if (mobilityScope === 'UNKNOWN')
    warnings.push('No se pudo determinar si la movilidad es nacional o internacional; confírmala.');
  if (!deadline.date) warnings.push('No se reconoció la fecha límite; complétala manualmente.');
  if (!guidelines.length) warnings.push('No se reconocieron requisitos generales.');
  if (!documents.length) warnings.push('No se reconocieron documentos a presentar.');
  if (new Set(numberedDocuments.numbers).size !== numberedDocuments.numbers.length)
    warnings.push(
      'El brochure repite números en la lista de documentos; SIGMA los reordenó por aparición.',
    );

  const confidenceSignals = [
    period,
    university,
    guidelines.length >= 2,
    documents.length >= 2,
  ].filter(Boolean).length;
  const title = university
    ? `Movilidad académica · ${university}${country ? ` (${country})` : ''}`
    : period
      ? `Movilidad académica ${period}`
      : '';

  return {
    title,
    university_name: university,
    country,
    direction:
      normalizedText.includes('estudiante de la unsaac') ||
      normalizedText.includes('desde la unsaac')
        ? 'SALIENTE'
        : 'UNKNOWN',
    period,
    activity_type: /pasant[ií]a/.test(normalizedText)
      ? 'PASANTIA'
      : /programa especial/.test(normalizedText)
        ? 'PROGRAMA'
        : 'MOVILIDAD',
    mobility_scope: mobilityScope,
    closing_date: deadline.date,
    closing_date_text: deadline.text,
    guidelines,
    documents,
    important_notices: notices,
    confidence: confidenceSignals === 4 ? 'HIGH' : confidenceSignals >= 2 ? 'MEDIUM' : 'LOW',
    warnings,
    extraction_method: 'LOCAL_PDF_TEXT',
  };
}
