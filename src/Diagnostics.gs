/** Editorhulpen: geen e-mails en geen wijzigingen aan workshop-/importtabbladen. */
function authorizeApp() {
  console.log('[APP_AUTHORIZE_START] Google-autorisatie wordt gecontroleerd.');
  requireAppSetupAdmin_();
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  console.log('[APP_AUTHORIZE_OK] Voer nu checkAppSetup uit; daarna refreshExcelImports.');
}

function requireAppSetupAdmin_() {
  const email = requireAccess_();
  if (!email || email !== effectiveUserEmail_()) {
    throw new Error('Voer deze functie uit in de Apps Script-editor als toegestane Google-beheerder.');
  }
}

/** Eerste editoractie bij installatieproblemen; iedere stap logt vóór de serviceaanroep. */
function checkAppSetup() {
  console.log('[APP_CHECK_START] Diagnose gestart. Ontbreekt deze regel, dan stopt Google vóór de functie.');
  requireAppSetupAdmin_();
  const report = { checkedAt: new Date().toISOString(), checks: [] };
  function step(id, label, callback) {
    console.log('[APP_CHECK] ' + id + ' · starten');
    let result;
    try { result = Object.assign({ status: 'ok', code: 'OK', message: 'Controle geslaagd.', action: '' }, callback() || {}); }
    catch (error) { result = appSetupFailure_(error); }
    const check = Object.assign({ id: id, label: label }, result);
    report.checks.push(check);
    console.log('[' + check.status.toUpperCase() + '] ' + label + ': ' + check.code + ' · ' + check.message +
      (check.action ? ' Actie: ' + check.action : '') + (check.reference ? ' Referentie: ' + check.reference : ''));
    return check;
  }
  const sources = APP_CONFIG.sources || [];
  const imports = sources.filter(function(source) { return source.type === 'excel-import'; });
  report.importSources = imports.length;
  const scopes = [
    ['userinfo.email', true], ['spreadsheets', imports.length > 0],
    ['spreadsheets.readonly', imports.length === 0], ['script.send_mail', !!(APP_CONFIG.emailAccess && APP_CONFIG.emailAccess.enabled)],
    ['script.external_request', imports.some(function(source) { return !source.driveFileId; })],
    ['drive.file', imports.length > 0], ['drive.readonly', imports.length > 0]
  ];
  let granted = null;
  step('authorization', 'Google-autorisatie', function() {
    const info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    granted = info.getAuthorizedScopes();
    if (info.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED) {
      return { status: 'error', code: 'AUTHORIZATION_REQUIRED', message: 'Nog niet alle manifestrechten zijn verleend.',
        action: 'Voer authorizeApp uit, accepteer de Google-rechten en herhaal deze controle.' };
    }
    return { message: 'Google meldt dat de manifestrechten zijn geautoriseerd.' };
  });
  scopes.forEach(function(entry) {
    step('scope_' + entry[0], 'Scope ' + entry[0], function() {
      if (!entry[1]) return { status: 'skipped', code: 'FEATURE_NOT_USED', message: 'Niet nodig voor de ingestelde functies.' };
      if (!Array.isArray(granted)) return { status: 'warning', code: 'SCOPE_LIST_UNAVAILABLE', message: 'Scope-overzicht niet beschikbaar; zie de servicecontroles hieronder.' };
      const present = granted.indexOf('https://www.googleapis.com/auth/' + entry[0]) !== -1 ||
        (entry[0] === 'spreadsheets.readonly' && granted.indexOf('https://www.googleapis.com/auth/spreadsheets') !== -1);
      if (!present) throw appSetupError_('SCOPE_MISSING', 'Voeg ' + entry[0] + ' toe aan oauthScopes in appsscript.json en voer authorizeApp uit.');
    });
  });
  step('properties', 'Script Properties lezen en schrijven', function() {
    const props = PropertiesService.getScriptProperties();
    const key = 'app-check:' + Utilities.getUuid();
    try {
      props.setProperty(key, 'test');
      if (props.getProperty(key) !== 'test') throw appSetupError_('PROPERTIES_CHECK_FAILED', 'Controleer de Script Properties-service.');
    } finally { props.deleteProperty(key); }
  });
  step('cache', 'Dashboardcache', function() {
    const cache = CacheService.getScriptCache();
    const key = 'app-check:' + Utilities.getUuid();
    try {
      cache.put(key, 'test', 60);
      if (cache.get(key) !== 'test') return { status: 'warning', code: 'CACHE_MISS', message: 'De cache bewaart het testitem niet; de app kan terugvallen op brondata.' };
    } finally { cache.remove(key); }
  });
  step('lock', 'Vergrendeling voor imports en snapshots', function() {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(1)) return { status: 'warning', code: 'LOCK_BUSY', message: 'Een andere verversing is bezig.', action: 'Herhaal de controle zodra die uitvoering klaar is.' };
    lock.releaseLock();
  });
  step('mail', 'Mailrecht en resterend quotum', function() {
    if (!(APP_CONFIG.emailAccess && APP_CONFIG.emailAccess.enabled)) return { status: 'skipped', code: 'EMAIL_DISABLED', message: 'Gasttoegang per e-mailcode staat uit.' };
    const remaining = MailApp.getRemainingDailyQuota();
    if (remaining < 1) throw appSetupError_('MAIL_QUOTA_EMPTY', 'Wacht op herstel van het Google-mailquotum.');
    return { message: 'MailApp is bereikbaar; resterend dagquotum: ' + remaining + '. Er is geen mail verstuurd.' };
  });
  step('external', 'Externe HTTP-verzoeken', function() {
    if (!imports.some(function(source) { return !source.driveFileId; })) return { status: 'skipped', code: 'NO_URL_IMPORT', message: 'Geen URL-import ingesteld.' };
    const response = UrlFetchApp.fetch('https://www.google.com/generate_204', { muteHttpExceptions: true, followRedirects: false });
    if (response.getResponseCode() !== 204) return { status: 'warning', code: 'HTTP_PROBE_UNEXPECTED', message: 'De algemene HTTP-test gaf geen verwachte 204. Controleer ook de broncontrole hieronder.' };
  });

  // Een klein synthetisch CSV-bestand controleert Drive-conversie, Sheets-schrijven en verwijderen.
  let testFileId = '';
  if (imports.length) {
    step('drive_create', 'Drive API v3 en tijdelijke conversie', function() {
      if (typeof Drive === 'undefined' || !Drive.Files) throw appSetupError_('DRIVE_SERVICE_MISSING', 'Voeg bij Services Google Drive API v3 toe; neem dependencies uit het manifest over.');
      const blob = Utilities.newBlob('Workshopnaam\nDiagnosetest\n', 'text/csv', 'diagnose.csv');
      const file = Drive.Files.create({ name: 'Workshopkompas tijdelijke rechtentest',
        mimeType: 'application/vnd.google-apps.spreadsheet' }, blob, { fields: 'id' });
      testFileId = file.id;
      if (!testFileId) throw appSetupError_('DRIVE_CREATE_FAILED', 'Controleer Drive API, drive.file en Google-autorisatie.');
      return { message: 'Drive API en conversie werken met een tijdelijk testbestand.' };
    });
    try {
      step('sheet_write', 'Google Sheets lezen en schrijven', function() {
        if (!testFileId) return { status: 'skipped', code: 'DRIVE_TEST_REQUIRED', message: 'Eerst de tijdelijke Drive-conversie herstellen.' };
        const book = SpreadsheetApp.openById(testFileId);
        const range = book.getSheets()[0].getRange(1, 1, 1, 1);
        range.setValues([['Rechtentest']]); SpreadsheetApp.flush();
        if (range.getValues()[0][0] !== 'Rechtentest') throw appSetupError_('SHEETS_WRITE_FAILED', 'Controleer de volledige spreadsheets-scope.');
        return { message: 'Lezen en schrijven werkt op het tijdelijke bestand. Echte importtabbladen zijn niet gewijzigd.' };
      });
    } finally {
      step('drive_cleanup', 'Tijdelijk testbestand opruimen', function() {
        if (!testFileId) return { status: 'skipped', code: 'NO_TEMP_FILE', message: 'Er was geen testbestand aangemaakt.' };
        try { Drive.Files.remove(testFileId); }
        catch (error) {
          const failed = appSetupFailure_(error);
          failed.action += ' Verwijder het bestand Workshopkompas tijdelijke rechtentest zo nodig handmatig uit Drive.';
          return failed;
        }
      });
    }
  }

  sources.forEach(function(source, index) {
    const label = 'Bron ' + (index + 1) + ' (' + (source.name || 'naamloos') + ')';
    step('source_' + (index + 1), label + ' · Google-bestand', function() {
      if (!source.spreadsheetId || !source.sheetName) return { status: 'warning', code: 'SOURCE_NOT_CONFIGURED', message: 'Google-bestand of tabblad ontbreekt in Config.gs.' };
      const book = SpreadsheetApp.openById(source.spreadsheetId);
      if (source.type === 'excel-import') {
        const file = Drive.Files.get(source.spreadsheetId, { fields: 'capabilities(canEdit)', supportsAllDrives: true });
        if (!file.capabilities || file.capabilities.canEdit !== true) throw appSetupError_('TARGET_NOT_WRITABLE', 'Geef dit Google-account bewerkrechten op het doelbestand.');
        const sheet = book.getSheetByName(source.sheetName);
        if (sheet) {
          const state = excelImportState_(source);
          if (!state || state.sheetId !== sheet.getSheetId()) throw appSetupError_('IMPORT_TARGET_EXISTS', 'Kies een nieuwe sheetName: dit bestaande tabblad wordt niet door de importer beheerd.');
        }
        return { message: sheet ? 'Doelbestand is bewerkbaar en het importtabblad wordt herkend.' : 'Doelbestand is bewerkbaar; het importtabblad wordt bij de eerste import aangemaakt.' };
      }
      if (source.type && source.type !== 'google') throw appSetupError_('SOURCE_TYPE_UNKNOWN', 'Gebruik type excel-import of een gewone Google-bron.');
      const sheet = book.getSheetByName(source.sheetName);
      if (!sheet) throw appSetupError_('SOURCE_SHEET_MISSING', 'Controleer sheetName in Config.gs.');
      const width = sheet.getLastColumn();
      if (!width) return { status: 'warning', code: 'SOURCE_EMPTY', message: 'Het Google-tabblad is leeg.' };
      headerMap_(sheet.getRange(Number(source.headerRow) || 1, 1, 1, width).getValues()[0], 'diagnose');
      return { message: 'Google-bron en kolomkoppen zijn leesbaar; er zijn geen workshopregels gelogd.' };
    });
    if (source.type === 'excel-import') {
      step('download_' + (index + 1), label + ' · Excel-bestand', function() {
        if (!excelImportConfigured_(source)) throw appSetupError_('IMPORT_NOT_CONFIGURED', 'Vul url of driveFileId, sourceSheetName, spreadsheetId en sheetName in.');
        const targetCount = sources.filter(function(other) { return other.spreadsheetId === source.spreadsheetId && other.sheetName === source.sheetName; }).length;
        if (targetCount > 1) throw appSetupError_('IMPORT_TARGET_CONFLICT', 'Gebruik één apart doeltabblad per bron.');
        excelImportBlob_(source);
        return { message: source.driveFileId ? 'Drive-export is leesbaar en heeft een XLSX/ZIP-bestandskop.' : 'URL is zonder Microsoft-aanmelding bereikbaar en levert een XLSX/ZIP-bestandskop.',
          action: 'Voer refreshExcelImports uit om het gekozen Excel-tabblad te converteren, controleren en publiceren.' };
      });
    }
  });
  report.ok = !report.checks.some(function(check) { return check.status === 'error'; });
  report.errors = report.checks.filter(function(check) { return check.status === 'error'; }).length;
  report.warnings = report.checks.filter(function(check) { return check.status === 'warning'; }).length;
  console.log('[APP_CHECK_DONE] ' + report.errors + ' fouten, ' + report.warnings + ' waarschuwingen. ' +
    (report.ok ? (imports.length ? 'Start de import via refreshExcelImports.' : 'Geen Excel-importbronnen ingesteld; alleen de Google-basis is gecontroleerd.') : 'Herstel de genoemde onderdelen en herhaal checkAppSetup.'));
  return report;
}

