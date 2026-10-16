const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function context(extra = {}) {
  const ctx = vm.createContext({
    Date,
    console,
    Utilities: { formatDate: date => date.toISOString().slice(0, 10) },
    Session: { getScriptTimeZone: () => 'Europe/Amsterdam' },
    ...extra
  });

  for (const file of ['Config.gs', 'Data.gs', 'Code.gs']) {
    vm.runInContext(fs.readFileSync('src/' + file, 'utf8'), ctx);
  }
  return ctx;
}

const headers = [
  'Aanvraag ID', 'Datum aanvraag', 'Schoolnaam', 'Contactpersoon', 'E-mailadres',
  'Gemeente / Regio', 'Workshopnaam', 'Aanbieder', 'Lesmomenten',
  'Aantal leerlingen', 'PO / VO', 'Definitieve datum', 'Status', 'Notities'
];

const row = [
  'secret-id', '14-10-2026', 'School A', 'Privé Persoon', 'private@example.test',
  'Ameide', '3D-sleutelhanger', '3Dindeklas', '2x', '24', 'po',
  '20-11-2026', 'Ingepland', 'Niet naar de browser sturen'
];

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

test('demo werkt zonder configuratie en bevat beide stichtingen', () => {
  const payload = context().getDashboardData();
  assert.equal(payload.mode, 'demo');
  assert.equal(payload.records.length, 10);
  assert.deepEqual([...new Set(payload.records.map(record => record.source))].sort(), ['Stichting A', 'Stichting B']);
});

test('kolommen worden op naam gekoppeld en privacyvelden verlaten de server niet', () => {
  const result = context().mapSheetRows_([headers, row], 'Stichting A');
  assert.equal(result.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result[0])), {
    source: 'Stichting A',
    date: '2026-11-20',
    workshop: '3D-sleutelhanger',
    provider: '3Dindeklas',
    region: 'Ameide',
    sector: 'PO',
    status: 'Ingepland',
    sessions: 2,
    students: 24
  });

  const json = JSON.stringify(result);
  for (const privateValue of ['secret-id', 'Privé Persoon', 'private@example.test', 'Niet naar de browser sturen', 'School A']) {
    assert.ok(!json.includes(privateValue));
  }
});

test('Nederlandse getallen en datums worden eenvoudig verwerkt', () => {
  const ctx = context();
  assert.equal(ctx.numberValue_('€ 1.234,50'), 1234.5);
  assert.equal(ctx.numberValue_('2x'), 2);
  assert.equal(ctx.numberValue_(''), 0);
  assert.equal(ctx.dateValue_('14/10/2026'), '2026-10-14');
  assert.equal(ctx.dateValue_('2026-10-14'), '2026-10-14');
  assert.equal(ctx.dateValue_('morgen'), '');
});

test('lege rijen worden genegeerd en ontbrekende waarden krijgen een veilig label', () => {
  const empty = Array(headers.length).fill('');
  const partial = Array(headers.length).fill('');
  partial[headers.indexOf('Workshopnaam')] = 'Paper Circuits';
  const result = context().mapSheetRows_([headers, empty, partial], 'Stichting B');
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'Onbekend');
  assert.equal(result[0].sector, 'Onbekend');
});

test('een ontbrekende kolom Workshopnaam geeft een leesbare fout', () => {
  assert.throws(
    () => context().mapSheetRows_([['Status'], ['Open']], 'Stichting A'),
    /kolom Workshopnaam ontbreekt in Stichting A/
  );
});

test('Google Sheet wordt vanaf de ingestelde kopregel gelezen', () => {
  let requestedRange;
  const sheet = {
    getLastRow: () => 10,
    getLastColumn: () => headers.length,
    getRange: (...args) => {
      requestedRange = args;
      return { getValues: () => [headers, row, row] };
    }
  };
  const ctx = context({ SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) } });
  const result = ctx.readGoogleSheet_({ name: 'Stichting A', spreadsheetId: 'test', sheetName: 'Workshops', headerRow: 8 });
  assert.deepEqual(requestedRange, [8, 1, 3, headers.length]);
  assert.equal(result.length, 2);
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
    }
  };
  const ctx = context({ HtmlService: htmlService });
  assert.equal(ctx.doGet().title, 'Workshopkompas');
  assert.equal(ctx.doGet().viewport, 'viewport:width=device-width, initial-scale=1');
  assert.equal(ctx.include('Styles'), '<Styles>');
});
