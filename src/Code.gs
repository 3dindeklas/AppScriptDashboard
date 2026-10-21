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
    return accessPage_();
  }

  try {
    return dashboardPage_('');
  } catch (error) {
    return messagePage_(
      'Dashboard tijdelijk niet beschikbaar',
      'De pagina kon niet worden opgebouwd. Controleer de opgeslagen Apps Script-bestanden.'
    );
  }
}

/**
 * Voegt een HTML-partial toe aan Index.html.
 * Styles bevat CSS, Municipalities openbare JSON en Client browsercode.
 */
function include(filename, accessToken) {
  requireAccess_(accessToken);
  if (['Styles', 'Municipalities', 'AccessClient', 'Client'].indexOf(filename) === -1) {
    throw new Error('Bestand niet beschikbaar.');
  }
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (error) {
    throw new Error('Bestand niet beschikbaar.');
  }
}

/**
 * Levert uitsluitend de toegestane dashboardvelden aan een gecontroleerde bezoeker.
 * Contactgegevens, notities, technische ID's en financiële detailvelden worden niet teruggestuurd.
 */
function getDashboardData(accessToken) {
  return dashboardDataResponse_(false, accessToken);
}

/** Importeert Excel en haalt de Google-bronnen bewust opnieuw op en vervangt de gedeelde snapshot. */
function refreshDashboardData(accessToken) {
  return dashboardDataResponse_(true, accessToken);
}

function dashboardDataResponse_(forceRefresh, accessToken) {
  const email = requireAccess_(accessToken);
  const canViewFinancials = canViewFinancials_(email);

  try {
    if (forceRefresh === true && (APP_CONFIG.sources || []).some(function(source) {
      return source && source.type === 'excel-import';
    })) {
      // De import beheert zelf zijn lock; neem pas daarna de snapshotlock.
      refreshExcelImports_();
    }
    const delivery = liveDashboardSnapshot_(forceRefresh === true);

    const snapshot = delivery.snapshot;

    return {
      mode: 'live',
      generatedAt: snapshot.updatedAt,
      complete: snapshot.complete,
      snapshot: {
        source: delivery.source,
        storage: delivery.storage,
        cacheEnabled: snapshotCacheEnabled_()
      },
      permissions: {
        canViewFinancials: canViewFinancials
      },
      records: snapshot.records.map(function(record) {
        return publicRecord_(record, canViewFinancials);
      }),
      sources: snapshot.sources.map(publicSourceStatus_)
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
function requireAccess_(accessToken) {
  if (accessToken) return emailSession_(accessToken).email;
  const email = activeUserEmail_();
  const allowedEmails = (APP_CONFIG.allowedEmails || []).map(normalizeEmail_);

  if (!email || allowedEmails.indexOf(email) === -1) {
    throw new Error('Geen toegang of je sessie is verlopen. Foutcode: ACCESS_REQUIRED.');
  }

  return email;
}

/** Index wordt pas opgebouwd nadat de server de identiteit heeft gecontroleerd. */
function dashboardPage_(accessToken) {
  requireAccess_(accessToken);
  const template = HtmlService.createTemplateFromFile('Index');
  template.accessToken = accessToken || '';
  return template.evaluate().setTitle(APP_CONFIG.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getDashboardPage(accessToken) {
  const session = emailSession_(accessToken);
  return { html: dashboardPage_(accessToken).getContent(), expiresInMs: session.expiresAt - Date.now() };
}

function openGoogleDashboard() {
  return { html: dashboardPage_('').getContent() };
}

/** Alleen de publieke toegangspagina; bevat geen dashboard-HTML of gegevens. */
function getAccessPage() {
  return accessPage_().getContent();
}

function accessPage_() {
  try {
    const template = HtmlService.createTemplateFromFile('Access');
    template.emailLoginEnabled = emailAccessSettings_().enabled;
    return template.evaluate().setTitle('Toegang · ' + APP_CONFIG.title)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (error) {
    return messagePage_('Geen toegang', 'Open dit dashboard met een toegestaan Google-account of neem contact op met de beheerder.');
  }
}

/** Alleen statische toegangsmiddelen; private helpers zijn niet via script.run bereikbaar. */
function accessInclude_(filename) {
  if (['Styles', 'AccessClient'].indexOf(filename) === -1) throw new Error('Bestand niet beschikbaar.');
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function activeUserEmail_() {
  try {
    return normalizeEmail_(Session.getActiveUser().getEmail());
  } catch (error) {
    return '';
  }
}

function effectiveUserEmail_() {
  try {
    return normalizeEmail_(Session.getEffectiveUser().getEmail());
  } catch (error) {
    return '';
  }
}

function normalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

/** Financiële toegang is een expliciete tweede allowlist boven op dashboardtoegang. */
function canViewFinancials_(email) {
  const allowedEmails = (APP_CONFIG.financialAllowedEmails || []).map(normalizeEmail_);
  return allowedEmails.indexOf(normalizeEmail_(email)) !== -1;
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
