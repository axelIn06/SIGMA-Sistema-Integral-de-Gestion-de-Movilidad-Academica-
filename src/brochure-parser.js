export const normalizeForMatch = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export const cleanText = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?%)])/g, '$1')
    .replace(/([(¿¡])\s+/g, '$1')
    .replace(/\.{2,}/g, '.')
    .replace(/^(\p{Lu})\s+(\p{Ll}{2,})/u, '$1$2')
    .replace(/\bd\s+ocente\b/gi, 'docente')
    .replace(/\bdur\s+ante\b/gi, 'durante')
    .replace(/\bCart\s+a\b/g, 'Carta')
    .replace(/\bEncontrase\b/gi, 'Encontrarse')
    .trim();

export const sentenceCase = (value) => {
  const text = cleanText(value);
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : '';
};

export const titleCase = (value) =>
  cleanText(value)
    .toLocaleLowerCase('es-PE')
    .replace(/(^|[\s(-])([a-záéíóúñü])/g, (_, prefix, letter) => prefix + letter.toUpperCase())
    .replace(/\b(De|Del|La|Las|El|Los|Y|E|En)\b/g, (word, offset) =>
      offset === 0 ? word : word.toLowerCase(),
    )
    .replace(/\b(UNSAAC|BUAP|PUCP|UNAM)\b/gi, (word) => word.toUpperCase());

export const unique = (values) => [...new Set(values.filter(Boolean))];

const IMPORTANT_HEADING =
  /^(?:importante|avisos? importantes?|consideraciones importantes?|ten en cuenta|atencion)\b/i;

const DOCUMENT_HEADING =
  /^(?:documentos?(?: (?:a |por )?presentar)?|documentacion requerida)\b\s*:?[\s-]*/i;

function cleanBrochurePages(pages) {
  return pages.map((page) => {
    const entries = (page.lines || [])
      .map((line, index) => ({
        ...page.lineEntries?.[index],
        text: cleanText(line.replace(/\bU\s+N\s+S\s+A\s+A\s+C\b/gi, '')),
      }))
      .filter(
        (entry) =>
          entry.text &&
          !/^(?:OCRI|OFICINA DE COOPERACI[ÓO]N(?: Y RELACIONES INTERNACIONALES UNSAAC)?|Y RELACIONES|INTERNACIONALES UNSAAC)$/i.test(
            entry.text,
          ),
      );
    return { ...page, lines: entries.map((entry) => entry.text), lineEntries: entries };
  });
}

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

export function sectionLines(pages, startsSection, endsSection) {
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

function labeledSectionEntries(pages, heading, endHeading) {
  const result = [];
  let active = false;
  for (const page of pages) {
    for (const [index, originalLine] of (page.lines || []).entries()) {
      const line = cleanText(originalLine);
      const normalized = normalizeForMatch(line);
      const position = page.lineEntries?.[index] || {};
      const entry = (text) => ({
        text,
        pageNumber: page.pageNumber,
        y: Number.isFinite(position.y) ? position.y : null,
      });
      if (!active) {
        if (!heading.test(normalized)) continue;
        active = true;
        const firstItem = cleanText(line.slice(normalized.match(heading)[0].length));
        if (firstItem) result.push(entry(firstItem));
        continue;
      }
      if (endHeading.test(normalized)) return result;
      if (line && !/^(movilidad|academica|movilidad academica)$/i.test(normalized))
        result.push(entry(line));
    }
  }
  return result;
}

function labeledSectionLines(pages, heading, endHeading) {
  return labeledSectionEntries(pages, heading, endHeading).map((entry) => entry.text);
}

export function groupNumberedLines(lines) {
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

export function groupRequirements(lines) {
  const requirements = [];
  let current = '';
  const startsRequirement =
    /^(el alumno|la alumna|el estudiante|la estudiante|ser|estar|encontrar(?:se)?|encontrarse|pertenecer|no haber|haber|tener|reunir|contar|acreditar|presentar|cursar|poseer|mantener|promedio)\b/i;

  for (const originalLine of lines) {
    const line = cleanText(originalLine).replace(/^[•*·-]\s*/, '');
    const numbered = line.match(/^\d{1,2}\s*[.)-]\s*(.*)$/);
    const content = numbered ? numbered[1] : line;
    const isNew = Boolean(
      numbered || (current && !/\b(?:y|o)\s*$/i.test(current) && startsRequirement.test(content)),
    );
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

const DOCUMENT_START_PATTERN =
  /^(?:carta|constancia|historial|copia|formato|pasaporte|fotograf[ií]a|foto|curr[ií]culum|contrato|ficha|certificado|dni|visa|formulario|plan de estudios|s[ií]labo)\b/i;

function groupUnnumberedDocuments(lines) {
  const groups = [];
  let current = '';
  for (const originalLine of lines) {
    const line = cleanText(originalLine).replace(/^[•*·-]\s*/, '');
    if (!line) continue;
    if (current && DOCUMENT_START_PATTERN.test(line)) {
      groups.push(cleanText(current));
      current = line;
    } else {
      current = `${current} ${line}`.trim();
    }
  }
  if (current) groups.push(cleanText(current));
  return groups;
}

export function parseDocument(value) {
  const withoutClicks = cleanText(value)
    .replace(/\(\s*(?:(?:hacer\s+)?click|ver\s+aqu[ií]|aqu[ií])\s*\)/gi, '')
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

function linkCenterY(link) {
  return Array.isArray(link.rect) && link.rect.length === 4
    ? (Number(link.rect[1]) + Number(link.rect[3])) / 2
    : null;
}

function attachDocumentLinks(documents, entries, numbered, links) {
  const startPattern = numbered ? /^\d{1,2}\s*[.)-]\s*/ : DOCUMENT_START_PATTERN;
  const starts = entries.filter((entry, index) => index === 0 || startPattern.test(entry.text));
  const assigned = new Set();
  const withLinks = documents.map((document, index) => {
    const start = starts[index];
    const next = starts[index + 1];
    if (!start || start.y === null) return { ...document, url: '' };
    const matchIndex = links.findIndex((link, linkIndex) => {
      const y = linkCenterY(link);
      return (
        !assigned.has(linkIndex) &&
        link.pageNumber === start.pageNumber &&
        y !== null &&
        y <= start.y + 12 &&
        start.y - y <= 100 &&
        (next?.pageNumber !== start.pageNumber || y > next.y + 8)
      );
    });
    if (matchIndex < 0) return { ...document, url: '' };
    assigned.add(matchIndex);
    return { ...document, url: links[matchIndex].url };
  });
  return { documents: withLinks, assigned };
}

function processLinkLabel(page, link) {
  const centerY = linkCenterY(link);
  if (centerY === null) return '';
  const left = Number(link.rect[0]);
  const row = (page.lineEntries || [])
    .filter((entry) => Number.isFinite(entry.y))
    .sort((a, b) => {
      const nearbyContent = (entry) =>
        (entry.items || []).some(
          (item) =>
            item.x < left + 8 &&
            item.x >= left - 200 &&
            !/^\(?\s*(?:click|ver aqui)\s*\)?$/i.test(normalizeForMatch(item.text)),
        );
      return (
        Math.abs(a.y - centerY) +
        (nearbyContent(a) ? 0 : 40) -
        Math.abs(b.y - centerY) -
        (nearbyContent(b) ? 0 : 40)
      );
    })[0];
  if (!row || Math.abs(row.y - centerY) > 28) return '';
  const nearby = (row.items || [])
    .filter((item) => item.x < left + 8 && item.x >= left - 200)
    .map((item) => item.text)
    .filter((text) => !/^\(?\s*(?:click|ver aqui)\s*\)?$/i.test(normalizeForMatch(text)));
  let label = cleanText(nearby.join(' ')) || cleanText(row.text);
  label = label.replace(/\s*\((?:ver aqu[ií]|click)\).*$/i, '');
  if (/^https?:\/\//i.test(label)) {
    const previous = (page.lineEntries || [])
      .filter((entry) => entry.y > row.y && entry.y - row.y < 35)
      .sort((a, b) => a.y - b.y)[0];
    label = previous ? cleanText(previous.text) : 'Enlace del proceso';
  }
  return sentenceCase(label.replace(/[:.]\s*$/, ''));
}

function processNotices(pages, links) {
  const result = [];
  for (const page of pages) {
    const headingIndex = (page.lines || []).findIndex((line) =>
      /^(?:proceso de postulacion|pasos para postular|como postular)\b/.test(
        normalizeForMatch(line),
      ),
    );
    if (headingIndex < 0) continue;
    const entries = (page.lineEntries || []).slice(headingIndex + 1);
    const firstSede = entries.find((entry) => /^sede\b/i.test(cleanText(entry.text)));
    const width = page.width || 700;
    const introduction = entries
      .filter(
        (entry) =>
          (!firstSede || entry.y > firstSede.y) &&
          entry.x < width * 0.56 &&
          !/^(?:sede|ver los cursos|complete|registrarse|video institucional|https?:)\b/i.test(
            cleanText(entry.text),
          ),
      )
      .map((entry) => entry.text)
      .join(' ');
    if (introduction)
      result.push({ text: `Proceso de postulación: ${sentenceCase(introduction)}`, url: '' });
    const pageLinks = links
      .filter((link) => link.pageNumber === page.pageNumber && linkCenterY(link) !== null)
      .map((link) => ({ link, label: processLinkLabel(page, link) }))
      .sort((a, b) => {
        const aSede = /^sede\b/i.test(a.label);
        const bSede = /^sede\b/i.test(b.label);
        return aSede === bSede ? linkCenterY(b.link) - linkCenterY(a.link) : aSede ? -1 : 1;
      });
    for (const { link, label } of pageLinks) {
      if (label) result.push({ text: label, url: link.url });
    }
  }
  return result;
}

function generalAdditionalNotices(pages, links) {
  const result = [];
  for (const page of pages) {
    const headingIndex = (page.lines || []).findIndex((line) => {
      const normalized = normalizeForMatch(line);
      return (
        !IMPORTANT_HEADING.test(normalized) &&
        /^(?:informacion adicional|recomendaciones|consideraciones|observaciones|indicaciones adicionales)\b/.test(
          normalized,
        )
      );
    });
    if (headingIndex < 0) continue;
    const heading = cleanText(page.lines[headingIndex]);
    const remaining = page.lines.slice(headingIndex + 1);
    const nextHeadingIndex = remaining.findIndex(
      (line) =>
        IMPORTANT_HEADING.test(normalizeForMatch(line)) ||
        /^(?:proceso de postulacion|documentos? a presentar|requisitos?)\b/.test(
          normalizeForMatch(line),
        ),
    );
    const body = nextHeadingIndex < 0 ? remaining : remaining.slice(0, nextHeadingIndex);
    const lines = body
      .filter(
        (line) =>
          !/^(?:movilidad|academica|movilidad academica|https?:\/\/)/i.test(
            normalizeForMatch(line),
          ),
      )
      .map((line) => cleanText(line.replace(/\(\s*(?:ver\s+aqu[ií]|click)\s*\)/gi, '')))
      .filter(Boolean);
    if (lines.length)
      result.push({ text: `${sentenceCase(heading)}: ${lines.join(' ')}`, url: '' });
    for (const link of links.filter((item) => item.pageNumber === page.pageNumber)) {
      const label = processLinkLabel(page, link);
      if (label) result.push({ text: label, url: link.url });
    }
  }
  return result;
}

function importantNotices(pages, links) {
  const entries = labeledSectionEntries(
    pages,
    /^(?:importante|avisos? importantes?|consideraciones importantes?|ten en cuenta|atencion)\b\s*:?[\s-]*/i,
    /^(?:visitanos|para mas informacion|contacto)\b/i,
  );
  if (!entries.length) return { notices: [], assigned: new Set() };
  const groups = [];
  for (const entry of entries) {
    const explicitItem = /^\s*(?:[•●▪◦*–-]\s*|\d{1,2}\s*[.)-]\s*)/.test(entry.text);
    const text = cleanText(entry.text.replace(/^\s*(?:[•●▪◦*–-]\s*|\d{1,2}\s*[.)-]\s*)/, ''));
    if (!text) continue;
    const likelyItem = /^(?:la carta|en la pagina|ojo\s*:)/i.test(normalizeForMatch(text));
    if (!groups.length || explicitItem || likelyItem) {
      groups.push({ text, start: entry });
    } else {
      groups.at(-1).text += ` ${text}`;
    }
  }
  const assigned = new Set();
  const notices = [];
  groups.forEach((group, index) => {
    const next = groups[index + 1]?.start;
    const matchingLinks = links
      .map((link, linkIndex) => ({ link, linkIndex }))
      .filter(({ link }) => {
        const y = linkCenterY(link);
        return (
          link.pageNumber === group.start?.pageNumber &&
          y !== null &&
          y <= group.start.y + 12 &&
          (next?.pageNumber !== group.start.pageNumber || y > next.y + 8)
        );
      });
    const text = sentenceCase(
      group.text.replace(/\(\s*(?:(?:hacer\s+)?click|ver\s+aqu[ií])\s*\)/gi, '').trim(),
    );
    if (!matchingLinks.length) {
      notices.push({ text, url: '' });
      return;
    }
    const seenUrls = new Set();
    matchingLinks.forEach(({ link, linkIndex }) => {
      assigned.add(linkIndex);
      if (seenUrls.has(link.url)) return;
      seenUrls.add(link.url);
      notices.push({
        text: seenUrls.size > 1 ? `${text} (enlace ${seenUrls.size})` : text,
        url: link.url,
      });
    });
  });
  return { notices, assigned };
}

export function findUniversity(lines, fileName = '') {
  const candidates = [
    ...lines,
    String(fileName || '')
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' '),
  ]
    .map((line) =>
      cleanText(line)
        .replace(/^(?:la|a la|en la)\s+(?=universidad\b)/i, '')
        .replace(/\s+en la modalidad\b.*$/i, '')
        .replace(/\s*:\s*$/, ''),
    )
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
  const institutionNames = candidates.filter((line) =>
    /^(?:benem[eé]rita|pontificia|universidad)\b/i.test(line),
  );
  const externalInstitutions = institutionNames.filter(
    (line) => !normalizeForMatch(line).includes('universidad nacional de san antonio abad'),
  );
  const candidate = (
    externalInstitutions.length
      ? externalInstitutions
      : institutionNames.length
        ? institutionNames
        : candidates
  )
    .sort((a, b) => b.length - a.length)[0]
    .replace(/^(.{20,}?)\s*[-–]\s*\1(?:\s*[-–])?$/i, '$1')
    .replace(/\s*[-–]\s*$/, '');
  return titleCase(candidate);
}

export function inferMobilityScope(country, university, fileName) {
  if (country) return country === 'Perú' ? 'NACIONAL' : 'INTERNACIONAL';
  const context = `${university || ''} ${fileName || ''}`;
  if (PERUVIAN_INSTITUTION_PATTERN.test(context) || PERUVIAN_CITY_PATTERN.test(context))
    return 'NACIONAL';
  if (EXTERNAL_UNIVERSITY_PATTERN.test(context) || university) return 'INTERNACIONAL';
  return 'UNKNOWN';
}

export function findCountry(text) {
  const normalized = normalizeForMatch(text);
  return COUNTRIES.find((country) => normalized.includes(normalizeForMatch(country))) || '';
}

export function findClosingDate(pages, fallbackYear) {
  const firstPagesText = pages
    .slice(0, 2)
    .flatMap((page) => page.lines || [])
    .map(cleanText)
    .join(' ');
  const normalized = normalizeForMatch(firstPagesText);
  const month = Object.keys(MONTHS).find((name) => new RegExp(`\\b${name}\\b`).test(normalized));
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
  const explicitYear =
    directDate?.[2] ||
    normalized
      .slice(monthIndex + month.length, monthIndex + month.length + 28)
      .match(/\b20\d{2}\b/)?.[0];
  const text = day ? `${day} de ${month}${explicitYear ? ` de ${explicitYear}` : ''}` : month;
  if (!day) return { date: null, text };
  const year = explicitYear || String(fallbackYear);
  return {
    date: `${year}-${String(MONTHS[month]).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    text,
    separated: !directDate,
  };
}

export function academicPeriodForDate(referenceDate = new Date()) {
  const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  if (Number.isNaN(date.getTime())) throw new Error('La fecha de referencia no es válida.');
  const year = date.getFullYear();
  return date.getMonth() < 6 ? `${year}-II` : `${year + 1}-I`;
}

export function parseBrochureContent(pages, links = [], options = {}) {
  pages = cleanBrochurePages(pages);
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
      if (/^requisitos?\b/i.test(line) || DOCUMENT_HEADING.test(normalizeForMatch(line)))
        reachedDetailSection = true;
      if (!reachedDetailSection) headingLines.push(line);
    }),
  );
  const periodMatch = headingLines.join('\n').match(/\b(20\d{2})\s*[-–]\s*(I{1,2})\b/i);
  const period = periodMatch
    ? `${periodMatch[1]}-${periodMatch[2].toUpperCase()}`
    : academicPeriodForDate(referenceDate);
  const fileName = String(options.fileName || '');
  const incoming =
    options.direction === 'ENTRANTE' ||
    (!options.direction && /\bentrante\b/i.test(headingLines.join(' ')));
  const university = incoming
    ? 'Universidad Nacional de San Antonio Abad del Cusco'
    : findUniversity(lines, fileName);
  const country = incoming ? 'Perú' : findCountry(`${fullText}\n${fileName}`);
  const incomingHeading = normalizeForMatch(headingLines.join(' '));
  const mobilityScope = incoming
    ? /\binternacional\b/.test(incomingHeading)
      ? 'INTERNACIONAL'
      : /\bnacional\b/.test(incomingHeading)
        ? 'NACIONAL'
        : 'UNKNOWN'
    : inferMobilityScope(country, university, fileName);
  const deadlinePages = incoming
    ? pages.filter((page) => /(?:hasta|cierre|fecha limite)/i.test(page.lines.join(' ')))
    : pages;
  const deadline = findClosingDate(
    deadlinePages.length ? deadlinePages : pages,
    referenceDate.getFullYear(),
  );

  const requirementLines = labeledSectionLines(
    pages,
    /^requisitos?(?: generales?)?\b\s*:?[\s-]*/i,
    /^(?:modalidades|el estudiante visitante podra|documentos?|documentacion requerida|proceso de postulacion|importante|avisos? importantes?|consideraciones importantes?|ten en cuenta|atencion)\b/i,
  );
  const requirementsPage = pages.find((page) =>
    (page.lines || []).some((line) =>
      /^requisitos?(?: generales?)?\b/i.test(normalizeForMatch(line)),
    ),
  );
  const requirementsIndex = requirementsPage?.lines.findIndex((line) =>
    /^requisitos?(?: generales?)?\b/i.test(normalizeForMatch(line)),
  );
  const precedingLines =
    requirementsIndex > 0
      ? requirementsPage.lines.slice(Math.max(0, requirementsIndex - 4), requirementsIndex)
      : [];
  const precedingRequirementIndex = precedingLines.findIndex((line) =>
    /^(?:el alumno|la alumna|el estudiante|la estudiante|ser|estar)\b/i.test(cleanText(line)),
  );
  const guidelines = groupRequirements([
    ...(precedingRequirementIndex >= 0 ? precedingLines.slice(precedingRequirementIndex) : []),
    ...requirementLines,
  ]);

  const documentEntries = labeledSectionEntries(
    pages,
    DOCUMENT_HEADING,
    /^(?:ojo|importante|avisos? importantes?|consideraciones importantes?|ten en cuenta|atencion|proceso de postulacion|como aplicar|requisitos)\b/i,
  );
  const documentLines = documentEntries.map((entry) => entry.text);
  const numberedDocuments = groupNumberedLines(documentLines);
  const documentGroups =
    numberedDocuments.groups.length >= 2
      ? numberedDocuments.groups
      : groupUnnumberedDocuments(documentLines);
  const linkEntries = links
    .map((link) => (typeof link === 'string' ? { url: link, pageNumber: null } : link))
    .sort((a, b) => (b.rect ? b.rect[2] - b.rect[0] : 0) - (a.rect ? a.rect[2] - a.rect[0] : 0));
  const { documents: linkedDocuments, assigned: assignedDocumentLinks } = attachDocumentLinks(
    documentGroups.map(parseDocument).filter((item) => item.title),
    documentEntries,
    numberedDocuments.groups.length >= 2,
    linkEntries,
  );
  const documents = linkedDocuments.map((document) =>
    incoming && mobilityScope === 'NACIONAL' && /si es internacional/i.test(document.description)
      ? { ...document, required: false }
      : document,
  );
  const importantPage = pages.find((page) =>
    (page.lines || []).some((line) => IMPORTANT_HEADING.test(normalizeForMatch(line))),
  )?.pageNumber;
  const documentPage = pages.find((page) =>
    (page.lines || []).some((line) => DOCUMENT_HEADING.test(normalizeForMatch(line))),
  )?.pageNumber;
  const documentUrls = linkEntries
    .filter(
      (link, index) =>
        documentPage && link.pageNumber === documentPage && !assignedDocumentLinks.has(index),
    )
    .map((link) => link.url);
  const { notices: extractedImportantNotices, assigned: assignedImportantLinks } = importantNotices(
    pages,
    linkEntries,
  );
  const notices = [
    ...processNotices(pages, linkEntries).map((item) => ({ ...item, kind: 'ADDITIONAL' })),
    ...generalAdditionalNotices(
      pages,
      linkEntries.filter((_, index) => !assignedDocumentLinks.has(index)),
    ).map((item) => ({ ...item, kind: 'ADDITIONAL' })),
    ...extractedImportantNotices.map((item) => ({ ...item, kind: 'IMPORTANT' })),
  ];
  const eyeNotice = pages
    .map((page) => {
      const index = (page.lines || []).findIndex((line) => /^ojo\s*:/i.test(cleanText(line)));
      if (index < 0) return '';
      return cleanText(
        (page.lines || [])
          .slice(index, index + 6)
          .filter(
            (line) =>
              !/^(?:mayor|informaci[oó]n|ocri(?:\s|$)|oficina|y relaciones|internacionales)/i.test(
                cleanText(line),
              ),
          )
          .join(' ')
          .replace(/^ojo\s*:\s*/i, ''),
      );
    })
    .find(Boolean);
  if (eyeNotice && !notices.some((item) => /^ojo\s*:/i.test(item.text)))
    notices.push({ text: sentenceCase(eyeNotice), url: '', kind: 'IMPORTANT' });
  documentUrls.forEach((url, index) => {
    const linkedDocuments = documents.filter((document) =>
      /contrato de estudios|carta de compromiso/i.test(document.title),
    );
    notices.push({
      text: linkedDocuments[index]
        ? `Formato: ${linkedDocuments[index].title.replace(/[.]$/, '')}`
        : `Formato incluido en el brochure ${index + 1}`,
      url,
      kind: 'ADDITIONAL',
    });
  });
  linkEntries
    .filter(
      (link, index) => link.pageNumber === importantPage && !assignedImportantLinks.has(index),
    )
    .forEach((link, index) =>
      notices.push({
        text: `Enlace adicional del brochure ${index + 1}`,
        url: link.url,
        kind: 'IMPORTANT',
      }),
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
  else if (deadline.separated)
    warnings.push(`La fecha de cierre aparece separada en el PDF; confirma ${deadline.text}.`);
  if (!guidelines.length) warnings.push('No se reconocieron requisitos generales.');
  if (!documents.length) warnings.push('No se reconocieron documentos a presentar.');
  if (documents.length > 1 && numberedDocuments.groups.length < 2)
    warnings.push(
      `El PDF no expone la numeración de los documentos como texto; SIGMA agrupó ${documents.length} por su contenido. Confirma que cada documento corresponda a un ítem del brochure.`,
    );
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
      options.direction ||
      (incoming
        ? 'ENTRANTE'
        : /(?:estudiante|alumno).{0,75}\bunsaac\b/.test(normalizedText) ||
            normalizedText.includes('desde la unsaac')
          ? 'SALIENTE'
          : 'UNKNOWN'),
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
