const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const silentConsole = { log() {}, error() {} };

function session(email = 'jouw-account@voorbeeld.nl') {
  return {
    getScriptTimeZone: () => 'Europe/Amsterdam',
    getActiveUser: () => ({ getEmail: () => email })
  };
}

function context(extra = {}, configTransform = source => source) {
  const ctx = vm.createContext({
    Date,
    console: silentConsole,
    Utilities: {
      formatDate: date => date.toISOString().slice(0, 10),
      getUuid: () => '12345678-abcd-4321-abcd-1234567890ab'
    },
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
  const formulaRows = overrides.formulaRows || rows.map(() => Array(headers.length).fill(''));
  const onGetRange = overrides.onGetRange || (() => {});
  const sheetOverrides = { ...overrides };
  delete sheetOverrides.formulaRows;
  delete sheetOverrides.onGetRange;

  function rangeRows(startRow, numRows, matrixRows) {
    const allRows = [headers, ...matrixRows];
    const offset = startRow - 8;
    return allRows.slice(offset, offset + numRows);
  }

  return {
    getLastRow: () => 8 + rows.length,
    getLastColumn: () => headers.length,
    getRange: (startRow, startColumn, numRows, numColumns) => {
      onGetRange(startRow, startColumn, numRows, numColumns);
      const sliceColumns = matrix => matrix.map(row =>
        row.slice(startColumn - 1, startColumn - 1 + numColumns)
      );
      return {
        getValues: () => sliceColumns(rangeRows(startRow, numRows, rows)),
        getFormulas: () => sliceColumns(rangeRows(
          startRow,
          numRows,
          formulaRows
        ).map((row, index) => startRow + index === 8 ? Array(headers.length).fill('') : row))
      };
    },
    ...sheetOverrides
  };
}

function clientHarness(records) {
  const ids = [
    'refreshButton', 'resetButton', 'message', 'modeBadge', 'updatedAt',
    'sourceSummary', 'sourceCards', 'sourceFilter', 'schoolYearFilter',
    'regionFilter', 'sectorFilter', 'providerFilter', 'workshopFilter',
    'statusGroupFilter', 'schoolFilter', 'typeFilter', 'dateBasis',
    'dateFromRange', 'dateToRange', 'dateFromValue', 'dateToValue',
    'includeUnknownDate', 'studentsFromRange', 'studentsToRange',
    'studentsFromValue', 'studentsToValue', 'includeUnknownStudents',
    'resultCount', 'kpis', 'kpiQualityNote', 'comparisonSummary',
    'comparisonRows', 'timelineMetric', 'timelineSubtitle', 'timelineLegend',
    'timelineChart', 'timelineCaption', 'timelineTableHead', 'timelineTableRows',
    'sectorChart', 'sectorTableRows', 'regionChart', 'regionTableRows',
    'statusChart', 'statusTableRows', 'workshopChart', 'workshopTableRows',
    'providerChart', 'providerTableRows', 'poChart', 'poTableRows',
    'voChart', 'voTableRows', 'recentRows', 'recentDateHeading'
  ];
  const selectIds = new Set([
    'sourceFilter', 'schoolYearFilter', 'regionFilter', 'sectorFilter',
    'providerFilter', 'workshopFilter', 'statusGroupFilter', 'schoolFilter',
    'typeFilter', 'dateBasis', 'timelineMetric'
  ]);

  function element(tagName = 'div', isSelect = false) {
    const listeners = {};
    const classNames = new Set();
    const attributes = {};
    return {
      tagName: tagName.toUpperCase(),
      value: '',
      checked: false,
      min: '',
      max: '',
      textContent: '',
      className: '',
      hidden: false,
      disabled: false,
      style: {},
      children: [],
      options: isSelect ? [{ value: '', textContent: '' }] : [],
      classList: {
        add: (...names) => names.forEach(name => classNames.add(name)),
        remove: (...names) => names.forEach(name => classNames.delete(name))
      },
      setAttribute(name, value) { attributes[name] = String(value); },
      getAttribute(name) { return attributes[name]; },
      addEventListener(type, handler) { listeners[type] = handler; },
      trigger(type) { if (listeners[type]) listeners[type](); },
      appendChild(child) {
        this.children.push(child);
        if (isSelect && child.tagName === 'OPTION') this.options.push(child);
        return child;
      },
      append(...children) { children.forEach(child => this.appendChild(child)); },
      replaceChildren(...children) { this.children = children; },
      remove(index) { if (isSelect) this.options.splice(index, 1); }
    };
  }

  const elements = Object.fromEntries(ids.map(id => [id, element('div', selectIds.has(id))]));
  elements.dateBasis.value = 'scheduledDate';
  elements.includeUnknownDate.checked = true;
  elements.includeUnknownStudents.checked = true;
  const document = {
    getElementById: id => elements[id],
    createElement: tagName => element(tagName, tagName === 'select')
  };
  const client = fs.readFileSync('src/Client.html', 'utf8')
    .replace(/^<script>\s*|\s*<\/script>\s*$/g, '');
  vm.runInNewContext(client, {
    Date,
    Intl,
    Map,
    Set,
    console: silentConsole,
    document,
    window: {
      __DEMO_PAYLOAD__: {
        mode: 'demo',
        generatedAt: '2026-10-17T00:00:00.000Z',
        complete: true,
        sources: [],
        records
      }
    }
  });
  return elements;
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

test('alle stap-4-filters blijven gelabelde native selects voor toetsenbordbediening', () => {
  const index = fs.readFileSync('src/Index.html', 'utf8');
  const filterIds = [
    'sourceFilter', 'schoolYearFilter', 'regionFilter', 'sectorFilter',
    'providerFilter', 'workshopFilter', 'statusGroupFilter', 'schoolFilter',
    'typeFilter'
  ];

  filterIds.forEach(id => {
    assert.match(index, new RegExp('<label>[\\s\\S]*?<select id="' + id + '"[\\s\\S]*?</select>[\\s\\S]*?</label>'));
  });
  assert.equal((index.match(/<select id="[^"]+Filter"/g) || []).length, filterIds.length);
  assert.doesNotMatch(index, /tabindex\s*=\s*["']-1["']/i);
});

test('bereikfilters gebruiken gelabelde native invoervelden en leesbare outputs', () => {
  const index = fs.readFileSync('src/Index.html', 'utf8');
  for (const id of ['dateFromRange', 'dateToRange', 'studentsFromRange', 'studentsToRange']) {
    assert.match(index, new RegExp('<label for="' + id + '">[\\s\\S]*?</label>[\\s\\S]*?<input id="' + id + '" type="range"'));
    assert.match(index, new RegExp('<output id="[^"]+"[^>]+for="' + id + '"'));
  }
  for (const id of ['includeUnknownDate', 'includeUnknownStudents']) {
    assert.match(index, new RegExp('<label class="check-label">[\\s\\S]*?<input id="' + id + '" type="checkbox" checked>[\\s\\S]*?</label>'));
  }
  assert.match(index, /<fieldset class="range-card">/);
  assert.match(index, /<legend>Periode<\/legend>/);
  assert.match(index, /<legend>Aantal leerlingen<\/legend>/);
});

test('stichtingsvergelijking gebruikt een toegankelijke tabel met alle stap-6-cijfers', () => {
  const index = fs.readFileSync('src/Index.html', 'utf8');
  assert.match(index, /id="kpisTitle"/);
  assert.match(index, /id="kpiQualityNote"[^>]+aria-live="polite"/);
  assert.match(index, /<table class="comparison-table">/);
  assert.match(index, /<caption class="visually-hidden">Vergelijking van de actieve kerncijfers per stichting<\/caption>/);
  for (const heading of [
    'Stichting', 'Aanvragen', 'Leerlingdeelnames', 'Scholen', 'Lesmomenten',
    'Uitgevoerd', 'Gem. leerlingen', 'Aanvragen / school', 'Zonder leerlingaantal'
  ]) {
    assert.match(index, new RegExp('<th scope="col">' + heading.replace('/', '\\/') + '<\\/th>'));
  }
});

test('iedere stap-7-grafiek heeft een leesbare tabelweergave zonder externe grafiekbibliotheek', () => {
  const index = fs.readFileSync('src/Index.html', 'utf8');
  const styles = fs.readFileSync('src/Styles.html', 'utf8');
  assert.match(index, /<select id="timelineMetric">[\s\S]*?Aanvragen \/ workshops[\s\S]*?Leerlingdeelnames[\s\S]*?Lesmomenten/);
  assert.match(index, /id="timelineTableHead"/);
  assert.match(index, /id="timelineTableRows"/);

  for (const id of [
    'sectorTableRows', 'regionTableRows', 'statusTableRows', 'workshopTableRows',
    'providerTableRows', 'poTableRows', 'voTableRows'
  ]) {
    assert.match(index, new RegExp('<tbody id="' + id + '">'));
  }
  assert.equal((index.match(/<details class="chart-data">/g) || []).length, 8);
  assert.doesNotMatch(index, /<script[^>]+src=/i);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test('demo blijft werken en de browser ontvangt alleen de veilige stap-7-velden', () => {
  const payload = context().getDashboardData();
  assert.equal(payload.mode, 'demo');
  assert.equal(payload.complete, true);
  assert.equal(payload.records.length, 10);
  assert.deepEqual(JSON.parse(JSON.stringify(payload.sources.map(source => [source.name, source.status, source.recordCount]))), [
    ['Stichting A', 'demo', 5],
    ['Stichting B', 'demo', 5]
  ]);
  assert.deepEqual([...new Set(payload.records.map(record => record.source))].sort(), ['Stichting A', 'Stichting B']);
  assert.equal(payload.records.filter(record => !record.scheduledDate).length, 1);
  assert.equal(payload.records.filter(record => record.scheduledDates.length > 1).length, 1);
  assert.equal(payload.records.filter(record => record.students === null).length, 1);
  assert.deepEqual(Object.keys(payload.records[0]).sort(), [
    'grades', 'provider', 'region', 'requestedDate', 'scheduledDate', 'scheduledDates',
    'school', 'schoolYear', 'sector', 'sessions', 'source', 'status', 'statusGroup',
    'students', 'type', 'workshop'
  ]);
  assert.deepEqual(Array.from(payload.records[0].grades), [7, 8]);
});

test('demodata levert de gedocumenteerde stap-6-kerncijfers op', () => {
  const payload = JSON.parse(JSON.stringify(context().getDashboardData()));
  const elements = clientHarness(payload.records);
  const kpis = Object.fromEntries(elements.kpis.children.map(card => [
    card.children[0].textContent,
    card.children[1].textContent
  ]));

  assert.deepEqual(kpis, {
    'Aanvragen / workshops': '10',
    'Leerlingdeelnames': '204',
    'Scholen': '10',
    'Lesmomenten': '22',
    'Uitgevoerd': '4',
    'Gem. leerlingen / aanvraag': '22,7',
    'Aanvragen / school': '1,0'
  });
  assert.deepEqual(elements.comparisonRows.children.map(row =>
    row.children.map(cell => cell.textContent)
  ), [
    ['Stichting A', '5', '105', '5', '11', '2', '21,0', '1,0', '0'],
    ['Stichting B', '5', '99', '5', '11', '2', '24,8', '1,0', '1']
  ]);
});

test('demodata levert alle stap-7-verdelingen en gewogen leerjaren op', () => {
  const payload = JSON.parse(JSON.stringify(context().getDashboardData()));
  const elements = clientHarness(payload.records);
  const rows = id => elements[id].children.map(row => row.children.map(cell => cell.textContent));

  assert.deepEqual(rows('sectorTableRows'), [['PO', '8'], ['VO', '2']]);
  assert.deepEqual(rows('statusTableRows'), [
    ['Ingepland', '4'], ['Uitgevoerd', '4'], ['Open', '2']
  ]);
  assert.deepEqual(rows('poTableRows'), [
    ['Groep 3', '0,5'], ['Groep 4', '0,5'], ['Groep 5', '1'],
    ['Groep 6', '3,5'], ['Groep 7', '1,5'], ['Groep 8', '1']
  ]);
  assert.deepEqual(rows('voTableRows'), [['Leerjaar 1', '1'], ['Leerjaar 2', '1']]);
  assert.equal(elements.timelineCaption.textContent, 'Aanvragen / workshops per maand en stichting');
  assert.deepEqual(rows('timelineTableRows'), [
    ['september 2026', '2,5', '3', '5,5'],
    ['oktober 2026', '1,5', '2', '3,5']
  ]);
  assert.match(elements.timelineSubtitle.textContent, /evenredig over de zichtbare lesmaanden/);
  assert.match(elements.timelineSubtitle.textContent, /1 aanvraag zonder geldige datum/);
});

test('maandgrafiek verdeelt meerdere lesdagen en wisselt tussen alle drie metrieken', () => {
  const elements = clientHarness([
    {
      source: 'Stichting A', requestedDate: '2026-08-01',
      scheduledDate: '2026-09-10', scheduledDates: ['2026-09-10', '2026-10-10'],
      students: 20, sessions: 2, sector: 'PO', grades: [5, 6],
      workshop: 'A', statusGroup: 'Ingepland'
    },
    {
      source: 'Stichting B', requestedDate: '2026-08-02',
      scheduledDate: '2026-09-20', scheduledDates: ['2026-09-20'],
      students: 10, sessions: 1, sector: 'VO', grades: [1],
      workshop: 'B', statusGroup: 'Open'
    }
  ]);
  const timelineRows = () => elements.timelineTableRows.children.map(row =>
    row.children.map(cell => cell.textContent)
  );

  assert.deepEqual(timelineRows(), [
    ['september 2026', '0,5', '1', '1,5'],
    ['oktober 2026', '0,5', '0', '0,5']
  ]);

  elements.timelineMetric.value = 'students';
  elements.timelineMetric.trigger('change');
  assert.deepEqual(timelineRows(), [
    ['september 2026', '10', '10', '20'],
    ['oktober 2026', '10', '0', '10']
  ]);

  elements.timelineMetric.value = 'sessions';
  elements.timelineMetric.trigger('change');
  assert.deepEqual(timelineRows(), [
    ['september 2026', '1', '1', '2'],
    ['oktober 2026', '1', '0', '1']
  ]);

  elements.dateFromRange.value = 1;
  elements.dateFromRange.trigger('input');
  assert.deepEqual(timelineRows(), [['oktober 2026', '2', '2']]);
});

test('onbekende leerjaren blijven apart en combinatiegroepen behouden samen één aanvraag', () => {
  const elements = clientHarness([
    { source: 'A', sector: 'PO', grades: [3, 4, 5], workshop: 'A' },
    { source: 'A', sector: 'PO', grades: [], workshop: 'B' },
    { source: 'A', sector: 'PO', grades: [9], workshop: 'C' },
    { source: 'A', sector: 'VO', grades: [1, 2], workshop: 'D' },
    { source: 'A', sector: 'Onbekend', grades: [1], workshop: 'E' }
  ]);
  const rows = id => elements[id].children.map(row => row.children.map(cell => cell.textContent));

  assert.deepEqual(rows('poTableRows'), [
    ['Groep 3', '0,33'], ['Groep 4', '0,33'], ['Groep 5', '0,33'], ['Onbekend', '2']
  ]);
  assert.deepEqual(rows('voTableRows'), [
    ['Leerjaar 1', '0,5'], ['Leerjaar 2', '0,5']
  ]);
});

test('een lege selectie geeft nette lege grafiek- en tabelstaten', () => {
  const elements = clientHarness([
    {
      source: 'Stichting A', scheduledDate: '2026-09-01',
      scheduledDates: ['2026-09-01'], sector: 'PO', grades: [6],
      region: 'Regio', provider: 'Maker', workshop: 'Workshop', statusGroup: 'Open'
    }
  ]);
  elements.sourceFilter.value = 'Niet aanwezig';
  elements.sourceFilter.trigger('change');

  assert.equal(elements.timelineChart.children[0].textContent, 'Geen gedateerde gegevens voor deze metriek binnen de filters.');
  assert.equal(elements.timelineTableRows.children[0].children[0].textContent, 'Geen gedateerde gegevens binnen deze filters.');
  assert.equal(elements.sectorChart.children[0].textContent, 'Geen gegevens binnen deze filters.');
  assert.equal(elements.sectorTableRows.children[0].children[0].textContent, 'Geen gegevens binnen deze filters.');
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
  assert.deepEqual(Array.from(record.scheduledDates), ['2026-11-20']);
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

test('definitieve datum ondersteunt meerdere unieke lesdagen in één cel', () => {
  const ctx = context();
  assert.deepEqual(Array.from(ctx.dateValues_(
    '27/11/2026, 20-11-2026\n2026-12-04; 20-11-2026'
  )), ['2026-11-20', '2026-11-27', '2026-12-04']);

  const result = normalize([headers, row({
    'Definitieve datum': '27/11/2026, 20-11-2026 en 2026-12-04'
  })]);
  assert.equal(result.records[0].scheduledDate, '2026-11-20');
  assert.deepEqual(Array.from(result.records[0].scheduledDates), [
    '2026-11-20', '2026-11-27', '2026-12-04'
  ]);
  assert.equal(result.warnings.invalidScheduledDates, 0);

  const partlyInvalid = normalize([headers, row({
    'Definitieve datum': '31-02-2026 en 07-03-2026'
  })]);
  assert.deepEqual(Array.from(partlyInvalid.records[0].scheduledDates), ['2026-03-07']);
  assert.equal(partlyInvalid.warnings.invalidScheduledDates, 1);
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

test('filtervelden verlaten gecontroleerd de server maar privacyvelden niet', () => {
  const internal = { ...normalize().records[0], laterToegevoegdGeheim: 'nieuw-geheim' };
  const publicRecord = context().publicRecord_(internal);
  const json = JSON.stringify(publicRecord);

  assert.deepEqual(Object.keys(publicRecord), [
    'source', 'requestedDate', 'scheduledDate', 'scheduledDates', 'schoolYear',
    'school', 'workshop', 'provider', 'region', 'sector', 'grades', 'status',
    'statusGroup', 'type', 'sessions', 'students'
  ]);
  assert.equal(publicRecord.requestedDate, '2026-10-14');
  assert.equal(publicRecord.scheduledDate, '2026-11-20');
  assert.deepEqual(Array.from(publicRecord.scheduledDates), ['2026-11-20']);
  assert.equal(publicRecord.schoolYear, '2026–2027');
  assert.equal(publicRecord.school, 'School A');
  assert.deepEqual(Array.from(publicRecord.grades), [6, 7, 8]);
  assert.equal(publicRecord.statusGroup, 'Ingepland');
  assert.equal(publicRecord.type, 'Workshop');

  for (const privateValue of [
    'REQ-001', 'Privé Persoon', 'private@example.test', '0612345678',
    'Technieklokaal', 'secret-draft-id', 'secret-calendar-id', 'secret-source-id',
    'Niet naar de browser sturen', 'private-debug', '485.5', '650', '164.5', 'nieuw-geheim'
  ]) {
    assert.ok(!json.includes(privateValue), privateValue);
  }
});

test('alle negen dropdownfilters worden uit de records opgebouwd en gecombineerd', () => {
  const records = [
    {
      source: 'Stichting A', schoolYear: '2026–2027', region: 'Ameide', sector: 'PO',
      provider: 'Maker A', workshop: '3D ontwerpen', statusGroup: 'Ingepland',
      school: 'School A', type: 'Workshop', status: 'Akkoord', date: '2026-10-10',
      sessions: 2, students: 24
    },
    {
      source: 'Stichting A', schoolYear: '2025–2026', region: 'Utrecht', sector: 'VO',
      provider: 'Maker B', workshop: 'Robotica', statusGroup: 'Open',
      school: 'School B', type: 'Training', status: 'Nieuw', date: '2026-05-10',
      sessions: 1, students: 18
    },
    {
      source: 'Stichting B', schoolYear: '2026–2027', region: 'Ameide', sector: 'PO',
      provider: 'Maker A', workshop: '3D ontwerpen', statusGroup: 'Uitgevoerd',
      school: 'School C', type: 'Workshop', status: 'Uitgevoerd', date: '2026-09-10',
      sessions: 3, students: 30
    }
  ];
  const elements = clientHarness(records);
  const selections = {
    sourceFilter: 'Stichting A',
    schoolYearFilter: '2026–2027',
    regionFilter: 'Ameide',
    sectorFilter: 'PO',
    providerFilter: 'Maker A',
    workshopFilter: '3D ontwerpen',
    statusGroupFilter: 'Ingepland',
    schoolFilter: 'School A',
    typeFilter: 'Workshop'
  };

  for (const [id, value] of Object.entries(selections)) {
    assert.ok(elements[id].options.some(option => option.value === value), id + ': ' + value);
    elements[id].value = value;
  }
  elements.typeFilter.trigger('change');
  assert.equal(elements.resultCount.textContent, '1 van 3 workshops zichtbaar');

  elements.typeFilter.value = 'Training';
  elements.typeFilter.trigger('change');
  assert.equal(elements.resultCount.textContent, '0 van 3 workshops zichtbaar');

  elements.resetButton.trigger('click');
  assert.equal(elements.resultCount.textContent, '3 van 3 workshops zichtbaar');
  assert.ok(Object.keys(selections).every(id => elements[id].value === ''));
});

test('schooljaren staan met het nieuwste jaar bovenaan', () => {
  const elements = clientHarness([
    { schoolYear: '2025–2026' },
    { schoolYear: '2027–2028' },
    { schoolYear: '2026–2027' }
  ]);
  assert.deepEqual(elements.schoolYearFilter.options.slice(1).map(option => option.value), [
    '2027–2028', '2026–2027', '2025–2026'
  ]);
});

test('maand- en leerlingbereik filteren inclusief en reageren direct', () => {
  const records = [
    { requestedDate: '2026-01-15', scheduledDate: '2026-03-01', students: 10, workshop: 'A' },
    { requestedDate: '2026-02-01', scheduledDate: '2026-04-30', students: 20, workshop: 'B' },
    { requestedDate: '2026-03-31', scheduledDate: '2026-05-01', students: 30, workshop: 'C' },
    { requestedDate: '', scheduledDate: '', students: null, workshop: 'Onbekend' }
  ];
  const elements = clientHarness(records);

  assert.equal(elements.resultCount.textContent, '4 van 4 workshops zichtbaar');
  assert.equal(elements.dateFromValue.textContent, 'maart 2026');
  assert.equal(elements.dateToValue.textContent, 'mei 2026');
  assert.equal(elements.dateFromRange.getAttribute('aria-valuetext'), 'maart 2026');
  assert.equal(elements.studentsToRange.getAttribute('aria-valuetext'), '30 leerlingen');

  elements.dateFromRange.value = 1;
  elements.dateFromRange.trigger('input');
  elements.dateToRange.value = 1;
  elements.dateToRange.trigger('input');
  elements.includeUnknownDate.checked = false;
  elements.includeUnknownDate.trigger('change');
  assert.equal(elements.resultCount.textContent, '1 van 4 workshops zichtbaar');

  elements.studentsFromRange.value = 20;
  elements.studentsFromRange.trigger('input');
  elements.studentsToRange.value = 20;
  elements.studentsToRange.trigger('input');
  assert.equal(elements.resultCount.textContent, '1 van 4 workshops zichtbaar');
});

test('een workshop matcht wanneer minstens één definitieve lesdag binnen de periode valt', () => {
  const elements = clientHarness([
    {
      requestedDate: '2026-01-10', scheduledDate: '2026-03-01',
      scheduledDates: ['2026-03-01', '2026-05-20'], students: 10,
      source: 'Stichting A', workshop: 'Meerdere lessen', status: 'Ingepland'
    },
    {
      requestedDate: '2026-02-10', scheduledDate: '2026-04-15',
      scheduledDates: ['2026-04-15'], students: 20,
      source: 'Stichting B', workshop: 'Eén les', status: 'Ingepland'
    },
    {
      requestedDate: '2026-03-10', scheduledDate: '', scheduledDates: [], students: 30,
      source: 'Stichting B', workshop: 'Nog onbekend', status: 'Open'
    }
  ]);

  elements.dateFromRange.value = 2;
  elements.dateFromRange.trigger('input');
  elements.includeUnknownDate.checked = false;
  elements.includeUnknownDate.trigger('change');
  assert.equal(elements.resultCount.textContent, '1 van 3 workshops zichtbaar');
  assert.equal(elements.recentRows.children[0].children[0].textContent, '1-3-2026 · 20-5-2026');

  elements.dateFromRange.value = 1;
  elements.dateFromRange.trigger('input');
  elements.dateToRange.value = 1;
  elements.dateToRange.trigger('input');
  assert.equal(elements.resultCount.textContent, '1 van 3 workshops zichtbaar');
  assert.equal(elements.recentRows.children[0].children[2].textContent, 'Eén les');
});

test('datumsoort, onbekende waarden en Filters wissen blijven voorspelbaar', () => {
  const records = [
    { requestedDate: '2026-01-15', scheduledDate: '2026-03-01', students: 10, workshop: 'A' },
    { requestedDate: '2026-02-01', scheduledDate: '2026-04-30', students: 20, workshop: 'B' },
    { requestedDate: '2026-03-31', scheduledDate: '2026-05-01', students: 30, workshop: 'C' },
    { requestedDate: '', scheduledDate: '', students: null, workshop: 'Onbekend' }
  ];
  const elements = clientHarness(records);

  elements.includeUnknownDate.checked = false;
  elements.includeUnknownDate.trigger('change');
  assert.equal(elements.resultCount.textContent, '3 van 4 workshops zichtbaar');
  elements.includeUnknownDate.checked = true;
  elements.includeUnknownDate.trigger('change');
  elements.includeUnknownStudents.checked = false;
  elements.includeUnknownStudents.trigger('change');
  assert.equal(elements.resultCount.textContent, '3 van 4 workshops zichtbaar');

  elements.dateBasis.value = 'requestedDate';
  elements.dateBasis.trigger('change');
  assert.equal(elements.recentDateHeading.textContent, 'Datum aanvraag');
  assert.equal(elements.dateFromValue.textContent, 'januari 2026');
  assert.equal(elements.dateToValue.textContent, 'maart 2026');

  elements.dateToRange.value = 0;
  elements.dateToRange.trigger('input');
  elements.dateFromRange.value = 2;
  elements.dateFromRange.trigger('input');
  assert.equal(Number(elements.dateToRange.value), 2);
  elements.dateToRange.value = 0;
  elements.dateToRange.trigger('input');
  assert.equal(Number(elements.dateFromRange.value), 0);

  elements.studentsToRange.value = 10;
  elements.studentsToRange.trigger('input');
  elements.studentsFromRange.value = 30;
  elements.studentsFromRange.trigger('input');
  assert.equal(Number(elements.studentsToRange.value), 30);

  elements.resetButton.trigger('click');
  assert.equal(elements.dateBasis.value, 'scheduledDate');
  assert.equal(elements.includeUnknownDate.checked, true);
  assert.equal(elements.includeUnknownStudents.checked, true);
  assert.equal(elements.resultCount.textContent, '4 van 4 workshops zichtbaar');
});

test('stap-6-kerncijfers en stichtingvergelijking gebruiken exact dezelfde filters', () => {
  const records = [
    {
      source: 'Stichting A', region: 'Noord', school: 'School Eén', students: 20,
      sessions: 2, statusGroup: 'Uitgevoerd', scheduledDate: '2026-09-01',
      scheduledDates: ['2026-09-01'], workshop: 'A', status: 'Uitgevoerd'
    },
    {
      source: 'Stichting A', region: ' noord ', school: '  SCHOOL ÉÉN ', students: null,
      sessions: 1, statusGroup: 'Open', scheduledDate: '2026-09-02',
      scheduledDates: ['2026-09-02'], workshop: 'B', status: 'Open'
    },
    {
      source: 'Stichting A', region: 'Zuid', school: 'School Eén', students: 30,
      sessions: 3, statusGroup: 'Uitgevoerd', scheduledDate: '2026-09-03',
      scheduledDates: ['2026-09-03'], workshop: 'C', status: 'Uitgevoerd'
    },
    {
      source: 'Stichting B', region: 'Noord', school: 'School Eén', students: 10,
      sessions: 1, statusGroup: 'Uitgevoerd', scheduledDate: '2026-09-04',
      scheduledDates: ['2026-09-04'], workshop: 'D', status: 'Uitgevoerd'
    },
    {
      source: 'Stichting B', region: 'Noord', school: 'Onbekende school', students: 0,
      sessions: null, statusGroup: 'Open', scheduledDate: '2026-09-05',
      scheduledDates: ['2026-09-05'], workshop: 'E', status: 'Open'
    }
  ];
  const elements = clientHarness(records);
  const kpis = () => Object.fromEntries(elements.kpis.children.map(card => [
    card.children[0].textContent,
    card.children[1].textContent
  ]));
  const rows = () => elements.comparisonRows.children.map(row =>
    row.children.map(cell => cell.textContent)
  );

  assert.deepEqual(kpis(), {
    'Aanvragen / workshops': '5',
    'Leerlingdeelnames': '60',
    'Scholen': '3',
    'Lesmomenten': '7',
    'Uitgevoerd': '3',
    'Gem. leerlingen / aanvraag': '15,0',
    'Aanvragen / school': '1,3'
  });
  assert.equal(
    elements.kpiQualityNote.textContent,
    '1 aanvraag heeft geen bekend leerlingaantal. Gemiddelden gebruiken alleen bekende aantallen.'
  );
  assert.deepEqual(rows(), [
    ['Stichting A', '3', '50', '2', '6', '2', '25,0', '1,5', '1'],
    ['Stichting B', '2', '10', '1', '1', '1', '5,0', '1,0', '0']
  ]);

  elements.sourceFilter.value = 'Stichting B';
  elements.sourceFilter.trigger('change');
  assert.equal(kpis()['Aanvragen / workshops'], '2');
  assert.equal(kpis()['Leerlingdeelnames'], '10');
  assert.equal(kpis()['Gem. leerlingen / aanvraag'], '5,0');
  assert.equal(elements.comparisonSummary.textContent, '2 zichtbare aanvragen');
  assert.deepEqual(rows(), [
    ['Stichting A', '0', '0', '0', '0', '0', '—', '—', '0'],
    ['Stichting B', '2', '10', '1', '1', '1', '5,0', '1,0', '0']
  ]);
});

test('Google Sheet wordt vanaf de ingestelde kopregel gelezen', () => {
  let requestedRange;
  const sheet = googleSheet([row(), row({ 'Aanvraag ID': 'REQ-002' })], {
    onGetRange: (...args) => {
      if (args[0] === 8 && args[2] > 1 && args[3] === headers.length) requestedRange = args;
    }
  });
  const ctx = context({ SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) } });
  const result = ctx.readGoogleSheet_({ name: 'Stichting A', spreadsheetId: 'test', sheetName: 'Workshops', headerRow: 8 });
  assert.deepEqual(requestedRange, [8, 1, 3, headers.length]);
  assert.equal(result.records.length, 2);
  assert.equal(result.warnings.duplicateRequestIds, 0);
});

test('Google Sheet respecteert de rijlimiet en meldt overgeslagen rijen', () => {
  let requestedRange;
  const sheet = googleSheet([row(), row(), row()], {
    onGetRange: (...args) => {
      if (args[0] === 8 && args[2] > 1 && args[3] === headers.length) requestedRange = args;
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

test('formule-only rijen worden niet geladen of als workshop en waarschuwing geteld', () => {
  const blank = () => Array(headers.length).fill('');
  const formulaOnlyRow = status => {
    const values = blank();
    values[headers.indexOf('Status')] = status;
    return values;
  };
  const formulaOnlyCells = () => {
    const formulas = blank();
    formulas[headers.indexOf('Status')] = '=IF(A2="";"Open";"Uitgevoerd")';
    return formulas;
  };
  const dataRows = [
    row({ 'Aanvraag ID': 'REQ-001' }),
    formulaOnlyRow('Open'),
    row({ 'Aanvraag ID': 'REQ-002' }),
    formulaOnlyRow('Open'),
    formulaOnlyRow('Open')
  ];
  const formulaRows = [blank(), formulaOnlyCells(), blank(), formulaOnlyCells(), formulaOnlyCells()];
  let wideRange;
  const sheet = googleSheet(dataRows, {
    formulaRows,
    onGetRange: (...args) => {
      if (args[0] === 8 && args[2] > 1 && args[3] === headers.length) wideRange = args;
    }
  });
  const ctx = context({ SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) } });
  const result = ctx.readGoogleSheet_({
    name: 'Stichting A', spreadsheetId: 'test', sheetName: 'Workshops', headerRow: 8
  });

  assert.deepEqual(wideRange, [8, 1, 4, headers.length]);
  assert.deepEqual(Array.from(result.records, record => record.requestId), ['REQ-001', 'REQ-002']);
  assert.equal(result.warnings.emptyRows, 0);
  assert.equal(result.warnings.rowsTruncated, 0);
});

test('formule-only tussenrijen verbruiken de ingestelde rijlimiet niet', () => {
  const blank = () => Array(headers.length).fill('');
  const formulaValues = blank();
  formulaValues[headers.indexOf('Status')] = 'Open';
  const formulaCells = blank();
  formulaCells[headers.indexOf('Status')] = '=IF(A2="";"Open";"Uitgevoerd")';
  const rows = [
    row({ 'Aanvraag ID': 'REQ-001' }),
    formulaValues,
    row({ 'Aanvraag ID': 'REQ-002' }),
    formulaValues,
    row({ 'Aanvraag ID': 'REQ-003' })
  ];
  const sheet = googleSheet(rows, {
    formulaRows: [blank(), formulaCells, blank(), formulaCells, blank()]
  });
  const ctx = liveContext({
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) }
  }, { maxRows: 2 });
  const result = ctx.readGoogleSheet_({
    name: 'Stichting A', spreadsheetId: 'source-a-id', sheetName: 'Workshops', headerRow: 8
  });

  assert.deepEqual(Array.from(result.records, record => record.requestId), ['REQ-001', 'REQ-002']);
  assert.equal(result.warnings.rowsTruncated, 1);
  assert.equal(result.warnings.emptyRows, 0);
});

test('een echte waarde naast formules houdt de workshoprij wel in de bron', () => {
  const formulaRow = Array(headers.length).fill('');
  formulaRow[headers.indexOf('Status')] = '=IF(A2="";"Open";"Uitgevoerd")';
  const sheet = googleSheet([row()], { formulaRows: [formulaRow] });
  const ctx = context({ SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) } });
  const result = ctx.readGoogleSheet_({
    name: 'Stichting A', spreadsheetId: 'test', sheetName: 'Workshops', headerRow: 8
  });

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].requestId, 'REQ-001');
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
  assert.equal(payload.sources[1].message, 'Controleer de tabbladnaam en of dit account toegang heeft.');
  assert.equal(payload.sources[1].errorCode, 'SOURCE_READ_FAILED');
  assert.equal(payload.sources[1].errorReference, '12345678');
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
    errorCode: 'SOURCE_READ_FAILED',
    errorReference: 'VEILIG123',
    spreadsheetId: 'geheim-sheet-id',
    providerError: 'Google provider detail'
  });
  const json = JSON.stringify(source);

  assert.ok(!json.includes('internGeheim'));
  assert.ok(!json.includes('geheim-sheet-id'));
  assert.ok(!json.includes('Google provider detail'));
  assert.match(json, /SOURCE_READ_FAILED/);
  assert.match(json, /VEILIG123/);
});

test('ongelijke serverbestandsversies geven een veilige diagnose en serverlog', () => {
  const logs = [];
  const ctx = liveContext({
    console: { log() {}, error: message => logs.push(message) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => googleSheet([row()]) }) }
  });
  ctx.readConfiguredSheets_ = () => [];

  assert.throws(
    () => ctx.getDashboardData(),
    /serverbestanden zijn niet van dezelfde versie.*DATA_FILES_OUT_OF_SYNC.*12345678/
  );
  assert.equal(logs.length, 1);
  assert.match(logs[0], /\[12345678\] getDashboardData/);
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
  assert.match(client, /replace\(\/\^Error:/);
});

test('manifest draait als bezoeker en vraagt alleen de benodigde identiteitsscope', () => {
  const manifest = JSON.parse(fs.readFileSync('src/appsscript.json', 'utf8'));
  assert.equal(manifest.webapp.executeAs, 'USER_ACCESSING');
  assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/userinfo.email'));
});
