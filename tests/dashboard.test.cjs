const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function session(email = 'jouw-account@voorbeeld.nl') {
  return {
    getScriptTimeZone: () => 'Europe/Amsterdam',
    getActiveUser: () => ({ getEmail: () => email })
  };
}

function context(extra = {}, configTransform = source => source) {
  const ctx = vm.createContext({
    Date,
    console,
    Utilities: { formatDate: date => date.toISOString().slice(0, 10) },
    Session: session(),
    ...extra
  });

  for (const file of ['Config.gs', 'Data.gs', 'Code.gs']) {
    const source = fs.readFileSync('src/' + file, 'utf8');
    vm.runInContext(file === 'Config.gs' ? configTransform(source) : source, ctx);
  }
  return ctx;
}

function liveContext(extra = {}, options = {}) {
  const ids = options.ids || ['source-a-id', 'source-b-id'];
  const maxRows = options.maxRows || 5000;
  return context(extra, source => {
    let sourceIndex = 0;
    return source
      .replace('demoMode: true', 'demoMode: false')
      .replace('maxRowsPerSource: 5000', 'maxRowsPerSource: ' + maxRows)
      .replace(/spreadsheetId: ''/g, () => "spreadsheetId: '" + (ids[sourceIndex++] || '') + "'");
  });
}

function googleSheet(rows, overrides = {}) {
  return {
    getLastRow: () => 8 + rows.length,
    getLastColumn: () => headers.length,
    getRange: () => ({ getValues: () => [headers, ...rows] }),
    ...overrides
  };
}

const headers = [
  '#', 'Aanvraag ID', 'Datum aanvraag', 'Schoolnaam', 'Contactpersoon',
  'E-mailadres', 'Telefoon', 'Gemeente / Regio', '', 'Workshopnaam',
  'Aanbieder', 'Lesmomenten', 'Aantal leerlingen', 'Groep / leerjaar',
  'PO / VO', 'Gewenste periode', 'Definitieve datum', 'Locatie', 'Type', '',
  'Punten per workshop', '', 'Prijs per workshop (aanbieder)',
  'Reiskosten aanbieder', 'Extra kosten', 'Totale kosten aanbieder', '',
  'Te factureren i_lab', 'Marge (€)', 'Marge (%)', '', 'Status',
  'Laatste contactdatum', 'Actie nodig', 'Email Concept type',
  'Email aangemaakt op', 'Email Concept ID', 'Calendar Event IDs',
  'Email Source ID', 'Notities', 'Debug info'
];

const rowValues = {
  '#': 1,
  'Aanvraag ID': 'REQ-001',
  'Datum aanvraag': '14-10-2026',
  'Schoolnaam': 'School A',
  'Contactpersoon': 'Privé Persoon',
  'E-mailadres': 'private@example.test',
  'Telefoon': '0612345678',
  'Gemeente / Regio': 'Ameide',
  'Workshopnaam': '3D-sleutelhanger',
  'Aanbieder': '3Dindeklas',
  'Lesmomenten': '2x',
  'Aantal leerlingen': '24',
  'Groep / leerjaar': 'groep 6/7/8',
  'PO / VO': 'po',
  'Gewenste periode': 'Najaar 2026',
  'Definitieve datum': '20-11-2026',
  'Locatie': 'Technieklokaal',
  'Type': 'Workshop',
  'Punten per workshop': '350',
  'Prijs per workshop (aanbieder)': '€ 450,00',
  'Reiskosten aanbieder': '25,50',
  'Extra kosten': '10',
  'Totale kosten aanbieder': '€ 485,50',
  'Te factureren i_lab': '650,00',
  'Marge (€)': '164,50',
  'Marge (%)': '25,31%',
  'Status': 'Akkoord',
  'Laatste contactdatum': '01-11-2026',
  'Actie nodig': 'Nee',
  'Email Concept type': 'bevestiging',
  'Email aangemaakt op': '02-11-2026',
  'Email Concept ID': 'secret-draft-id',
  'Calendar Event IDs': 'secret-calendar-id',
  'Email Source ID': 'secret-source-id',
  'Notities': 'Niet naar de browser sturen',
  'Debug info': 'private-debug'
};

function row(overrides = {}) {
  const values = { ...rowValues, ...overrides };
  return headers.map(header => header ? (values[header] ?? '') : '');
}

function normalize(matrix = [headers, row()]) {
  return context().normalizeSheet_(matrix, 'Stichting A');
}

