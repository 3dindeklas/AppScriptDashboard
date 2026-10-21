/** Excel wordt alleen bij een bewuste import opgehaald; dashboardopeningen lezen Google. */
const EXCEL_IMPORT_FIELDS_ = Object.freeze([
  ['Aanvraag ID', 'requestId'], ['Datum aanvraag', 'requestedDate'], ['Schoolnaam', 'school'],
  ['Gemeente / Regio', 'region'], ['Workshopnaam', 'workshop'], ['Aanbieder', 'provider'],
  ['Lesmomenten', 'sessions'], ['Aantal leerlingen', 'students'], ['Groep / leerjaar', 'gradeLabel'],
  ['PO / VO', 'sector'], ['Definitieve datum', 'scheduledDates'], ['Type', 'type'],
  ['Totale kosten aanbieder', 'providerTotalCosts'], ['Te factureren i_lab', 'invoiceAmount'], ['Status', 'status']
]);
const EXCEL_IMPORT_MAX_BYTES_ = 5 * 1024 * 1024;

/** Editorknop: alleen een toegestane Google-beheerder, geen gastendpoint. */
function refreshExcelImports() {
  console.log('[IMPORT_START] Excel-import gestart. Gebruik checkAppSetup voor een volledige rechtencontrole.');
  const email = requireAccess_();
  if (email !== effectiveUserEmail_()) throw new Error('Importeer vanuit de Apps Script-editor als beheerder.');
  try {
    const results = refreshExcelImports_();
    console.log('[IMPORT_DONE] ' + results.filter(function(result) { return result.status !== 'error'; }).length +
      ' van ' + results.length + ' importbronnen verwerkt.');
    return results;
  } catch (error) {
    const reference = logServerError_('refreshExcelImports', new Error('IMPORT_RUN_FAILED'));
    throw new Error('Excel-import kon niet starten. Voer checkAppSetup uit. Foutcode: IMPORT_RUN_FAILED. Referentie: ' + reference);
  }
}

/** Ook geschikt als tijdtrigger. Privé, dus niet bereikbaar via google.script.run. */
function refreshExcelImports_() {
  const email = effectiveUserEmail_();
  if (!email || (APP_CONFIG.allowedEmails || []).map(normalizeEmail_).indexOf(email) === -1) {
    throw new Error('Geen toegang.');
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Er is al een gegevensverversing bezig.');
  try {
    const sources = (APP_CONFIG.sources || []).filter(function(source) { return source.type === 'excel-import'; });
    if (!sources.length) console.log('[IMPORT_NO_SOURCES] Voeg een bron met type excel-import toe aan APP_CONFIG.sources.');
    // Publiceren mag nooit een tabblad overschrijven dat door een andere bron wordt gebruikt.
    const targets = (APP_CONFIG.sources || []).map(function(source) {
      return String(source.spreadsheetId || '') + ':' + String(source.sheetName || '');
    });
    const results = sources.map(function(source) {
      const target = String(source.spreadsheetId || '') + ':' + String(source.sheetName || '');
      return importExcelSource_(source, targets.filter(function(value) { return value === target; }).length > 1);
    });
    if (sources.length) {
      const cache = scriptCache_();
      if (cache) cache.remove(SNAPSHOT_CACHE_MANIFEST_KEY_);
    }
    console.log(JSON.stringify(results));
    return results;
  } finally { lock.releaseLock(); }
}

function excelImportHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}

function excelImportStateKey_(source) {
  return 'excel-import:' + excelImportHash_(JSON.stringify([source.spreadsheetId, source.sheetName]));
}

function excelImportSignature_(source) {
  return excelImportHash_(JSON.stringify([source.url || '', source.driveFileId || '',
    source.sourceSheetName, source.headerRow || 1, sourceRowLimit_()]));
}

function excelImportState_(source) {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty(excelImportStateKey_(source)) || 'null');
  } catch (ignored) { return null; }
}

function excelImportConfigured_(source) {
  return !!(source.spreadsheetId && source.sheetName && source.sourceSheetName && (source.url || source.driveFileId));
}

