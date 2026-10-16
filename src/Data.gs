/** Velden die de browser mag ontvangen. Persoonsgegevens staan hier bewust niet tussen. */
function readConfiguredSheets_() {
  const sources = APP_CONFIG.sources.filter(function(source) {
    return source.spreadsheetId && source.sheetName;
  });

  if (!sources.length) {
    throw new Error('Geen Google Sheet geconfigureerd. Zet demoMode op true of vul een spreadsheetId in Config.gs in.');
  }

  return sources.reduce(function(allRows, source) {
    return allRows.concat(readGoogleSheet_(source));
  }, []);
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

  if (lastRow <= headerRow || lastColumn === 0) return [];

  const values = sheet.getRange(
    headerRow,
    1,
    lastRow - headerRow + 1,
    lastColumn
  ).getValues();

  return mapSheetRows_(values, source.name);
}

function mapSheetRows_(values, sourceName) {
  if (!values.length) return [];

  const header = values[0].map(headerKey_);
  if (!header.includes('workshopnaam')) {
    throw new Error('De kolom Workshopnaam ontbreekt in ' + sourceName + '.');
  }
  return values.slice(1).map(function(row) {
    const workshop = textValue_(cell_(row, header, 'workshopnaam'));
    const status = textValue_(cell_(row, header, 'status'));
    const requestedDate = dateValue_(cell_(row, header, 'datum aanvraag'));
    const scheduledDate = dateValue_(cell_(row, header, 'definitieve datum'));

    if (!workshop && !status && !requestedDate && !scheduledDate) return null;

    return {
      source: sourceName,
      date: scheduledDate || requestedDate,
      workshop: workshop || 'Onbekende workshop',
      provider: textValue_(cell_(row, header, 'aanbieder')) || 'Onbekend',
      region: textValue_(cell_(row, header, 'gemeente / regio')) || 'Onbekend',
      sector: sectorValue_(cell_(row, header, 'po / vo')),
      status: status || 'Onbekend',
      sessions: numberValue_(cell_(row, header, 'lesmomenten')),
      students: numberValue_(cell_(row, header, 'aantal leerlingen'))
    };
  }).filter(Boolean);
}

function headerKey_(value) {
  return String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function cell_(row, header, name) {
  const index = header.indexOf(name);
  return index === -1 ? '' : row[index];
}

function textValue_(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function numberValue_(value) {
  if (typeof value === 'number' && isFinite(value)) return value;
  const cleaned = textValue_(value).replace(/[^0-9,.-]/g, '');
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
  const number = Number(normalized);
  return isFinite(number) ? number : 0;
}

function sectorValue_(value) {
  const sector = textValue_(value).toUpperCase();
  return sector === 'PO' || sector === 'VO' ? sector : 'Onbekend';
}

function dateValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  const text = textValue_(value);
  let match = text.match(/^(\d{4})[-\/]([01]?\d)[-\/]([0-3]?\d)$/);
  if (match) return match[1] + '-' + padDate_(match[2]) + '-' + padDate_(match[3]);

  match = text.match(/^([0-3]?\d)[-\/]([01]?\d)[-\/](\d{4})$/);
  if (match) return match[3] + '-' + padDate_(match[2]) + '-' + padDate_(match[1]);

  return '';
}

function padDate_(value) {
  return String(value).padStart(2, '0');
}

/** Fictieve data waarmee de web-app direct na kopiëren werkt. */
function demoRows_() {
  return [
    ['Stichting A', '2026-09-03', '3D-sleutelhanger', '3Dindeklas', 'Vijfheerenlanden', 'PO', 'Uitgevoerd', 2, 24],
    ['Stichting A', '2026-09-10', 'Paper Circuits', '3Dindeklas', 'Molenlanden', 'PO', 'Uitgevoerd', 1, 15],
    ['Stichting A', '2026-09-18', 'Codeer een robot met kleuren', '3Dindeklas', 'Gorinchem', 'PO', 'Ingepland', 2, 28],
    ['Stichting A', '2026-10-02', 'Micro:bit Magic', '3Dindeklas', 'Vijfheerenlanden', 'VO', 'Open', 4, 20],
    ['Stichting A', '2026-10-12', 'Duurzaam huis met licht', 'MakerLab', 'Altena', 'PO', 'Ingepland', 2, 18],
    ['Stichting B', '2026-09-05', 'Bouw een Spin Art-machine', '3Dindeklas', 'Sliedrecht', 'PO', 'Uitgevoerd', 3, 27],
    ['Stichting B', '2026-09-16', 'Programmeer een alarm', '3Dindeklas', 'Molenlanden', 'PO', 'Uitgevoerd', 2, 22],
    ['Stichting B', '2026-09-25', '3D-sleutelhanger', '3Dindeklas', 'Nieuwegein', 'PO', 'Ingepland', 2, 26],
    ['Stichting B', '2026-10-06', 'Parachute-uitdaging', 'Techniekteam', 'IJsselstein', 'VO', 'Open', 2, 30],
    ['Stichting B', '2026-10-15', 'Greenscreen stop-motion', '3Dindeklas', 'Gorinchem', 'PO', 'Ingepland', 2, 24]
  ].map(function(row) {
    return {
      source: row[0], date: row[1], workshop: row[2], provider: row[3],
      region: row[4], sector: row[5], status: row[6], sessions: row[7], students: row[8]
    };
  });
}