test('serverbestanden bevatten geen browser-API\'s', () => {
  for (const file of fs.readdirSync('src').filter(name => name.endsWith('.gs'))) {
    const source = fs.readFileSync('src/' + file, 'utf8');
    assert.doesNotMatch(source, /\b(?:document|window)\b/, file);
  }
});

test('Index gebruikt uitsluitend de officiële include-opzet', () => {
  const index = fs.readFileSync('src/Index.html', 'utf8');
  assert.match(index, /<\?!= include\('Styles'\); \?>/);
  assert.match(index, /<\?!= include\('Client'\); \?>/);
  assert.doesNotMatch(index, /include_/);
});

test('demo blijft werken en de browser ontvangt alleen de bestaande veilige velden', () => {
  const payload = context().getDashboardData();
  assert.equal(payload.mode, 'demo');
  assert.equal(payload.complete, true);
  assert.equal(payload.records.length, 10);
  assert.deepEqual(JSON.parse(JSON.stringify(payload.sources.map(source => [source.name, source.status, source.recordCount]))), [
    ['Stichting A', 'demo', 5],
    ['Stichting B', 'demo', 5]
  ]);
  assert.deepEqual([...new Set(payload.records.map(record => record.source))].sort(), ['Stichting A', 'Stichting B']);
  assert.deepEqual(Object.keys(payload.records[0]).sort(), [
    'date', 'provider', 'region', 'sector', 'sessions', 'source', 'status', 'students', 'workshop'
  ]);
});

test('toegang gebruikt een exacte genormaliseerde accountmatch', () => {
  const allowed = context({ Session: session('  JOUW-ACCOUNT@VOORBEELD.NL ') });
  assert.equal(allowed.requireAccess_(), 'jouw-account@voorbeeld.nl');

  const similarDomain = context({ Session: session('ander@voorbeeld.nl') });
  assert.throws(() => similarDomain.requireAccess_(), /Geen toegang/);
});

test('ontbrekende en niet-toegestane identiteiten ontvangen geen dashboarddata', () => {
  for (const email of ['', 'niet-toegestaan@voorbeeld.nl']) {
    const ctx = context({ Session: session(email) });
    assert.throws(() => ctx.getDashboardData(), /Geen toegang/);
  }
});

test('demomodus omzeilt de toegangscontrole niet', () => {
  const config = fs.readFileSync('src/Config.gs', 'utf8');
  assert.match(config, /demoMode:\s*true/);
  assert.throws(
    () => context({ Session: session('niet-toegestaan@voorbeeld.nl') }).getDashboardData(),
    /Geen toegang/
  );
});

test('volledige kolomstructuur wordt naar één intern record genormaliseerd', () => {
  const result = normalize();
  assert.equal(result.records.length, 1);
  const record = result.records[0];

  assert.equal(record.requestId, 'REQ-001');
  assert.equal(record.requestedDate, '2026-10-14');
  assert.equal(record.scheduledDate, '2026-11-20');
  assert.equal(record.schoolYear, '2026–2027');
  assert.equal(record.school, 'School A');
  assert.equal(record.schoolKey, 'school a|ameide');
  assert.equal(record.workshop, '3D-sleutelhanger');
  assert.equal(record.sessions, 2);
  assert.equal(record.students, 24);
  assert.deepEqual(Array.from(record.grades), [6, 7, 8]);
  assert.equal(record.statusGroup, 'Ingepland');
  assert.equal(record.providerWorkshopPrice, 450);
  assert.equal(record.providerTotalCosts, 485.5);
  assert.equal(record.invoiceAmount, 650);
  assert.equal(record.marginAmount, 164.5);
  assert.equal(record.marginPercent, 25.31);
  assert.equal(record.financialComplete, true);
  assert.equal(record.lastContactDate, '2026-11-01');
});

test('kolomvolgorde en lege spacer-kolommen veranderen het resultaat niet', () => {
  const original = normalize();
  const reversed = normalize([headers.slice().reverse(), row().slice().reverse()]);
  assert.deepEqual(JSON.parse(JSON.stringify(reversed)), JSON.parse(JSON.stringify(original)));
});

test('dubbele niet-lege kolomkoppen worden geweigerd maar lege spacers niet', () => {
  assert.equal(normalize().records.length, 1);
  assert.throws(
    () => normalize([headers.concat(' Schoolnaam '), row().concat('Tweede school')]),
    /Dubbele kolomkop.*Schoolnaam/
  );
  assert.throws(
    () => context().normalizeSheet_([['Status'], ['Open']], 'Stichting A'),
    /kolom Workshopnaam ontbreekt in Stichting A/
  );
});

