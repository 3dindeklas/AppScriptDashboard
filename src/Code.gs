function requireAccess_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const allowed = (PropertiesService.getScriptProperties().getProperty('DASHBOARD_ALLOWED_EMAILS') || '')
    .split(/[,;\n]/).map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!email || !allowed.includes(email)) throw new Error('Geen toegang. Vraag de beheerder je Google-account toe te voegen.');
  return email;
}

function doGet() {
  try {
    requireAccess_();
    return HtmlService.createTemplateFromFile('Index').evaluate()
      .setTitle(CONFIG.title).addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (error) {
    return HtmlService.createHtmlOutput('<h1>Geen toegang</h1><p>Open dit dashboard met een toegestaan Google-account. Neem contact op met de beheerder.</p>');
  }
}

function include_(name) {
  if (!['Styles', 'Analytics', 'Client'].includes(name)) throw new Error('Onbekend bestand.');
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** The only data RPC. No original rows, contacts, notes, credentials or IDs leave the server. */
function getDashboardData() {
  requireAccess_();
  const settings = settings_();
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
