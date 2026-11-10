/**
 * Optionele bezoekstatistieken. Deze data verlaat de server nooit als dashboardpayload.
 * Een bezoek is een geslaagde dashboardopening per toegangssessie. Browser-refresh,
 * bronverversing en filterwijzigingen tellen niet als nieuwe sessie.
 */
const USAGE_STATS_HEADERS_ = Object.freeze([
  'Tijdstip', 'Gebruiker (e-mailadres)', 'Toegang', 'Gebeurtenis'
]);
const USAGE_STATS_ID_PROPERTY_ = 'WORKSHOPKOMPAS_STATS_SPREADSHEET_ID';
const USAGE_STATS_CLEANUP_PROPERTY_ = 'WORKSHOPKOMPAS_STATS_LAST_CLEANUP';
const USAGE_STATS_VISIT_PREFIX_ = 'WORKSHOPKOMPAS_STATS_VISIT:';

function usageStatsSettings_() {
  const config = APP_CONFIG.usageStats || {};
  const properties = typeof PropertiesService === 'undefined' ? null : PropertiesService.getScriptProperties();
  const id = String(config.spreadsheetId ||
    (properties && properties.getProperty(USAGE_STATS_ID_PROPERTY_)) || '').trim();
  const retention = Number(config.retentionDays);
  return {
    enabled: config.enabled === true,
    spreadsheetId: id,
    sheetName: String(config.sheetName || '__stats').trim() || '__stats',
    retentionDays: Number.isFinite(retention) ? Math.max(1, Math.min(3650, Math.floor(retention))) : 180,
    properties: properties
  };
}

/** Mag de toegang tot het dashboard nooit beïnvloeden, ook niet bij ontbrekende rechten. */
function recordDashboardVisit_(email, isEmailCode, visitId) {
  try {
    const settings = usageStatsSettings_();
    if (!settings.enabled || !settings.spreadsheetId || !email) return false;
    // Idempotent over browser-refreshes, ook wanneer Google een gecachete
    // dashboardsnapshot teruggeeft. De sleutel bevat geen onversleuteld token.
    if (typeof visitId !== 'string' || !/^[a-f0-9-]{36,64}$/i.test(visitId)) return false;
    if (!settings.properties) return false;
    const visitKey = USAGE_STATS_VISIT_PREFIX_ +
      authHash_(String(email).trim().toLowerCase() + ':' + visitId);
    if (typeof SpreadsheetApp === 'undefined' || typeof LockService === 'undefined') return false;
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(3000)) return false;

    try {
      if (settings.properties.getProperty(visitKey)) return false;
      const book = SpreadsheetApp.openById(settings.spreadsheetId);
      let sheet = book.getSheetByName(settings.sheetName);
      if (!sheet) sheet = book.insertSheet(settings.sheetName);

      if (sheet.getLastRow() === 0) {
        sheet.appendRow(USAGE_STATS_HEADERS_.slice());
      } else {
        const actual = sheet.getRange(1, 1, 1, USAGE_STATS_HEADERS_.length).getValues()[0];
        if (USAGE_STATS_HEADERS_.some(function(header, index) { return actual[index] !== header; })) {
          // Bestaande gegevens nooit overschrijven als er een tab met deze naam is.
          return false;
        }
      }

      const now = new Date();
      sheet.appendRow([
        now,
        usageStatsSafeText_(email),
        isEmailCode ? 'E-mailcode' : 'Google-account',
        'Dashboard geopend'
      ]);
      settings.properties.setProperty(visitKey, String(now.getTime()));
      sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('dd-mm-yyyy hh:mm:ss');
      pruneUsageStats_(sheet, settings);

      // Een verborgen tabblad is geen beveiligingsmaatregel. Verberg alleen als
      // minstens één ander tabblad zichtbaar blijft.
      if (!sheet.isSheetHidden() && book.getSheets().some(function(other) {
        return other.getSheetId() !== sheet.getSheetId() && !other.isSheetHidden();
      })) sheet.hideSheet();
      return true;
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    // Statistieken zijn optioneel: brongegevens en inloggen blijven beschikbaar.
    try { console.warn('Bezoekregistratie kon niet worden opgeslagen.'); } catch (ignored) {}
    return false;
  }
}

function usageStatsSafeText_(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}