test('Nederlandse getallen blijven onderscheid maken tussen nul, leeg en ongeldig', () => {
  const ctx = context();
  for (const [value, expected] of [
    ['€ 1.234,50', 1234.5], ['1.234', 1234], ['25,5', 25.5],
    ['25.5', 25.5], [0, 0], ['0', 0], ['', null], ['n.v.t.', null],
    ['12 leerlingen', null], [Infinity, null]
  ]) {
    assert.equal(ctx.numberValue_(value), expected);
  }
});

test('aantallen accepteren alleen gehele niet-negatieve waarden', () => {
  const ctx = context();
  assert.equal(ctx.countValue_('2x'), 2);
  assert.equal(ctx.countValue_(0), 0);
  assert.equal(ctx.countValue_('24'), 24);
  assert.equal(ctx.countValue_(2.5), null);
  assert.equal(ctx.countValue_(-1), null);
  assert.equal(ctx.countValue_('12 leerlingen'), null);
  assert.equal(ctx.countValue_(''), null);
});

test('datums ondersteunen Google Date, Nederlands, ISO en Excel-serienummers', () => {
  const ctx = context();
  assert.equal(ctx.dateValue_(new Date('2026-10-14T12:00:00Z')), '2026-10-14');
  assert.equal(ctx.dateValue_('14/10/2026'), '2026-10-14');
  assert.equal(ctx.dateValue_('2026-10-14'), '2026-10-14');
  assert.equal(ctx.dateValue_(45000), '2023-03-15');
  for (const value of ['31-02-2026', '2026-13-01', 'morgen', '', null]) {
    assert.equal(ctx.dateValue_(value), null);
  }
});

test('statuswaarden worden in vaste groepen geplaatst', () => {
  const ctx = context();
  for (const [status, group] of [
    ['Nieuw', 'Open'], ['Contact gelegd', 'Open'], ['Optie', 'Open'],
    ['Akkoord', 'Ingepland'], ['Bevestiging', 'Ingepland'],
    ['Uitgevoerd', 'Uitgevoerd'], ['Afgezegd', 'Geannuleerd'],
    ['Volgend schooljaar', 'Volgend schooljaar'], ['Anders', 'Overig']
  ]) {
    assert.equal(ctx.statusGroup_(status), group);
  }
});

test('schooljaar wisselt op 1 augustus', () => {
  const ctx = context();
  assert.equal(ctx.schoolYear_('2026-07-31'), '2025–2026');
  assert.equal(ctx.schoolYear_('2026-08-01'), '2026–2027');
  assert.equal(ctx.schoolYear_(null), null);
});

test('combinatiegroepen en leerjaren worden sectorgebonden verwerkt', () => {
  const ctx = context();
  assert.deepEqual(Array.from(ctx.gradeValues_('groep 3 t/m 5', 'PO')), [3, 4, 5]);
  assert.deepEqual(Array.from(ctx.gradeValues_('6/7/8', 'PO')), [6, 7, 8]);
  assert.deepEqual(Array.from(ctx.gradeValues_('leerjaar 1/2', 'VO')), [1, 2]);
  assert.deepEqual(Array.from(ctx.gradeValues_('6/7', 'VO')), []);
  assert.deepEqual(Array.from(ctx.gradeValues_('brugklas', 'VO')), []);
  assert.deepEqual(Array.from(ctx.gradeValues_('5-3', 'PO')), []);
});

test('ontbrekende IDs, dubbele IDs en ongeldige waarden worden geteld', () => {
  const empty = Array(headers.length).fill('');
  const result = normalize([
    headers,
    row(),
    row({ 'Schoolnaam': 'School B' }),
    row({ 'Aanvraag ID': '', 'Datum aanvraag': '31-02-2026', 'Definitieve datum': 'morgen', 'Aantal leerlingen': 'veel', 'PO / VO': 'MBO' }),
    empty
  ]);

  assert.equal(result.records.length, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(result.warnings)), {
    rowsTruncated: 0,
    emptyRows: 1,
    missingRequestIds: 1,
    duplicateRequestIds: 1,
    invalidRequestedDates: 1,
    invalidScheduledDates: 1,
    invalidStudentCounts: 1,
    unknownSectors: 1
  });
});

