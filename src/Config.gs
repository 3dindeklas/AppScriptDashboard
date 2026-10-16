/** Public defaults only. Keep real IDs, viewers and tokens in Script Properties. */
const CONFIG = Object.freeze({
  title: 'Workshopkompas',
  demoMode: true,
  maxRowsPerSource: 15000,
  maxTotalRows: 30000,
  microsoftSetupSourceId: 'stichting-b',
  sources: [
    { id: 'stichting-a', label: 'Stichting A', type: 'googleSheets', enabled: true,
      spreadsheetId: '', sheetName: 'Workshops', headerRow: 8 },
    { id: 'stichting-b', label: 'Stichting B', type: 'microsoftExcel', enabled: true,
      driveId: '', itemId: '', tableName: 'Workshops', connectionId: 'M365_B' }
  ],
  // Canonical name -> alternate header names. Empty spacer columns are ignored.
  headerAliases: {},
  statusGroups: {
    'nieuw': 'Open', 'contact': 'Open', 'contact gelegd': 'Open', 'optie': 'Open',
    'open': 'Open', 'akkoord': 'Ingepland', 'bevestiging': 'Ingepland',
    'ingepland': 'Ingepland', 'uitgevoerd': 'Uitgevoerd',
    'geannuleerd': 'Geannuleerd', 'afgezegd': 'Geannuleerd',
    'volgend schooljaar': 'Volgend schooljaar'
  }
});

function settings_() {
  const p = PropertiesService.getScriptProperties();
  const raw = p.getProperty('DASHBOARD_SOURCES');
  // Script Properties contain JSON, unlike the JavaScript object in CONFIG.sources.
  // Do not eval or silently fall back: that could hide a broken live configuration.
  let sources = CONFIG.sources;
  if (raw !== null) {
    try {
      sources = JSON.parse(raw);
    } catch (error) {
      throw dashboardError_('CONFIG_SOURCES_JSON');
    }
  }
  if (!Array.isArray(sources) || !sources.length) throw dashboardError_('CONFIG_SOURCES_SHAPE');
  const ids = new Set();
  sources.forEach(s => {
    if (!s || typeof s !== 'object' || Array.isArray(s) ||
        typeof s.id !== 'string' || !s.id.trim() ||
        typeof s.label !== 'string' || !s.label.trim() || ids.has(s.id) ||
        (s.enabled !== undefined && typeof s.enabled !== 'boolean')) {
      throw dashboardError_('CONFIG_SOURCES_ENTRY');
    }
    ids.add(s.id);
  });
  const enabled = sources.filter(s => s.enabled !== false);
  if (!enabled.length) throw dashboardError_('CONFIG_SOURCES_DISABLED');
  const rawDemo = p.getProperty('DEMO_MODE');
  const demo = rawDemo === null ? null : rawDemo.trim();
  if (demo !== null && demo !== 'true' && demo !== 'false') throw dashboardError_('CONFIG_DEMO_MODE');
  return { sources: enabled, demoMode: demo === null ? CONFIG.demoMode : demo === 'true' };
}