/** Ruimt eenmaal per UTC-dag oude bezoeken aan het begin van de tijdlijn op. */
function pruneUsageStats_(sheet, settings) {
  const properties = settings.properties;
  if (!properties) return;
  const today = new Date().toISOString().slice(0, 10);
  if (properties.getProperty(USAGE_STATS_CLEANUP_PROPERTY_) === today) return;

  const count = sheet.getLastRow() - 1;
  if (count > 0) {
    const times = sheet.getRange(2, 1, count, 1).getValues();
    const cutoff = Date.now() - settings.retentionDays * 86400000;
    let expired = 0;
    while (expired < times.length && times[expired][0] instanceof Date &&
        times[expired][0].getTime() < cutoff) expired += 1;
    if (expired) sheet.deleteRows(2, expired);
  }
  // Ook tijdelijke sessiemarkeringen moeten na de bewaartermijn verdwijnen.
  const oldSessionCutoff = Date.now() - settings.retentionDays * 86400000;
  Object.entries(properties.getProperties()).forEach(function(entry) {
    if (entry[0].indexOf(USAGE_STATS_VISIT_PREFIX_) !== 0) return;
    const time = Number(entry[1]);
    if (!Number.isFinite(time) || time < oldSessionCutoff) {
      properties.deleteProperty(entry[0]);
    }
  });
  properties.setProperty(USAGE_STATS_CLEANUP_PROPERTY_, today);
}

/**
 * Uitvoeren vanuit de Apps Script-editor van de deployment die de gast gebruikt.
 * Toont uitsluitend veilige controlecodes, geen spreadsheet-ID's of gebruikersdata.
 * Schrijft of wijzigt geen statistieken.
 */
function checkUsageStatsSetup() {
  const caller = activeUserEmail_();
  const administrators = (APP_CONFIG.allowedEmails || []).map(normalizeEmail_);
  if (!caller || caller !== effectiveUserEmail_() || administrators.indexOf(caller) === -1) {
    throw new Error('Voer checkUsageStatsSetup uit als toegestane beheerder in de Apps Script-editor.');
  }

  const settings = usageStatsSettings_();
  const result = { ok: false, code: '', action: '', sheetFound: false };
  if (!settings.enabled) {
    result.code = 'STATS_DISABLED';
    result.action = 'Zet usageStats.enabled op true in de Config.gs van deze deployment.';
  } else if (!settings.spreadsheetId) {
    result.code = 'STATS_SPREADSHEET_NOT_CONFIGURED';
    result.action = 'Zet WORKSHOPKOMPAS_STATS_SPREADSHEET_ID in de Script Properties van DIT Apps Script-project.';
  } else {
    try {
      const book = SpreadsheetApp.openById(settings.spreadsheetId);
      const sheet = book.getSheetByName(settings.sheetName);
      result.sheetFound = Boolean(sheet);
      if (sheet && sheet.getLastRow() > 0) {
        const actual = sheet.getRange(1, 1, 1, USAGE_STATS_HEADERS_.length).getValues()[0];
        if (USAGE_STATS_HEADERS_.some(function(header, index) { return actual[index] !== header; })) {
          result.code = 'STATS_HEADERS_MISMATCH';
          result.action = 'Controleer de kopregel van __stats; deze wordt bewust niet overschreven.';
        }
      }
      if (!result.code) {
        // Drive-API v3 kan schrijfrecht controleren zonder het bestand te wijzigen.
        if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.get) {
          const file = Drive.Files.get(settings.spreadsheetId, { fields: 'capabilities(canEdit)' });
          if (file.capabilities && file.capabilities.canEdit === false) {
            result.code = 'STATS_NOT_WRITABLE';
            result.action = 'Geef het uitvoerende account bewerkrechten op het statistiekenspreadsheet.';
          }
        }
        if (!result.code) {
          result.ok = true;
          result.code = 'STATS_CONFIGURED';
          result.action = 'Open een nieuwe e-mailcodesessie via de bijgewerkte gastdeployment en controleer __stats.';
        }
      }
    } catch (error) {
      result.code = 'STATS_SPREADSHEET_UNAVAILABLE';
      result.action = 'Controleer het spreadsheet-ID, de Google-autorisatie en bewerkrechten van de gastdeployment.';
    }
  }
  console.log('[STATS_CHECK] ' + result.code + ' · ' + result.action);
  return result;
}