test('privacyvelden en intern voorbereide velden verlaten getDashboardData niet', () => {
  const internal = { ...normalize().records[0], laterToegevoegdGeheim: 'nieuw-geheim' };
  const publicRecord = context().publicRecord_(internal);
  const json = JSON.stringify(publicRecord);

  assert.deepEqual(Object.keys(publicRecord), [
    'source', 'date', 'workshop', 'provider', 'region', 'sector', 'status', 'sessions', 'students'
  ]);

  for (const privateValue of [
    'REQ-001', 'School A', 'Privé Persoon', 'private@example.test', '0612345678',
    'Technieklokaal', 'secret-draft-id', 'secret-calendar-id', 'secret-source-id',
    'Niet naar de browser sturen', 'private-debug', '485.5', '650', '164.5', 'nieuw-geheim'
  ]) {
    assert.ok(!json.includes(privateValue), privateValue);
  }
});

test('Google Sheet wordt vanaf de ingestelde kopregel gelezen', () => {
  let requestedRange;
  const sheet = {
    getLastRow: () => 10,
    getLastColumn: () => headers.length,
    getRange: (...args) => {
      requestedRange = args;
      return { getValues: () => [headers, row(), row({ 'Aanvraag ID': 'REQ-002' })] };
    }
  };
  const ctx = context({ SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) } });
  const result = ctx.readGoogleSheet_({ name: 'Stichting A', spreadsheetId: 'test', sheetName: 'Workshops', headerRow: 8 });
  assert.deepEqual(requestedRange, [8, 1, 3, headers.length]);
  assert.equal(result.records.length, 2);
  assert.equal(result.warnings.duplicateRequestIds, 0);
});

test('Google Sheet respecteert de rijlimiet en meldt overgeslagen rijen', () => {
  let requestedRange;
  const sheet = googleSheet([row(), row(), row()], {
    getRange: (...args) => {
      requestedRange = args;
      return { getValues: () => [headers, row()] };
    }
  });
  const ctx = liveContext({
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) }
  }, { maxRows: 1 });
  const result = ctx.readGoogleSheet_({
    name: 'Stichting A', spreadsheetId: 'source-a-id', sheetName: 'Workshops', headerRow: 8
  });

  assert.deepEqual(requestedRange, [8, 1, 2, headers.length]);
  assert.equal(result.records.length, 1);
  assert.equal(result.warnings.rowsTruncated, 2);
});

test('rijlimiet heeft een veilige standaard en harde bovengrens', () => {
  assert.equal(liveContext({}, { maxRows: 25000 }).sourceRowLimit_(), 10000);
  const invalidLimit = context({}, source => source.replace('maxRowsPerSource: 5000', "maxRowsPerSource: 'ongeldig'"));
  assert.equal(invalidLimit.sourceRowLimit_(), 5000);
});

test('een mislukte bron blokkeert beschikbare live gegevens niet', () => {
  const sheet = googleSheet([row({ 'Workshopnaam': 'Echte workshop A' })]);
  const ctx = liveContext({
    SpreadsheetApp: {
      openById: id => {
        if (id === 'source-a-id') return { getSheetByName: () => sheet };
        throw new Error('providerfout met spreadsheet-id source-b-id en geheim-123');
      }
    }
  });
  const payload = ctx.getDashboardData();
  const json = JSON.stringify(payload);

  assert.equal(payload.mode, 'live');
  assert.equal(payload.complete, false);
  assert.equal(payload.records.length, 1);
  assert.equal(payload.records[0].workshop, 'Echte workshop A');
  assert.deepEqual(JSON.parse(JSON.stringify(payload.sources.map(source => [source.status, source.recordCount]))), [
    ['ok', 1],
    ['error', 0]
  ]);
  assert.equal(payload.sources[1].message, 'Bron kon niet worden geladen.');
  assert.ok(!json.includes('source-a-id'));
  assert.ok(!json.includes('source-b-id'));
  assert.ok(!json.includes('geheim-123'));
  assert.ok(!json.includes('Voorbeeldschool'));
});

test('live-modus met ontbrekende configuratie valt niet terug op demo', () => {
  const payload = context({}, source => source.replace('demoMode: true', 'demoMode: false')).getDashboardData();

  assert.equal(payload.mode, 'live');
  assert.equal(payload.complete, false);
  assert.equal(payload.records.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(payload.sources.map(source => source.status))), ['not-configured', 'not-configured']);
});