function appSetupError_(code, action) {
  const error = new Error(code);
  error.setupAction = action;
  return error;
}

/** Geen providerbody, bestands-ID, gedeelde URL of accountnaam in diagnose-uitvoer. */
function appSetupFailure_(error) {
  const message = String(error && error.message || '');
  let code = /^(?:IMPORT|SCOPE|TARGET|SOURCE|DRIVE|SHEETS|PROPERTIES|MAIL)_[A-Z_]+$/.test(message) ? message : 'SERVICE_CHECK_FAILED';
  let action = error && error.setupAction || '';
  if (/accessNotConfigured|has not been used|API.*disabled|API.*ingeschakeld/i.test(message)) {
    code = 'DRIVE_API_DISABLED'; action = 'Schakel Drive API v3 in bij Services en zo nodig in het gekoppelde Google Cloud-project.';
  } else if (/permission|not authorized|authorization|autorisatie|toestemming|rechten|scope|access denied/i.test(message) && code === 'SERVICE_CHECK_FAILED') {
    code = 'GOOGLE_PERMISSION_REQUIRED'; action = 'Controleer oauthScopes in appsscript.json, voer authorizeApp uit en accepteer de Google-rechten.';
  } else if (/unknown error|onbekende fout|internal error|interne fout|temporarily unavailable/i.test(message)) {
    code = 'GOOGLE_SERVICE_ERROR'; action = 'Herhaal deze stap later en controleer de Google-uitvoeringsdetails als de fout blijft terugkomen.';
  } else if (/quota|too many|rate limit|limit exceeded/i.test(message) && code === 'SERVICE_CHECK_FAILED') {
    code = 'GOOGLE_LIMIT_REACHED'; action = 'Wacht op herstel van de Google-limiet en probeer daarna opnieuw.';
  }
  if (!action && code.indexOf('IMPORT_') === 0) action = excelImportErrorMessage_(code);
  return { status: 'error', code: code, message: 'Deze controle is niet geslaagd.',
    action: action || 'Controleer de betreffende Google-service, broninstellingen en bestandsrechten. Zie DIAGNOSE.md.',
    reference: errorReference_() };
}
