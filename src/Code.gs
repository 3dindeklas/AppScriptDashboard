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
 * Contactgegevens, notities en technische ID's worden niet teruggestuurd.
 */
function getDashboardData() {
  requireAccess_();

  try {
    const internalRecords = APP_CONFIG.demoMode ? demoRecords_() : readConfiguredSheets_();

    return {
      mode: APP_CONFIG.demoMode ? 'demo' : 'live',
      generatedAt: new Date().toISOString(),
      records: internalRecords.map(publicRecord_)
    };
  } catch (error) {
    throw new Error('Dashboardgegevens konden niet worden geladen.');
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
