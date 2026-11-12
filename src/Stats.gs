/**
 * Optionele bezoekstatistieken. Deze data verlaat de server nooit als dashboardpayload.
 * Per Amsterdamse kalenderdag, gebruiker en toegangsmethode één regel.
 * Filterwijzigingen staan los van bezoeken.
 */
const USAGE_STATS_HEADERS_ = Object.freeze([
  'Tijdstip', 'Gebruiker (e-mailadres)', 'Toegang', 'Gebeurtenis',
  'Dag', 'Bezoeken', 'Filterwijzigingen', 'Laatste activiteit'
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

function usageStatsDay_(date) {
  return Utilities.formatDate(date, 'Europe/Amsterdam', 'yyyy-MM-dd');
}

function usageStatsHeadersState_(sheet) {
  if (!sheet || sheet.getLastRow() === 0) return 'empty';
  const row = sheet.getRange(1, 1, 1, USAGE_STATS_HEADERS_.length).getValues()[0];
  if (USAGE_STATS_HEADERS_.every(function(header, i) { return row[i] === header; })) return 'current';
  if (sheet.getLastColumn() === 7 &&
      USAGE_STATS_HEADERS_.slice(0, 7).every(function(header, i) { return row[i] === header; })) return 'daily';
  if (sheet.getLastColumn() === 4 &&
      USAGE_STATS_HEADERS_.slice(0, 4).every(function(header, i) { return row[i] === header; })) return 'legacy';
  return 'invalid';
}

function usageStatsAvailable_() {
  try {
    const settings = usageStatsSettings_();
    return settings.enabled && Boolean(settings.spreadsheetId);
  } catch (error) {
    return false;
  }
}

function recordDashboardVisit_(email, isEmailCode, visitId) {
  if (typeof visitId !== 'string' || !/^[a-f0-9-]{36,64}$/i.test(visitId)) return false;
  return recordUsageStats_(email, isEmailCode, visitId);
}

function recordFilterChange_(email, isEmailCode) {
  return recordUsageStats_(email, isEmailCode, '');
}

/** Bij storing blijven de normale dashboard- en toegangsfuncties beschikbaar. */
function recordUsageStats_(email, isEmailCode, visitId) {
  try {
    const settings = usageStatsSettings_();
    if (!settings.enabled || !settings.spreadsheetId || !email || !settings.properties) return false;
    const user = usageStatsSafeText_(email);
    const method = isEmailCode ? 'E-mailcode' : 'Google-account';
    const visitKey = visitId ? USAGE_STATS_VISIT_PREFIX_ +
      authHash_(method + ':' + String(email).trim().toLowerCase() + ':' + visitId) : '';
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(3000)) return false;
    try {
      const now = new Date();
      const day = usageStatsDay_(now);
      const seen = visitKey && settings.properties.getProperty(visitKey);
      const legacySeen = visitKey && !seen && settings.properties.getProperty(USAGE_STATS_VISIT_PREFIX_ +
        authHash_(String(email).trim().toLowerCase() + ':' + visitId));
      const lastVisit = Number(seen || legacySeen);
      if (lastVisit > 0 && usageStatsDay_(new Date(lastVisit)) === day) return false;
      const book = SpreadsheetApp.openById(settings.spreadsheetId);
      let sheet = book.getSheetByName(settings.sheetName);
      if (!sheet) sheet = book.insertSheet(settings.sheetName);
      const headers = usageStatsHeadersState_(sheet);
      if (headers === 'invalid') return false;
      if (headers === 'empty') sheet.appendRow(USAGE_STATS_HEADERS_.slice());
      if (headers === 'legacy') sheet.getRange(1, 5, 1, 4).setValues([USAGE_STATS_HEADERS_.slice(4)]);
      if (headers === 'daily') sheet.getRange(1, 8, 1, 1).setValues([[USAGE_STATS_HEADERS_[7]]]);

      const count = sheet.getLastRow() - 1;
      const rows = count > 0 ? sheet.getRange(2, 1, count, 7).getValues() : [];
      let index = rows.length - 1;
      while (index >= 0) {
        const row = rows[index];
        if (row[1] === user && row[2] === method && row[3] === 'Dagtotalen' && row[4] === day) break;
        index--;
      }
      const visits = visitId ? 1 : 0;
      const filters = visitId ? 0 : 1;
      if (index >= 0) {
        const row = rows[index];
        sheet.getRange(index + 2, 8).setNumberFormat('dd-mm-yyyy hh:mm:ss');
        sheet.getRange(index + 2, 6, 1, 3).setValues([[
          (Number(row[5]) || 0) + visits, (Number(row[6]) || 0) + filters, now
        ]]);
      } else {
        const row = sheet.getLastRow() + 1;
        // Bewaar de datum als ISO-tekst, ongeacht de spreadsheetlocale.
        sheet.getRange(row, 5).setNumberFormat('@');
        sheet.getRange(row, 1, 1, 8).setValues([[now, user, method, 'Dagtotalen', day, visits, filters, now]]);
        sheet.getRange(row, 8).setNumberFormat('dd-mm-yyyy hh:mm:ss');
        sheet.getRange(row, 1).setNumberFormat('dd-mm-yyyy hh:mm:ss');
      }
      // Commit de spreadsheetwijziging vóór een volgende uitvoering de lock krijgt.
      SpreadsheetApp.flush();
      if (visitKey) settings.properties.setProperty(visitKey, String(now.getTime()));
      pruneUsageStats_(sheet, settings);
      if (!sheet.isSheetHidden() && book.getSheets().some(function(other) {
        return other.getSheetId() !== sheet.getSheetId() && !other.isSheetHidden();
      })) sheet.hideSheet();
      return true;
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    try { console.warn('Gebruiksstatistiek kon niet worden opgeslagen.'); } catch (ignored) {}
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
        if (usageStatsHeadersState_(sheet) === 'invalid') {
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
          result.action = 'Open het dashboard via deze deployment, wijzig een filter en controleer de dagtotalen in __stats.';
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