function importExcelSource_(source, conflictingTarget) {
  let temporaryFileId = '';
  let previous = excelImportState_(source);
  let props;
  let phase = 'setup';
  try {
    props = PropertiesService.getScriptProperties();
    if (!excelImportConfigured_(source)) throw new Error('IMPORT_NOT_CONFIGURED');
    if (conflictingTarget) throw new Error('IMPORT_TARGET_CONFLICT');
    if (typeof Drive === 'undefined' || !Drive.Files) throw new Error('IMPORT_DRIVE_SERVICE_REQUIRED');
    phase = 'download';
    console.log('[IMPORT_PHASE] ' + source.name + ' · ' + phase);
    const blob = excelImportBlob_(source);
    phase = 'conversion';
    console.log('[IMPORT_PHASE] ' + source.name + ' · ' + phase);
    const temporary = Drive.Files.create({ name: 'Workshopkompas tijdelijke Excel-import',
      mimeType: 'application/vnd.google-apps.spreadsheet' }, blob, { fields: 'id' });
    temporaryFileId = temporary.id;
    if (!temporaryFileId) throw new Error('IMPORT_CONVERSION_FAILED');
    phase = 'source-sheet';
    console.log('[IMPORT_PHASE] ' + source.name + ' · ' + phase);
    if (!SpreadsheetApp.openById(temporaryFileId).getSheetByName(source.sourceSheetName)) {
      throw new Error('IMPORT_SOURCE_SHEET_NOT_FOUND');
    }
    const result = readGoogleSheet_({ spreadsheetId: temporaryFileId,
      sheetName: source.sourceSheetName, headerRow: source.headerRow || 1, name: source.name });
    // Een onverwacht leeg/verkeerd tabblad mag de laatste geslaagde import niet wissen.
    if (!result.records.length) throw new Error('IMPORT_EMPTY_DATA');
    const rows = [EXCEL_IMPORT_FIELDS_.map(function(field) { return field[0]; })].concat(
      result.records.map(function(record) {
        return EXCEL_IMPORT_FIELDS_.map(function(field) {
          let value = record[field[1]];
          if (Array.isArray(value)) value = value.join('\n');
          if (value === null || value === undefined) return '';
          // setValues behandelt een beginnende = als formule; schrijf broninhoud als tekst.
          return typeof value === 'string' && value.charAt(0) === '=' ? "'" + value : value;
        });
      })
    );
    phase = 'publish';
    console.log('[IMPORT_PHASE] ' + source.name + ' · ' + phase);
    const book = SpreadsheetApp.openById(source.spreadsheetId);
    const state = { signature: excelImportSignature_(source), lastSuccessfulAt: new Date().toISOString(),
      warnings: result.warnings, errorCode: '', errorReference: '' };
    publishExcelImport_(book, source, rows, state, props);
    return { name: source.name, status: warningCount_(result.warnings) ? 'warning' : 'ok', recordCount: result.records.length, updatedAt: state.lastSuccessfulAt };
  } catch (error) {
    const rawCode = error && error.message;
    const code = /^IMPORT_[A-Z_]+$/.test(rawCode || '') ? rawCode :
      /permission|not authorized|authorization|autorisatie|toestemming|rechten|scope/i.test(rawCode || '') ? 'IMPORT_GOOGLE_PERMISSION_REQUIRED' : 'IMPORT_FAILED';
    // Alleen vaste codes loggen: providerfouten kunnen URL's/bestands- of accountgegevens bevatten.
    const reference = logServerError_('excelImport phase=' + phase, new Error(code));
    previous = previous || {};
    previous.errorCode = code;
    previous.errorPhase = phase;
    previous.errorReference = reference;
    previous.lastAttemptAt = new Date().toISOString();
    try { props.setProperty(excelImportStateKey_(source), JSON.stringify(previous)); } catch (ignored) {}
    return { name: source.name, status: 'error', phase: phase, errorCode: code, errorReference: reference, message: excelImportErrorMessage_(code) };
  } finally {
    if (temporaryFileId) {
      try { Drive.Files.remove(temporaryFileId); }
      catch (ignored) { console.error('IMPORT_TEMP_CLEANUP_FAILED: controleer tijdelijke importbestanden in Drive.'); }
    }
  }
}

