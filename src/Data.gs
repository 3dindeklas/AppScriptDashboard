const STATUS_GROUPS_ = Object.freeze({
  'nieuw': 'Open',
  'contact': 'Open',
  'contact gelegd': 'Open',
  'optie': 'Open',
  'open': 'Open',
  'akkoord': 'Ingepland',
  'bevestiging': 'Ingepland',
  'ingepland': 'Ingepland',
  'uitgevoerd': 'Uitgevoerd',
  'geannuleerd': 'Geannuleerd',
  'afgezegd': 'Geannuleerd',
  'volgend schooljaar': 'Volgend schooljaar'
});

/** Enige centrale allowlist van recordvelden die de browser mag ontvangen. */
const PUBLIC_RECORD_FIELDS_ = Object.freeze([
  'source',
  'requestedDate',
  'scheduledDate',
  'scheduledDates',
  'schoolYear',
  'school',
  'workshop',
  'provider',
  'region',
  'sector',
  'grades',
  'status',
  'statusGroup',
  'type',
  'sessions',
  'students'
]);

/** Vaste datakwaliteitssignalen die als aantallen naar de browser mogen. */
const PUBLIC_WARNING_FIELDS_ = Object.freeze([
  'rowsTruncated',
  'emptyRows',
  'missingRequestIds',
  'duplicateRequestIds',
  'invalidRequestedDates',
  'invalidScheduledDates',
  'invalidStudentCounts',
  'unknownSectors'
]);

/** Leest iedere Google-bron onafhankelijk en combineert wat wel beschikbaar is. */
function readConfiguredSheets_() {
  const sourceResults = (APP_CONFIG.sources || []).map(function(source) {
    return readSource_(source);
  });
  const records = sourceResults.reduce(function(allRecords, result) {
    return allRecords.concat(result.records);
  }, []);

  return {
    records: records,
    sources: sourceResults,
    complete: sourceResults.length > 0 && sourceResults.every(function(result) {
      return result.status === 'ok' || result.status === 'warning';
    })
  };
}

function readSource_(source) {
  const name = textValue_(source && source.name) || 'Naamloze bron';

  if (!source || !source.spreadsheetId || !source.sheetName) {
    return sourceResult_(
      name, 'not-configured', [], emptyWarnings_(),
      'Bron is nog niet geconfigureerd.', 'SOURCE_NOT_CONFIGURED', ''
    );
  }

  try {
    const result = readGoogleSheet_(source);
    const warningCount = warningCount_(result.warnings);
    return sourceResult_(
      name,
      warningCount ? 'warning' : 'ok',
      result.records,
      result.warnings,
      result.records.length ? '' : 'Geen workshopregels gevonden.',
      '',
      ''
    );
  } catch (error) {
    const reference = logServerError_('readSource: ' + name, error);
    return sourceResult_(
      name, 'error', [], emptyWarnings_(),
      'Controleer de tabbladnaam en of dit account toegang heeft.',
      'SOURCE_READ_FAILED',
      reference
    );
  }
}

function sourceResult_(name, status, records, warnings, message, errorCode, errorReference) {
  return {
    name: name,
    status: status,
    recordCount: records.length,
    warningCount: warningCount_(warnings),
    warnings: warnings,
    message: message,
    errorCode: errorCode || '',
    errorReference: errorReference || '',
    records: records
  };
}

function readGoogleSheet_(source) {
  const spreadsheet = SpreadsheetApp.openById(source.spreadsheetId);
  const sheet = spreadsheet.getSheetByName(source.sheetName);

  if (!sheet) {
    throw new Error('Tabblad niet gevonden voor ' + source.name + ': ' + source.sheetName);
  }

  const headerRow = Number(source.headerRow) || 1;
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow <= headerRow || lastColumn === 0) {
    return { records: [], warnings: emptyWarnings_() };
  }

  const headerValues = sheet.getRange(headerRow, 1, 1, lastColumn).getValues()[0];
  const header = headerMap_(headerValues, source.name);
  const dataRowOffsets = dataRowOffsets_(sheet, headerRow, lastRow, header);
  if (!dataRowOffsets.length) {
    return { records: [], warnings: emptyWarnings_() };
  }

  const recordsToRead = Math.min(dataRowOffsets.length, sourceRowLimit_());
  const rowsToRead = dataRowOffsets[recordsToRead - 1] + 1;
  const dataRange = sheet.getRange(
    headerRow,
    1,
    rowsToRead + 1,
    lastColumn
  );
  const values = dataRange.getValues();
  const formulas = dataRange.getFormulas();

  const result = normalizeSheet_(values, source.name, formulas);
  result.warnings.rowsTruncated = dataRowOffsets.length - recordsToRead;
  return result;
}

