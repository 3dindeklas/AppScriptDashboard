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

/** Bedragen die uitsluitend voor accounts op de financiële allowlist beschikbaar zijn. */
const PUBLIC_FINANCIAL_FIELDS_ = Object.freeze([
  'providerTotalCosts',
  'invoiceAmount'
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
  const includedRowOffsets = dataRowOffsets.slice(0, recordsToRead);
  const rowsToRead = includedRowOffsets[includedRowOffsets.length - 1] + 1;
  const dataRange = sheet.getRange(
    headerRow,
    1,
    rowsToRead + 1,
    lastColumn
  );
  const values = dataRange.getValues();

  const result = normalizeSheet_(values, source.name, null, includedRowOffsets);
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

  const columnIndexes = workshopAnchorFields_()
    .filter(function(name) { return Object.prototype.hasOwnProperty.call(header, name); })
    .map(function(name) { return header[name]; })
    .sort(function(a, b) { return a - b; });
  if (!columnIndexes.length) return [];

  const firstColumn = columnIndexes[0];
  const width = columnIndexes[columnIndexes.length - 1] - firstColumn + 1;
  const anchorOffsets = columnIndexes.map(function(columnIndex) {
    return columnIndex - firstColumn;
  });
  const range = sheet.getRange(headerRow + 1, firstColumn + 1, candidateRows, width);
  const values = range.getValues();
  const formulas = range.getFormulas();

  return values.reduce(function(offsets, row, rowIndex) {
    const hasLiteralIdentity = anchorOffsets.some(function(columnOffset) {
      return hasValue_(row[columnOffset]) && !hasFormula_(formulas[rowIndex][columnOffset]);
    });
    if (hasLiteralIdentity) offsets.push(rowIndex);
    return offsets;
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
function normalizeSheet_(values, sourceName, formulas, includedRowOffsets) {
  if (!Array.isArray(values) || !values.length) {
    return { records: [], warnings: emptyWarnings_() };
  }

  const header = headerMap_(values[0], sourceName);
  const warnings = emptyWarnings_();
  const seenRequestIds = new Set();
  const duplicateRequestIds = new Set();
  const records = [];
  const includedRows = Array.isArray(includedRowOffsets) ? new Set(includedRowOffsets) : null;

  values.slice(1).forEach(function(row, rowIndex) {
    if (includedRows && !includedRows.has(rowIndex)) return;
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

/** Expliciete browserprojectie. Alleen de financiële basisvelden voor stap 8 worden toegevoegd. */
function publicRecord_(record, includeFinancials) {
  const providerTotalCosts = publicNumber_(record.providerTotalCosts);
  const invoiceAmount = publicNumber_(record.invoiceAmount);
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
    students: record.students,
    providerTotalCosts: providerTotalCosts,
    invoiceAmount: invoiceAmount
  };

  const fields = includeFinancials === true
    ? PUBLIC_RECORD_FIELDS_.concat(PUBLIC_FINANCIAL_FIELDS_)
    : PUBLIC_RECORD_FIELDS_;

  return fields.reduce(function(publicRecord, field) {
    publicRecord[field] = prepared[field];
    return publicRecord;
  }, {});
}

function publicNumber_(value) {
  return typeof value === 'number' && isFinite(value) ? value : null;
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

function workshopAnchorFields_() {
  return ['aanvraag id', 'datum aanvraag', 'schoolnaam', 'workshopnaam'];
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