/** Staging vóór publiceren; bestaand tabblad blijft behouden bij schrijf-/publicatiefouten. */
function publishExcelImport_(book, source, rows, state, props) {
  const existing = book.getSheetByName(source.sheetName);
  const previousState = excelImportState_(source);
  // Alleen een door deze importer beheerd tabblad mag worden vervangen.
  if (existing && (!previousState || previousState.sheetId !== existing.getSheetId())) {
    throw new Error('IMPORT_TARGET_EXISTS');
  }
  const suffix = Utilities.getUuid().slice(0, 8);
  const stage = book.insertSheet('_import_' + suffix);
  let oldRenamed = false;
  let committed = false;
  try {
    if (stage.getMaxRows() < rows.length) stage.insertRowsAfter(stage.getMaxRows(), rows.length - stage.getMaxRows());
    stage.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    stage.setFrozenRows(1);
    SpreadsheetApp.flush();
    if (existing) { existing.setName('_import_backup_' + suffix); oldRenamed = true; }
    stage.setName(source.sheetName);
    state.sheetId = stage.getSheetId();
    props.setProperty(excelImportStateKey_(source), JSON.stringify(state));
    committed = true;
  } finally {
    if (!committed) {
      // Maak eerst de vaste doelnaam vrij, herstel dan de vorige naam.
      try { book.deleteSheet(stage); } finally { if (oldRenamed) existing.setName(source.sheetName); }
    }
  }
  if (existing) {
    try { book.deleteSheet(existing); }
    catch (ignored) { console.error('IMPORT_BACKUP_CLEANUP_FAILED: verwijder het oude _import_backup_-tabblad handmatig.'); }
  }
}