/**
 * Bepaalt echte workshoprijen via alleen de identificerende kolommen.
 * Formules zonder handmatig brongegeven trekken getLastRow() daardoor niet langer
 * kunstmatig naar beneden en tellen ook niet mee voor de ingestelde rijlimiet.
 */
function dataRowOffsets_(sheet, headerRow, lastRow, header) {
  const candidateRows = lastRow - headerRow;
  if (candidateRows < 1) return [];

  const columnIndexes = workshopIdentityFields_()
    .filter(function(name) { return Object.prototype.hasOwnProperty.call(header, name); })
    .map(function(name) { return header[name]; })
    .sort(function(a, b) { return a - b; });
  const spans = contiguousColumnSpans_(columnIndexes);
  const dataRows = Array(candidateRows).fill(false);

  spans.forEach(function(span) {
    const range = sheet.getRange(headerRow + 1, span.start + 1, candidateRows, span.width);
    const values = range.getValues();
    const formulas = range.getFormulas();

    for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
      const hasLiteralIdentity = values[rowIndex].some(function(value, columnOffset) {
        return hasValue_(value) && !hasFormula_(formulas[rowIndex][columnOffset]);
      });
      if (hasLiteralIdentity) dataRows[rowIndex] = true;
    }
  });

  return dataRows.reduce(function(offsets, isDataRow, rowIndex) {
    if (isDataRow) offsets.push(rowIndex);
    return offsets;
  }, []);
}

function contiguousColumnSpans_(columnIndexes) {
  return columnIndexes.reduce(function(spans, columnIndex) {
    const previous = spans[spans.length - 1];
    if (previous && previous.start + previous.width === columnIndex) {
      previous.width += 1;
    } else {
      spans.push({ start: columnIndex, width: 1 });
    }
    return spans;
  }, []);
}

function sourceRowLimit_() {
  const configured = Math.floor(Number(APP_CONFIG.maxRowsPerSource));
  if (!isFinite(configured) || configured < 1) return 5000;
  return Math.min(configured, 10000);
}

/**
 * Zet een volledige sheetmatrix om naar interne workshoprecords.
 * Kolomvolgorde is niet van belang; lege spacer-kolommen worden genegeerd.
 */
function normalizeSheet_(values, sourceName, formulas) {
  if (!Array.isArray(values) || !values.length) {
    return { records: [], warnings: emptyWarnings_() };
  }

  const header = headerMap_(values[0], sourceName);
  const warnings = emptyWarnings_();
  const seenRequestIds = new Set();
  const duplicateRequestIds = new Set();
  const records = [];

  values.slice(1).forEach(function(row, rowIndex) {
    const formulaRow = Array.isArray(formulas) && Array.isArray(formulas[rowIndex + 1])
      ? formulas[rowIndex + 1]
      : [];
    if (isFormulaOnlyRow_(row, formulaRow)) return;
    if (isEmptyWorkshopRow_(row, header)) {
      warnings.emptyRows += 1;
      return;
    }

    const requestId = textValue_(cell_(row, header, 'aanvraag id'));
    if (!requestId) {
      warnings.missingRequestIds += 1;
    } else if (seenRequestIds.has(requestId)) {
      duplicateRequestIds.add(requestId);
    } else {
      seenRequestIds.add(requestId);
    }

    const requestedRaw = cell_(row, header, 'datum aanvraag');
    const scheduledRaw = cell_(row, header, 'definitieve datum');
    const requestedDate = dateValue_(requestedRaw);
    const scheduledDates = dateValues_(scheduledRaw);
    const scheduledDate = scheduledDates[0] || null;
    const students = countValue_(cell_(row, header, 'aantal leerlingen'));
    const sector = sectorValue_(cell_(row, header, 'po / vo'));

    if (hasValue_(requestedRaw) && !requestedDate) warnings.invalidRequestedDates += 1;
    if (hasInvalidDateValues_(scheduledRaw, scheduledDates)) warnings.invalidScheduledDates += 1;
    if (hasValue_(cell_(row, header, 'aantal leerlingen')) && students === null) warnings.invalidStudentCounts += 1;
    if (hasValue_(cell_(row, header, 'po / vo')) && sector === 'Onbekend') warnings.unknownSectors += 1;

    records.push(normalizeRow_(row, header, sourceName, {
      requestId: requestId,
      requestedDate: requestedDate,
      scheduledDate: scheduledDate,
      scheduledDates: scheduledDates,
      students: students,
      sector: sector
    }));
  });

  warnings.duplicateRequestIds = duplicateRequestIds.size;
  return { records: records, warnings: warnings };
}

