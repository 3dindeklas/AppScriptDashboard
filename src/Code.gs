function requireAccess_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const allowed = (PropertiesService.getScriptProperties().getProperty('DASHBOARD_ALLOWED_EMAILS') || '')
    .split(/[,;\n]/).map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!email || !allowed.includes(email)) throw dashboardError_('ACCESS_DENIED');
  return email;
}

/** Only fixed messages cross the trust boundary; never render a raw exception. */
function dashboardErrorInfo_(code) {
  const messages = {
    ACCESS_DENIED: ['Geen toegang', 'Geen toegang. Vraag de beheerder je Google-account toe te voegen.'],
    ACCESS_CHECK_FAILED: ['Toegangscontrole mislukt', 'De accountcontrole kon niet worden uitgevoerd. Laat de beheerder de Google-autorisatie en implementatie-instellingen controleren.'],
    CONFIG_SOURCES_JSON: ['Configuratiefout', 'DASHBOARD_SOURCES bevat ongeldige JSON. Controleer Projectinstellingen → Script properties. Gebruik dubbele rechte aanhalingstekens rond veldnamen en tekstwaarden, geen comments of afsluitende komma’s. Plak alleen de JSON-array; niet de JavaScript-code uit Config.gs.'],
    CONFIG_SOURCES_SHAPE: ['Configuratiefout', 'DASHBOARD_SOURCES moet een JSON-array met ten minste één bron zijn: [{"id":"stichting-a","label":"Stichting A","type":"googleSheets"}]. Gebruik voor een echte koppeling het volledige voorbeeld in de installatiehandleiding.'],
    CONFIG_SOURCES_ENTRY: ['Configuratiefout', 'Elke bron in DASHBOARD_SOURCES of CONFIG.sources moet een object zijn met een unieke, niet-lege id en een niet-leeg label (beide tekst). enabled moet true of false zijn, zonder aanhalingstekens.'],
    CONFIG_SOURCES_DISABLED: ['Configuratiefout', 'Alle bronnen zijn uitgeschakeld. Zet bij ten minste één bron enabled op true.'],
    CONFIG_DEMO_MODE: ['Configuratiefout', 'De Script property DEMO_MODE moet exact true of false bevatten, zonder aanhalingstekens. Verwijder de property als je CONFIG.demoMode wilt gebruiken.'],
    CONFIG_READ_FAILED: ['Configuratie niet beschikbaar', 'De dashboardinstellingen konden niet worden gelezen. Laat de beheerder Script properties en Config.gs controleren.'],
    PAGE_RENDER_FAILED: ['Dashboard kon niet starten', 'Je account is toegestaan, maar het opbouwen van de pagina is mislukt. Controleer Index.html, Styles.html, Analytics.html en Client.html en werk de implementatie bij naar de juiste versie.']
  };
  const safeCode = Object.prototype.hasOwnProperty.call(messages, code) ? code : 'PAGE_RENDER_FAILED';
  return { code: safeCode, title: messages[safeCode][0], message: messages[safeCode][1] };
}

function dashboardError_(code) {
  const info = dashboardErrorInfo_(code);
  const error = new Error('[' + info.code + '] ' + info.message);
  error.dashboardCode = info.code;
  return error;
}

function configurationFailure_(error) {
  const code = error && error.dashboardCode;
  return dashboardErrorInfo_(typeof code === 'string' && code.startsWith('CONFIG_') ? code : 'CONFIG_READ_FAILED');
}

function startupErrorPage_(info) {
  // Only allowlisted diagnostic text is displayed, even if this helper is misused.
  const safe = dashboardErrorInfo_(info.code);
  const escape = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  console.error('Workshopkompas: ' + safe.code);
  return HtmlService.createHtmlOutput('<!doctype html><html lang="nl"><head><meta charset="utf-8"></head><body>' +
    '<h1>' + escape(safe.title) + '</h1><p>' + escape(safe.message) + '</p><p>Foutcode: <code>' + safe.code + '</code></p></body></html>')
    .setTitle(safe.title).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doGet() {
  // Check access first: denied users must never see configuration diagnostics.
  try {
    requireAccess_();
  } catch (error) {
    return startupErrorPage_(dashboardErrorInfo_(error && error.dashboardCode === 'ACCESS_DENIED' ? 'ACCESS_DENIED' : 'ACCESS_CHECK_FAILED'));
  }
  try {
    settings_();
  } catch (error) {
    return startupErrorPage_(configurationFailure_(error));
  }
  try {
    return HtmlService.createTemplateFromFile('Index').evaluate()
      .setTitle(CONFIG.title).addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (error) {
    return startupErrorPage_(dashboardErrorInfo_('PAGE_RENDER_FAILED'));
  }
}

function include_(name) {
  if (!['Styles', 'Analytics', 'Client'].includes(name)) throw new Error('Onbekend bestand.');
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** The only data RPC. No original rows, contacts, notes, credentials or IDs leave the server. */
function getDashboardData() {
  requireAccess_();
  let settings;
  try {
    settings = settings_();
  } catch (error) {
    // Explicit safe envelope; RPC transports do not preserve custom Error properties.
    return { error: configurationFailure_(error) };
  }
  if (settings.demoMode) return demoPayload_();
  let records = [];
  const sources = settings.sources.map(source => {
    try {
      const result = normalizeSource_(readSource_(source), source);
      if (records.length + result.records.length > CONFIG.maxTotalRows) throw new Error('Totale rijlimiet overschreden.');
      records = records.concat(result.records);
      return { label: source.label, id: source.id, ok: true, count: result.records.length, warnings: result.warnings };
    } catch (error) {
      // Never forward provider errors: they may contain IDs, URLs or original sheet content.
      return { label: source.label, id: source.id, ok: false, count: 0,
        message: 'Bron niet geladen. Controleer configuratie, rechten, kolomkoppen, dubbele aanvraag-ID’s en rijlimiet.' };
    }
  });
  return { demo: false, loadedAt: new Date().toISOString(), records: records, sources: sources };
}