function readExcelImport_(source) {
  const state = excelImportState_(source);
  if (!state || !state.lastSuccessfulAt || state.signature !== excelImportSignature_(source)) {
    return sourceResult_(source.name, 'error', [], emptyWarnings_(),
      state && state.errorCode ? excelImportErrorMessage_(state.errorCode) : 'Nog geen geldige import. Voer refreshExcelImports uit in Apps Script.',
      state && state.errorCode || 'IMPORT_REQUIRED', state && state.errorReference || '');
  }
  const book = SpreadsheetApp.openById(source.spreadsheetId);
  const sheet = book.getSheetByName(source.sheetName);
  if (!sheet || sheet.getSheetId() !== state.sheetId) throw new Error('IMPORT_TARGET_CHANGED');
  const data = readGoogleSheet_({ spreadsheetId: source.spreadsheetId, sheetName: source.sheetName, headerRow: 1, name: source.name });
  const warnings = state.warnings || data.warnings;
  const message = 'Laatste geslaagde import: ' + Utilities.formatDate(new Date(state.lastSuccessfulAt),
    Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm') + '.';
  const result = sourceResult_(source.name, state.errorCode || warningCount_(warnings) ? 'warning' : 'ok',
    data.records, warnings, message + (state.errorCode ? ' ' + excelImportErrorMessage_(state.errorCode) + ' Vorige gegevens blijven zichtbaar.' : ''),
    state.errorCode || '', state.errorReference || '');
  result.fresh = !state.errorCode;
  return result;
}

function excelImportErrorMessage_(code) {
  const messages = {
    IMPORT_GOOGLE_PERMISSION_REQUIRED: 'Google-rechten ontbreken. Voer authorizeApp en daarna checkAppSetup uit in de Apps Script-editor.',
    IMPORT_LOGIN_REQUIRED: 'De bron vereist Microsoft-aanmelding. Gebruik een downloadbare link of een Excel-export in Google Drive.',
    IMPORT_VIEWER_LINK: 'Dit is een weergavelink. Gebruik een downloadbare bestandslink of een Excel-export in Google Drive.',
    IMPORT_NOT_EXCEL: 'De bron leverde geen .xlsx-bestand op.',
    IMPORT_SOURCE_SHEET_NOT_FOUND: 'Het opgegeven Excel-tabblad bestaat niet. Controleer sourceSheetName.',
    IMPORT_EMPTY_DATA: 'Geen workshopregels gevonden; de import is niet vervangen.',
    IMPORT_TARGET_EXISTS: 'Het doeltabblad bestaat al en wordt niet door de importer beheerd. Kies een nieuwe tabbladnaam.',
    IMPORT_TARGET_CONFLICT: 'Meerdere bronnen gebruiken hetzelfde doeltabblad. Kies aparte tabbladnamen.',
    IMPORT_DRIVE_SERVICE_REQUIRED: 'Schakel Google Drive API v3 in bij Services in Apps Script.',
    IMPORT_NOT_CONFIGURED: 'Vul bron, Excel-tabblad en Google-doeltabblad in Config.gs in.'
  };
  return messages[code] || 'De Excel-import is mislukt. Controleer de configuratie en Google-rechten; zie de importhandleiding.';
}

function excelImportBlob_(source) {
  let blob;
  if (source.driveFileId) {
    try {
      const file = DriveApp.getFileById(source.driveFileId);
      if (file.getSize() > EXCEL_IMPORT_MAX_BYTES_) throw new Error('IMPORT_TOO_LARGE');
      blob = file.getBlob();
    } catch (error) {
      if (error && error.message === 'IMPORT_TOO_LARGE') throw error;
      throw new Error('IMPORT_DRIVE_READ_FAILED');
    }
  } else {
    blob = downloadExcelImport_(source.url);
  }
  const bytes = blob.getBytes();
  if (bytes.length > EXCEL_IMPORT_MAX_BYTES_) throw new Error('IMPORT_TOO_LARGE');
  if (bytes.length < 4 || bytes[0] !== 80 || bytes[1] !== 75 || bytes[2] !== 3 || bytes[3] !== 4) {
    throw new Error('IMPORT_NOT_EXCEL');
  }
  return blob.setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').setName('import.xlsx');
}

function excelImportUrl_(url) {
  const match = String(url || '').match(/^https:\/\/([a-z0-9.-]+)(?::443)?(\/[^#]*)?(?:#.*)?$/i);
  if (!match || !(/(?:^|\.)sharepoint\.com$|(?:^|\.)1drv\.com$|^1drv\.ms$|^onedrive\.live\.com$|^api\.onedrive\.com$|^excel\.cloud\.microsoft$|^my\.microsoftpersonalcontent\.com$/i.test(match[1]))) {
    throw new Error('IMPORT_URL_NOT_ALLOWED');
  }
  if (match[1].toLowerCase() === 'excel.cloud.microsoft') throw new Error('IMPORT_VIEWER_LINK');
  return { url: match[0].split('#')[0], origin: 'https://' + match[1] };
}

function downloadExcelImport_(configuredUrl) {
  let current = excelImportUrl_(configuredUrl);
  // SharePoint kan een downloadvariant leveren; dit verleent geen extra toegangsrechten.
  if (/(?:\.sharepoint\.com|\/\/1drv\.ms|\/\/onedrive\.live\.com)$/i.test(current.origin) && !/[?&]download=/i.test(current.url)) {
    current.url += (current.url.indexOf('?') === -1 ? '?' : '&') + 'download=1';
  }
  for (let redirects = 0; redirects < 6; redirects += 1) {
    let response;
    try { response = UrlFetchApp.fetch(current.url, { muteHttpExceptions: true, followRedirects: false }); }
    catch (ignored) { throw new Error('IMPORT_DOWNLOAD_FAILED'); }
    const code = response.getResponseCode();
    if (code === 401 || code === 403) throw new Error('IMPORT_LOGIN_REQUIRED');
    if ([301, 302, 303, 307, 308].indexOf(code) !== -1) {
      const headers = response.getAllHeaders();
      const location = headers.Location || headers.location || '';
      if (/^https:\/\/(?:login\.|login\.microsoftonline\.)/i.test(location)) throw new Error('IMPORT_LOGIN_REQUIRED');
      current = excelImportUrl_(location.charAt(0) === '/' && location.charAt(1) !== '/' ? current.origin + location : location);
      continue;
    }
    if (code !== 200) throw new Error('IMPORT_DOWNLOAD_FAILED');
    const headers = response.getAllHeaders();
    const mime = String(headers['Content-Type'] || headers['content-type'] || '');
    if (/text\/html/i.test(mime)) throw new Error('IMPORT_VIEWER_LINK');
    return response.getBlob();
  }
  throw new Error('IMPORT_TOO_MANY_REDIRECTS');
}