function normalizeRow_(row, header, sourceName, parsed) {
  const school = textValue_(cell_(row, header, 'schoolnaam'));
  const region = textValue_(cell_(row, header, 'gemeente / regio'));
  const gradeLabel = textValue_(cell_(row, header, 'groep / leerjaar'));
  const status = textValue_(cell_(row, header, 'status')) || 'Onbekend';
  const providerTotalCosts = numberValue_(cell_(row, header, 'totale kosten aanbieder'));
  const invoiceAmount = numberValue_(cell_(row, header, 'te factureren i_lab'));
  const primaryDate = parsed.scheduledDate || parsed.requestedDate;

  return {
    source: sourceName,
    requestId: parsed.requestId,
    requestedDate: parsed.requestedDate,
    scheduledDate: parsed.scheduledDate,
    scheduledDates: parsed.scheduledDates,
    schoolYear: schoolYear_(primaryDate),
    school: school,
    schoolKey: schoolKey_(school, region),
    region: region || 'Onbekend',
    workshop: textValue_(cell_(row, header, 'workshopnaam')) || 'Onbekende workshop',
    provider: textValue_(cell_(row, header, 'aanbieder')) || 'Onbekend',
    sessions: countValue_(cell_(row, header, 'lesmomenten')),
    students: parsed.students,
    gradeLabel: gradeLabel,
    grades: gradeValues_(gradeLabel, parsed.sector),
    sector: parsed.sector,
    desiredPeriod: textValue_(cell_(row, header, 'gewenste periode')),
    location: textValue_(cell_(row, header, 'locatie')),
    type: textValue_(cell_(row, header, 'type')) || 'Onbekend',
    points: numberValue_(cell_(row, header, 'punten per workshop')),
    providerWorkshopPrice: numberValue_(cell_(row, header, 'prijs per workshop (aanbieder)')),
    travelCosts: numberValue_(cell_(row, header, 'reiskosten aanbieder')),
    extraCosts: numberValue_(cell_(row, header, 'extra kosten')),
    providerTotalCosts: providerTotalCosts,
    invoiceAmount: invoiceAmount,
    marginAmount: numberValue_(cell_(row, header, 'marge (€)')),
    marginPercent: numberValue_(cell_(row, header, 'marge (%)')),
    financialComplete: providerTotalCosts !== null && invoiceAmount !== null,
    status: status,
    statusGroup: statusGroup_(status),
    lastContactDate: dateValue_(cell_(row, header, 'laatste contactdatum')),
    actionRequired: textValue_(cell_(row, header, 'actie nodig'))
  };
}

/** Expliciete browserprojectie. Interne IDs, contactdata, locaties en financiën blijven server-side. */
function publicRecord_(record) {
  const prepared = {
    source: record.source,
    requestedDate: record.requestedDate || '',
    scheduledDate: record.scheduledDate || '',
    scheduledDates: Array.isArray(record.scheduledDates)
      ? record.scheduledDates.slice()
      : record.scheduledDate ? [record.scheduledDate] : [],
    schoolYear: record.schoolYear || 'Onbekend',
    school: record.school || 'Onbekende school',
    workshop: record.workshop,
    provider: record.provider,
    region: record.region,
    sector: record.sector,
    grades: Array.isArray(record.grades) ? record.grades.slice() : [],
    status: record.status,
    statusGroup: record.statusGroup || 'Overig',
    type: record.type || 'Onbekend',
    sessions: record.sessions,
    students: record.students
  };

  return PUBLIC_RECORD_FIELDS_.reduce(function(publicRecord, field) {
    publicRecord[field] = prepared[field];
    return publicRecord;
  }, {});
}