test('datakwaliteitswaarschuwingen worden per bron als veilige aantallen gepubliceerd', () => {
  const sheet = googleSheet([row({
    'Aanvraag ID': '',
    'Datum aanvraag': '31-02-2026',
    'Aantal leerlingen': 'veel'
  })]);
  const payload = liveContext({
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) }
  }).getDashboardData();
  const source = payload.sources[0];

  assert.equal(source.status, 'warning');
  assert.equal(source.recordCount, 1);
  assert.equal(source.warnings.missingRequestIds, 1);
  assert.equal(source.warnings.invalidRequestedDates, 1);
  assert.equal(source.warnings.invalidStudentCounts, 1);
  assert.equal(source.warningCount, 3);
});

test('bronprojectie laat technische velden en providerfouten nooit door', () => {
  const source = context().publicSourceStatus_({
    name: 'Stichting A',
    status: 'error',
    recordCount: 0,
    warningCount: 0,
    warnings: { internGeheim: 99 },
    message: 'Bron kon niet worden geladen.',
    spreadsheetId: 'geheim-sheet-id',
    providerError: 'Google provider detail'
  });
  const json = JSON.stringify(source);

  assert.ok(!json.includes('internGeheim'));
  assert.ok(!json.includes('geheim-sheet-id'));
  assert.ok(!json.includes('Google provider detail'));
});

test('doGet en include volgen rechtstreeks de HtmlService-methoden', () => {
  const output = {
    title: '',
    viewport: '',
    setTitle(value) { this.title = value; return this; },
    addMetaTag(name, value) { this.viewport = name + ':' + value; return this; }
  };
  const htmlService = {
    createTemplateFromFile(name) {
      assert.equal(name, 'Index');
      return { evaluate: () => output };
    },
    createHtmlOutputFromFile(name) {
      return { getContent: () => '<' + name + '>' };
    },
    createHtmlOutput(content) {
      return { content, setTitle() { return this; } };
    }
  };
  const ctx = context({ HtmlService: htmlService });
  assert.equal(ctx.doGet().title, 'Workshopkompas');
  assert.equal(ctx.doGet().viewport, 'viewport:width=device-width, initial-scale=1');
  assert.equal(ctx.include('Styles'), '<Styles>');
  assert.throws(() => ctx.include('Onbekend'), /Bestand niet beschikbaar/);
});

test('doGet toont een vaste veilige pagina aan geweigerde accounts', () => {
  let templateCalls = 0;
  const htmlService = {
    createTemplateFromFile() {
      templateCalls += 1;
      throw new Error('mag niet worden aangeroepen');
    },
    createHtmlOutput(content) {
      return {
        content,
        title: '',
        setTitle(value) { this.title = value; return this; }
      };
    }
  };
  const ctx = context({
    Session: session('niet-toegestaan@voorbeeld.nl'),
    HtmlService: htmlService
  });
  const output = ctx.doGet();

  assert.equal(templateCalls, 0);
  assert.equal(output.title, 'Geen toegang');
  assert.match(output.content, /Config\.gs/);
  assert.doesNotMatch(output.content, /niet-toegestaan@voorbeeld\.nl/);
});

test('doGet toont geen technische details wanneer de template faalt', () => {
  const htmlService = {
    createTemplateFromFile() {
      throw new Error('Index.html regel 99 bevat geheim-123');
    },
    createHtmlOutput(content) {
      return {
        content,
        title: '',
        setTitle(value) { this.title = value; return this; }
      };
    }
  };
  const output = context({ HtmlService: htmlService }).doGet();

  assert.equal(output.title, 'Dashboard tijdelijk niet beschikbaar');
  assert.doesNotMatch(output.content, /regel 99|geheim-123/);
});

test('bronstatus-interface staat in de HTML en gebruikt geen inline brondata', () => {
  const index = fs.readFileSync('src/Index.html', 'utf8');
  const client = fs.readFileSync('src/Client.html', 'utf8');
  assert.match(index, /id="sourceCards"/);
  assert.match(index, /BRONNEN &amp; DATAKWALITEIT/);
  assert.match(client, /renderSourceStatus/);
  assert.match(client, /textContent = source\.message/);
});

test('manifest draait als bezoeker en vraagt alleen de benodigde identiteitsscope', () => {
  const manifest = JSON.parse(fs.readFileSync('src/appsscript.json', 'utf8'));
  assert.equal(manifest.webapp.executeAs, 'USER_ACCESSING');
  assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/userinfo.email'));
});
