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
  const sources = raw ? JSON.parse(raw) : CONFIG.sources;
  if (!Array.isArray(sources) || !sources.length) throw new Error('Configureer ten minste één bron.');
  const ids = new Set();
  sources.forEach(s => {
    if (!s.id || !s.label || ids.has(s.id)) throw new Error('Elke bron moet een unieke id en een label hebben.');
    ids.add(s.id);
  });
  const enabled = sources.filter(s => s.enabled !== false);
  if (!enabled.length) throw new Error('Schakel ten minste één bron in.');
  return { sources: enabled,
    demoMode: p.getProperty('DEMO_MODE') === null ? CONFIG.demoMode : p.getProperty('DEMO_MODE') === 'true' };
}