/** Expliciete projectie van bronstatus; technische fouten en IDs ontbreken altijd. */
function publicSourceStatus_(source) {
  return {
    name: source.name,
    status: source.status,
    recordCount: source.recordCount,
    warningCount: source.warningCount,
    warnings: publicWarnings_(source.warnings),
    message: source.message,
    errorCode: source.errorCode,
    errorReference: source.errorReference
  };
}

function publicWarnings_(warnings) {
  return PUBLIC_WARNING_FIELDS_.reduce(function(publicWarnings, field) {
    publicWarnings[field] = Number(warnings && warnings[field]) || 0;
    return publicWarnings;
  }, {});
}

function warningCount_(warnings) {
  return PUBLIC_WARNING_FIELDS_.reduce(function(total, field) {
    return total + (Number(warnings && warnings[field]) || 0);
  }, 0);
}

function headerMap_(headerRow, sourceName) {
  const map = {};

  headerRow.forEach(function(value, index) {
    const key = headerKey_(value);
    if (!key) return;
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      throw new Error('Dubbele kolomkop in ' + sourceName + ': ' + textValue_(value));
    }
    map[key] = index;
  });

  if (!Object.prototype.hasOwnProperty.call(map, 'workshopnaam')) {
    throw new Error('De kolom Workshopnaam ontbreekt in ' + sourceName + '.');
  }

  return map;
}

function headerKey_(value) {
  return textValue_(value).toLowerCase();
}

function cell_(row, header, name) {
  return Object.prototype.hasOwnProperty.call(header, name) ? row[header[name]] : '';
}

function isEmptyWorkshopRow_(row, header) {
  return !workshopIdentityFields_().some(function(name) {
    return hasValue_(cell_(row, header, name));
  });
}

function workshopIdentityFields_() {
  return [
    'aanvraag id', 'datum aanvraag', 'schoolnaam', 'workshopnaam',
    'definitieve datum', 'status'
  ];
}

/** Een rij met uitsluitend formules is geen workshop en ook geen kwaliteitswaarschuwing. */
function isFormulaOnlyRow_(row, formulaRow) {
  if (!formulaRow.some(hasFormula_)) return false;
  return !row.some(function(value, columnIndex) {
    return hasValue_(value) && !hasFormula_(formulaRow[columnIndex]);
  });
}

function hasFormula_(value) {
  return textValue_(value).charAt(0) === '=';
}

function hasValue_(value) {
  return value !== null && value !== undefined && textValue_(value) !== '';
}

function textValue_(value) {
  return String(value == null ? '' : value).replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' ');
}

/** Parseert Nederlandse bedragen/getallen. Leeg of ongeldig blijft null, nooit stilzwijgend nul. */
function numberValue_(value) {
  if (typeof value === 'number') return isFinite(value) ? value : null;

  let text = textValue_(value);
  if (!text) return null;
  text = text.replace(/[€%\s]/g, '');
  if (!/^-?[0-9.,]+$/.test(text)) return null;

  if (text.includes(',')) {
    if (!/^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/.test(text) && !/^-?\d+(?:,\d+)?$/.test(text)) return null;
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, '');
  } else if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
    return null;
  }

  const number = Number(text);
  return isFinite(number) ? number : null;
}

function countValue_(value) {
  if (typeof value === 'string') {
    const match = textValue_(value).match(/^(\d+)\s*x?$/i);
    if (!match) return null;
    value = match[1];
  }
  const number = numberValue_(value);
  return number !== null && number >= 0 && Number.isInteger(number) ? number : null;
}

function sectorValue_(value) {
  const sector = textValue_(value).toUpperCase();
  return sector === 'PO' || sector === 'VO' ? sector : 'Onbekend';
}

