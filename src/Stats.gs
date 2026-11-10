/**
 * Optionele bezoekstatistieken. Deze data verlaat de server nooit als dashboardpayload.
 * Een bezoek is een geslaagde, normale eerste dashboard-data-aanvraag. Handmatig
 * vernieuwen van brongegevens en wisselen van filters registreren niets.
 */
const USAGE_STATS_HEADERS_ = Object.freeze([
  'Tijdstip', 'Gebruiker (e-mailadres)', 'Toegang', 'Gebeurtenis'
]);
const USAGE_STATS_ID_PROPERTY_ = 'WORKSHOPKOMPAS_STATS_SPREADSHEET_ID';
const USAGE_STATS_CLEANUP_PROPERTY_ = 'WORKSHOPKOMPAS_STATS_LAST_CLEANUP';

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
function recordDashboardVisit_(email, isEmailCode) {
  try {
    const settings = usageStatsSettings_();
    if (!settings.enabled || !settings.spreadsheetId || !email) return false;
    if (typeof SpreadsheetApp === 'undefined' || typeof LockService === 'undefined') return false;
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(3000)) return false;

    try {
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
  properties.setProperty(USAGE_STATS_CLEANUP_PROPERTY_, today);
}
