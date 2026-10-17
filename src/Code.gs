/**
 * Web-app entry point.
 *
 * Dit volgt het standaardpatroon uit de officiële Apps Script-documentatie:
 * maak een template van Index, evalueer de template en retourneer HtmlOutput.
 */
function doGet() {
  try {
    requireAccess_();
  } catch (error) {
    return messagePage_(
      'Geen toegang',
      'Open dit dashboard met een Google-account dat in Config.gs is toegestaan.'
    );
  }

  try {
    return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle(APP_CONFIG.title)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (error) {
    return messagePage_(
      'Dashboard tijdelijk niet beschikbaar',
      'De pagina kon niet worden opgebouwd. Controleer de opgeslagen Apps Script-bestanden.'
    );
  }
}

/**
 * Voegt een HTML-partial toe aan Index.html.
 * Styles.html bevat zelf <style> en Client.html bevat zelf <script>.
 */
function include(filename) {
  requireAccess_();
  if (['Styles', 'Client'].indexOf(filename) === -1) {
    throw new Error('Bestand niet beschikbaar.');
  }
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (error) {
    throw new Error('Bestand niet beschikbaar.');
  }
}

/**
 * Enige functie die vanuit de browser wordt aangeroepen.
 * Contactgegevens, notities, technische ID's en financiële detailvelden worden niet teruggestuurd.
 */
function getDashboardData() {
  requireAccess_();

  try {
    const result = APP_CONFIG.demoMode ? demoDashboardData_() : readConfiguredSheets_();
    assertDashboardResult_(result);

    return {
      mode: APP_CONFIG.demoMode ? 'demo' : 'live',
      generatedAt: new Date().toISOString(),
      complete: result.complete,
      records: result.records.map(publicRecord_),
      sources: result.sources.map(publicSourceStatus_)
    };
  } catch (error) {
    const reference = logServerError_('getDashboardData', error);
    const code = error && error.publicCode ? error.publicCode : 'DASHBOARD_DATA_FAILED';
    const message = error && error.publicMessage
      ? error.publicMessage
      : 'Dashboardgegevens konden niet worden geladen.';
    throw new Error(message + ' Foutcode: ' + code + '. Referentie: ' + reference + '.');
  }
}

function assertDashboardResult_(result) {
  if (!result || !Array.isArray(result.records) || !Array.isArray(result.sources)) {
    throw publicDashboardError_(
      'DATA_FILES_OUT_OF_SYNC',
      'De serverbestanden zijn niet van dezelfde versie. Werk Code.gs en Data.gs samen bij.'
    );
  }
}

function publicDashboardError_(code, message) {
  const error = new Error(message);
  error.publicCode = code;
  error.publicMessage = message;
  return error;
}

/** Logt technische details uitsluitend in Apps Script en geeft een veilige referentie terug. */
function logServerError_(area, error) {
  const reference = errorReference_();
  try {
    const detail = error && (error.stack || error.message) ? (error.stack || error.message) : String(error);
    console.error('[' + reference + '] ' + area + ': ' + detail);
  } catch (loggingError) {
    // Logging mag de oorspronkelijke foutafhandeling nooit blokkeren.
  }
  return reference;
}

function errorReference_() {
  try {
    return Utilities.getUuid().slice(0, 8).toUpperCase();
  } catch (error) {
    return String(new Date().getTime()).slice(-8);
  }
}

/** Weigert standaard wanneer Google geen identiteit beschikbaar stelt. */
function requireAccess_() {
  const email = activeUserEmail_();
  const allowedEmails = (APP_CONFIG.allowedEmails || []).map(normalizeEmail_);

  if (!email || allowedEmails.indexOf(email) === -1) {
    throw new Error('Geen toegang.');
  }

  return email;
}

function activeUserEmail_() {
  try {
    return normalizeEmail_(Session.getActiveUser().getEmail());
  } catch (error) {
    return '';
  }
}

function normalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

/** Bouwt een vaste foutpagina zonder account-, bron- of foutdetails. */
function messagePage_(title, message) {
  const html = '<!doctype html><html lang="nl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + title + '</title></head><body style="font-family:system-ui,sans-serif;' +
    'max-width:42rem;margin:12vh auto;padding:0 1.5rem;line-height:1.6">' +
    '<h1>' + title + '</h1><p>' + message + '</p></body></html>';

  return HtmlService.createHtmlOutput(html).setTitle(title);
}