function statusGroup_(status) {
  return STATUS_GROUPS_[keyValue_(status)] || 'Overig';
}

function schoolKey_(school, region) {
  if (!school) return '';
  return keyValue_(school) + '|' + keyValue_(region);
}

function keyValue_(value) {
  return textValue_(value).toLowerCase();
}

function dateValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return null;
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  if (typeof value === 'number' && isFinite(value) && value > 0) {
    const excelDate = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return isoDate_(excelDate.getUTCFullYear(), excelDate.getUTCMonth() + 1, excelDate.getUTCDate());
  }

  const text = textValue_(value);
  let match = text.match(/^(\d{4})[-\/]([01]?\d)[-\/]([0-3]?\d)$/);
  if (match) return isoDate_(Number(match[1]), Number(match[2]), Number(match[3]));

  match = text.match(/^([0-3]?\d)[-\/]([01]?\d)[-\/](\d{4})$/);
  if (match) return isoDate_(Number(match[3]), Number(match[2]), Number(match[1]));

  return null;
}

/** Leest één of meer lesdatums uit een cel en geeft unieke datums chronologisch terug. */
function dateValues_(value) {
  const singleDate = dateValue_(value);
  if (singleDate) return [singleDate];

  const tokens = dateTokens_(value);
  const dates = [];
  tokens.forEach(function(token) {
    const date = dateValue_(token);
    if (date && dates.indexOf(date) === -1) dates.push(date);
  });
  return dates.sort();
}

/** Markeert ook een deels ongeldige lijst, zonder geldige lesdatums weg te gooien. */
function hasInvalidDateValues_(value, dates) {
  if (!hasValue_(value)) return false;
  if (Object.prototype.toString.call(value) === '[object Date]' || typeof value === 'number') {
    return !dates.length;
  }
  const tokens = dateTokens_(value);
  return !tokens.length || tokens.some(function(token) { return !dateValue_(token); });
}

function dateTokens_(value) {
  return textValue_(value).match(/\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/g) || [];
}

function isoDate_(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return year + '-' + padDate_(month) + '-' + padDate_(day);
}

function padDate_(value) {
  return String(value).padStart(2, '0');
}

function schoolYear_(isoDate) {
  if (!isoDate) return null;
  const match = isoDate.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = month >= 8 ? year : year - 1;
  return start + '–' + (start + 1);
}

function gradeValues_(value, sector) {
  const maximum = sector === 'PO' ? 8 : sector === 'VO' ? 6 : 0;
  if (!maximum) return [];

  let text = keyValue_(value);
  if (!text) return [];
  text = text
    .replace(/\b(groep|leerjaar|klas|jaar)\b/g, ' ')
    .replace(/\btot en met\b|\bt\/m\b/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  const values = new Set();
  const range = text.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (start < 1 || end > maximum || start > end) return [];
    for (let grade = start; grade <= end; grade += 1) values.add(grade);
    return Array.from(values);
  }

  if (!/^\d+(?:\s*[/,+&]\s*\d+)*$/.test(text)) return [];
  const grades = text.match(/\d+/g).map(Number);
  if (grades.some(function(grade) { return grade < 1 || grade > maximum; })) return [];
  grades.forEach(function(grade) {
    values.add(grade);
  });
  return Array.from(values).sort(function(a, b) { return a - b; });
}

function emptyWarnings_() {
  return {
    rowsTruncated: 0,
    emptyRows: 0,
    missingRequestIds: 0,
    duplicateRequestIds: 0,
    invalidRequestedDates: 0,
    invalidScheduledDates: 0,
    invalidStudentCounts: 0,
    unknownSectors: 0
  };
}

/** Bronoverzicht voor de lokale en gepubliceerde demomodus. */
function demoDashboardData_() {
  const records = demoRecords_();
  const names = records.reduce(function(sourceNames, record) {
    if (sourceNames.indexOf(record.source) === -1) sourceNames.push(record.source);
    return sourceNames;
  }, []);

  return {
    complete: true,
    records: records,
    sources: names.map(function(name) {
      const sourceRecords = records.filter(function(record) { return record.source === name; });
      return sourceResult_(
        name, 'demo', sourceRecords, emptyWarnings_(),
        'Fictieve gegevens voor veilig testen.', '', ''
      );
    })
  };
}

/** Fictieve interne records waarmee de web-app direct blijft werken. */
function demoRecords_() {
  return [
    ['demo-a-1', 'Stichting A', '2026-09-03', 'Voorbeeldschool De Horizon', '3D-sleutelhanger', '3Dindeklas', 'Vijfheerenlanden', 'PO', 'groep 7/8', 'Uitgevoerd', 2, 24],
    ['demo-a-2', 'Stichting A', '2026-09-10', 'Voorbeeldschool Het Kompas', 'Paper Circuits', '3Dindeklas', 'Molenlanden', 'PO', 'groep 5/6', 'Uitgevoerd', 1, 15],
    ['demo-a-3', 'Stichting A', '2026-09-18', 'Voorbeeldschool De Brug', 'Codeer een robot met kleuren', '3Dindeklas', 'Gorinchem', 'PO', 'groep 3/4', 'Bevestiging', 2, 28],
    ['demo-a-4', 'Stichting A', '2026-10-02', 'Voorbeeldcollege Noord', 'Micro:bit Magic', '3Dindeklas', 'Vijfheerenlanden', 'VO', 'leerjaar 1', 'Open', 4, 20],
    ['demo-a-5', 'Stichting A', '2026-10-12', 'Voorbeeldschool De Regenboog', 'Duurzaam huis met licht', 'MakerLab', 'Altena', 'PO', 'groep 6', 'Akkoord', 2, 18],
    ['demo-b-1', 'Stichting B', '2026-09-05', 'Voorbeeldschool De Uitvinder', 'Bouw een Spin Art-machine', '3Dindeklas', 'Sliedrecht', 'PO', 'groep 5/6', 'Uitgevoerd', 3, 27],
    ['demo-b-2', 'Stichting B', '2026-09-16', 'Voorbeeldschool De Pionier', 'Programmeer een alarm', '3Dindeklas', 'Molenlanden', 'PO', 'groep 7/8', 'Uitgevoerd', 2, 22],
    ['demo-b-3', 'Stichting B', '2026-09-25', 'Voorbeeldschool De Ruimte', '3D-sleutelhanger', '3Dindeklas', 'Nieuwegein', 'PO', 'groep 6', 'Ingepland', 2, 26],
    ['demo-b-4', 'Stichting B', '2026-10-06', 'Voorbeeldcollege Zuid', 'Parachute-uitdaging', 'Techniekteam', 'IJsselstein', 'VO', 'leerjaar 2', 'Optie', 2, 30],
    ['demo-b-5', 'Stichting B', '2026-10-15', 'Voorbeeldschool Het Atelier', 'Greenscreen stop-motion', '3Dindeklas', 'Gorinchem', 'PO', 'groep 6/7', 'Bevestiging', 2, 24]
  ].map(function(row) {
    const scheduledDates = row[0] === 'demo-a-4'
      ? []
      : row[0] === 'demo-a-3' ? [row[2], '2026-10-02'] : [row[2]];
    const scheduledDate = scheduledDates[0] || null;
    const students = row[0] === 'demo-b-4' ? null : row[11];
    return {
      requestId: row[0], source: row[1], requestedDate: row[2],
      scheduledDate: scheduledDate, scheduledDates: scheduledDates,
      schoolYear: schoolYear_(row[2]), school: row[3], schoolKey: schoolKey_(row[3], row[6]),
      workshop: row[4], provider: row[5], region: row[6], sector: row[7],
      gradeLabel: row[8], grades: gradeValues_(row[8], row[7]), status: row[9],
      statusGroup: statusGroup_(row[9]), sessions: row[10], students: students,
      desiredPeriod: '', location: '', type: 'Workshop', points: null,
      providerWorkshopPrice: null, travelCosts: null, extraCosts: null,
      providerTotalCosts: null, invoiceAmount: null, marginAmount: null,
      marginPercent: null, financialComplete: false, lastContactDate: null, actionRequired: ''
    };
  });
}
