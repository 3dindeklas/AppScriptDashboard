const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');
const silentConsole = { log() {}, error() {} };

function testBlob(value) {
  const bytes = Buffer.isBuffer(value)
    ? value
    : Array.isArray(value)
      ? Buffer.from(value.map(byte => byte < 0 ? byte + 256 : byte))
      : Buffer.from(String(value));
  return {
    getBytes: () => Array.from(bytes, byte => byte > 127 ? byte - 256 : byte),
    getDataAsString: () => bytes.toString('utf8')
  };
}

function testUtilities() {
  return {
    formatDate: date => date.toISOString().slice(0, 10),
    getUuid: () => '12345678-abcd-4321-abcd-1234567890ab',
    newBlob: value => testBlob(value),
    gzip: blob => testBlob(zlib.gzipSync(Buffer.from(blob.getBytes().map(byte => byte < 0 ? byte + 256 : byte)))),
    ungzip: blob => testBlob(zlib.gunzipSync(Buffer.from(blob.getBytes().map(byte => byte < 0 ? byte + 256 : byte)))),
    base64Encode: bytes => Buffer.from(bytes.map(byte => byte < 0 ? byte + 256 : byte)).toString('base64'),
    base64Decode: value => Array.from(Buffer.from(value, 'base64'), byte => byte > 127 ? byte - 256 : byte)
  };
}

function memoryCache() {
  const values = new Map();
  const cache = {
    get: key => values.has(key) ? values.get(key) : null,
    getAll: keys => Object.fromEntries(keys.filter(key => values.has(key)).map(key => [key, values.get(key)])),
    put: (key, value) => values.set(key, value),
    putAll: entries => Object.entries(entries).forEach(entry => values.set(entry[0], entry[1])),
    remove: key => values.delete(key),
    removeAll: keys => keys.forEach(key => values.delete(key))
  };
  return { values, service: { getScriptCache: () => cache } };
}

function immediateLockService() {
  return {
    getScriptLock: () => ({
      tryLock: () => true,
      releaseLock() {}
    })
  };
}

function session(email = 'jouw-account@voorbeeld.nl') {
  return {
    getScriptTimeZone: () => 'Europe/Amsterdam',
    getActiveUser: () => ({ getEmail: () => email }),
    getEffectiveUser: () => ({ getEmail: () => email })
  };
}

function context(extra = {}, configTransform = source => source) {
  const ctx = vm.createContext({
    Date,
    console: silentConsole,
    Utilities: testUtilities(),
    Session: session(),
    ...extra
  });

  for (const file of ['Config.gs', 'Data.gs', 'Cache.gs', 'Auth.gs', 'Code.gs']) {
    const source = fs.readFileSync('src/' + file, 'utf8');
    vm.runInContext(file === 'Config.gs' ? configTransform(source) : source, ctx);
  }
  return ctx;
}

function liveContext(extra = {}, options = {}) {
  const ids = options.ids || ['source-a-id', 'source-b-id'];
  const maxRows = options.maxRows || 5000;
  const finishTransform = options.configTransform || (source => source);
  return context(extra, source => {
    let sourceIndex = 0;
    return finishTransform(source
      .replace('demoMode: true', 'demoMode: false')
      .replace('maxRowsPerSource: 5000', 'maxRowsPerSource: ' + maxRows)
      .replace(/spreadsheetId: ''/g, () => "spreadsheetId: '" + (ids[sourceIndex++] || '') + "'"));
  });
}

function withFinancialEmails(emails) {
  return source => source.replace(
    /  financialAllowedEmails:\s*\[[\s\S]*?\n  \],/,
    '  financialAllowedEmails: [\n' + emails.map(email => "    '" + email + "'").join(',\n') + '\n  ],'
  );
}

function googleSheet(rows, overrides = {}) {
  const formulaRows = overrides.formulaRows || rows.map(() => Array(headers.length).fill(''));
  const onGetRange = overrides.onGetRange || (() => {});
  const onGetValues = overrides.onGetValues || (() => {});
  const onGetFormulas = overrides.onGetFormulas || (() => {});
  const sheetOverrides = { ...overrides };
  delete sheetOverrides.formulaRows;
  delete sheetOverrides.onGetRange;
  delete sheetOverrides.onGetValues;
  delete sheetOverrides.onGetFormulas;

  function rangeRows(startRow, numRows, matrixRows) {
    const allRows = [headers, ...matrixRows];
    const offset = startRow - 8;
    return allRows.slice(offset, offset + numRows);
  }

  return {
    getLastRow: () => 8 + rows.length,
    getLastColumn: () => headers.length,
    getRange: (startRow, startColumn, numRows, numColumns) => {
      const rangeArgs = [startRow, startColumn, numRows, numColumns];
      onGetRange(...rangeArgs);
      const sliceColumns = matrix => matrix.map(row =>
        row.slice(startColumn - 1, startColumn - 1 + numColumns)
      );
      return {
        getValues: () => {
          onGetValues(...rangeArgs);
          return sliceColumns(rangeRows(startRow, numRows, rows));
        },
        getFormulas: () => {
          onGetFormulas(...rangeArgs);
          return sliceColumns(rangeRows(
            startRow,
            numRows,
            formulaRows
          ).map((row, index) => startRow + index === 8 ? Array(headers.length).fill('') : row));
        }
      };
    },
    ...sheetOverrides
  };
}

function clientHarness(records, options = {}) {
  const ids = [
    'dashboard', 'refreshButton', 'printButton', 'resetButton', 'message', 'modeBadge', 'updatedAt',
    'sourceSummary', 'sourceCards', 'sourceFilter', 'schoolYearFilter',
    'regionFilter', 'sectorFilter', 'providerFilter', 'workshopFilter',
    'statusGroupFilter', 'schoolFilter', 'typeFilter', 'dateBasis',
    'dateFromRange', 'dateToRange', 'dateFromValue', 'dateToValue',
    'includeUnknownDate', 'studentsFromRange', 'studentsToRange',
    'studentsFromValue', 'studentsToValue', 'includeUnknownStudents',
    'resultCount', 'kpis', 'kpiQualityNote', 'comparisonSummary',
    'comparisonRows', 'financialOverview', 'financialKpis', 'financialCompleteness', 'financialNote',
    'timelineMetric', 'timelineSubtitle', 'timelineLegend',
    'timelineChart', 'timelineCaption', 'timelineTableHead', 'timelineTableRows',
    'sectorChart', 'sectorTableRows', 'regionChart',
    'statusChart', 'statusTableRows', 'workshopChart', 'workshopTableRows',
    'providerChart', 'providerTableRows', 'poChart', 'poTableRows',
    'voChart', 'voTableRows', 'recentRows', 'recentDateHeading',
    'municipalityData', 'municipalityMap', 'mapScope', 'mapMunicipality', 'mapDetail',
    'mapCoverage', 'mapUnmatched', 'mapLegend', 'mapTableRows',
    'dataUpdatedAt', 'dataOrigin', 'dataDuration', 'dashboardLayout', 'filterSidebar',
    'filterToggle', 'closeFilters', 'activeFilterCount', 'filterSummary', 'schoolYearSwitch',
    'dataMenu', 'dataMenuButton', 'displayMenu', 'displayMenuButton', 'emptyView',
    'financialVisibilityOption', 'analyticsSection', 'showAllPanels', 'closeDataMenu', 'closeDisplayMenu',
    'viewKpis', 'viewTimeline', 'viewGeography', 'viewSector', 'viewStatus', 'viewWorkshops',
    'viewProviders', 'viewGrades', 'viewRecent', 'viewComparison', 'viewFinancial',
    'metricsPanel', 'timelinePanel', 'geographyPanel', 'sectorPanel', 'statusPanel',
    'workshopsPanel', 'providersPanel', 'gradesPanel', 'recentPanel', 'comparisonPanel'
  ];
  const selectIds = new Set([
    'sourceFilter', 'schoolYearFilter', 'regionFilter', 'sectorFilter',
    'providerFilter', 'workshopFilter', 'statusGroupFilter', 'schoolFilter',
    'typeFilter', 'dateBasis', 'timelineMetric', 'mapScope', 'mapMunicipality'
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
      open: false,
      style: {},
      children: [],
      options: isSelect ? [{ value: '', textContent: '' }] : [],
      classList: {
        add: (...names) => names.forEach(name => classNames.add(name)),
        remove: (...names) => names.forEach(name => classNames.delete(name)),
        contains: name => classNames.has(name)
      },
      setAttribute(name, value) { attributes[name] = String(value); },
      getAttribute(name) { return attributes[name]; },
      addEventListener(type, handler) { listeners[type] = handler; },
      trigger(type, event = {}) { if (listeners[type]) listeners[type](event); },
      focus() { this.focused = true; },
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
  elements.mapScope.value = 'workarea';
  ids.filter(id => id.startsWith('view')).forEach(id => { elements[id].checked = true; });
  const documentListeners = {};
  elements.municipalityData.textContent = options.mapAsset === false ? '{}' : fs.readFileSync('src/Municipalities.html', 'utf8')
    .match(/<script[^>]*>([\s\S]*)<\/script>/)[1];
  const document = {
    getElementById: id => elements[id],
    createElement: tagName => element(tagName, tagName === 'select'),
    createElementNS: (namespace, tagName) => element(tagName),
    addEventListener: (type, handler) => { documentListeners[type] = handler; }
  };
  const client = fs.readFileSync('src/Client.html', 'utf8')
    .replace(/^<script>\s*|\s*<\/script>\s*$/g, '');
  let timerId = 0;
  const timers = new Map();
  let successHandler;
  let failureHandler;
  let requestedMethod = '';
  const runner = {
    withSuccessHandler(handler) {
      successHandler = handler;
      return this;
    },
    withFailureHandler(handler) {
      failureHandler = handler;
      return this;
    },
    getDashboardData() { requestedMethod = 'getDashboardData'; },
    refreshDashboardData() { requestedMethod = 'refreshDashboardData'; }
  };
  let printCount = 0;
  const window = options.deferLoad ? { print: () => { printCount += 1; } } : {
    print: () => { printCount += 1; },
    __DEMO_PAYLOAD__: {
      mode: 'demo',
      generatedAt: '2026-10-17T00:00:00.000Z',
      complete: true,
      permissions: { canViewFinancials: options.canViewFinancials !== false },
      sources: [],
      records
    }
  };
  vm.runInNewContext(client, {
    Date,
    Intl,
    Map,
    Set,
    console: silentConsole,
    document,
    window,
    google: options.deferLoad ? { script: { run: runner } } : undefined,
    setTimeout(handler, delay) {
      timerId += 1;
      timers.set(timerId, { handler, delay });
      return timerId;
    },
    clearTimeout(id) { timers.delete(id); }
  });
  elements.__runTimersThrough = delay => {
    [...timers.entries()]
      .filter(entry => entry[1].delay <= delay)
      .sort((a, b) => a[1].delay - b[1].delay)
      .forEach(entry => {
        timers.delete(entry[0]);
        entry[1].handler();
      });
  };
  elements.__printCount = () => printCount;
  elements.__keyDown = key => documentListeners.keydown({ key });
  elements.__resolveLoad = payload => successHandler(payload);
  elements.__rejectLoad = error => failureHandler(error);
  elements.__requestedMethod = () => requestedMethod;
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
  return context().normalizeSheet_(matrix, 'Tech-hub A');
}

test('serverbestanden bevatten geen browser-API\'s', () => {
  for (const file of fs.readdirSync('src').filter(name => name.endsWith('.gs'))) {
    const source = fs.readFileSync('src/' + file, 'utf8');
    assert.doesNotMatch(source, /\b(?:document|window)\b/, file);
  }
});

test('Index gebruikt uitsluitend de officiële include-opzet', () => {
  const index = fs.readFileSync('src/Index.html', 'utf8');
  assert.match(index, /<\?!= include\('Styles', accessToken\); \?>/);
  assert.match(index, /<\?!= include\('Municipalities', accessToken\); \?>/);
  assert.match(index, /<\?!= include\('AccessClient', accessToken\); \?>/);
  assert.match(index, /<\?!= include\('Client', accessToken\); \?>/);
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

test('tech-hubsvergelijking gebruikt een toegankelijke tabel met alle stap-6-cijfers', () => {
  const index = fs.readFileSync('src/Index.html', 'utf8');
  assert.match(index, /id="kpisTitle"/);
  assert.match(index, /id="kpiQualityNote"[^>]+aria-live="polite"/);
  assert.match(index, /<table class="comparison-table">/);
  assert.match(index, /<caption class="visually-hidden">Vergelijking van de actieve kerncijfers per tech-hub<\/caption>/);
  for (const heading of [
    'Tech-hub', 'Aanvragen', 'Leerlingdeelnames', 'Scholen', 'Lesmomenten',
    'Uitgevoerd', 'Gem. leerlingen', 'Aanvragen / school', 'Zonder leerlingaantal'
  ]) {
    assert.match(index, new RegExp('<th scope="col">' + heading.replace('/', '\\/') + '<\\/th>'));
  }
});

test('financieel overzicht staat standaard ingeklapt en benoemt de berekeningsbasis', () => {
  const index = fs.readFileSync('src/Index.html', 'utf8');
  const openingTag = index.match(/<details id="financialOverview"[^>]*>/);

  assert.ok(openingTag);
  assert.doesNotMatch(openingTag[0], /\sopen(?:\s|=|>)/);
  assert.match(openingTag[0], /\shidden(?:\s|=|>)/);
  assert.match(index, /<summary>[\s\S]*?Kosten, facturatie en marge[\s\S]*?<\/summary>/);
  assert.match(index, /id="financialKpis"/);
  assert.match(index, /id="financialCompleteness"/);
  assert.match(index, /id="financialNote"[^>]+aria-live="polite"/);
  assert.match(index, /marge gebruikt alleen financieel complete regels/);
  assert.match(fs.readFileSync('src/Config.gs', 'utf8'), /financialAllowedEmails:\s*\[/);
});

test('iedere stap-7-grafiek heeft een leesbare tabelweergave zonder externe grafiekbibliotheek', () => {
  const index = fs.readFileSync('src/Index.html', 'utf8');
  const styles = fs.readFileSync('src/Styles.html', 'utf8');
  assert.match(index, /<select id="timelineMetric">[\s\S]*?Aanvragen \/ workshops[\s\S]*?Leerlingdeelnames[\s\S]*?Lesmomenten/);
  assert.match(index, /id="timelineTableHead"/);
  assert.match(index, /id="timelineTableRows"/);

  for (const id of [
    'sectorTableRows', 'mapTableRows', 'statusTableRows', 'workshopTableRows',
    'providerTableRows', 'poTableRows', 'voTableRows'
  ]) {
    assert.match(index, new RegExp('<tbody id="' + id + '">'));
  }
  assert.equal((index.match(/<details class="chart-data">/g) || []).length, 5);
  assert.doesNotMatch(index, /<script[^>]+src=/i);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test('stap 9 volgt de Foundation en heeft responsive, print- en bewegingsvoorkeuren', () => {
  const index = fs.readFileSync('src/Index.html', 'utf8');
  const styles = fs.readFileSync('src/Styles.html', 'utf8');

  assert.match(index, /class="site-header"/);
  assert.match(index, /LEREN DOOR CREËREN/);
  assert.match(index, /Foundation\/assets\/logo-3dindeklas\.png/);
  assert.match(index, /id="printButton"/);
  assert.match(styles, /--purple:\s*#4c325b/);
  assert.match(styles, /--yellow:\s*#fbbd30/);
  assert.match(styles, /--teal:\s*#5ab3b1/);
  assert.match(styles, /min-height:\s*2\.75rem/);
  assert.match(styles, /@media \(max-width: 480px\)/);
  assert.match(styles, /@media print/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(index, /<link[^>]+rel=["']stylesheet/i);
  assert.doesNotMatch(index, /<script[^>]+src=/i);
});

test('afdrukknop opent de browserafdrukweergave', () => {
  const elements = clientHarness([]);
  assert.equal(elements.__printCount(), 0);
  elements.printButton.trigger('click');
  assert.equal(elements.__printCount(), 1);
});

test('filterzijbalk klapt in zonder selecties te verliezen en Escape herstelt de focus', () => {
  const elements = clientHarness([{ source: 'Hub A', workshop: 'Workshop' }]);
  assert.equal(elements.filterSidebar.hidden, true);
  assert.equal(elements.filterToggle.getAttribute('aria-expanded'), 'false');
  elements.filterToggle.trigger('click');
  assert.equal(elements.filterSidebar.hidden, false);
  assert.equal(elements.dashboardLayout.classList.contains('has-filters'), true);
  elements.sourceFilter.value = 'Hub A';
  elements.sourceFilter.trigger('change');
  elements.__keyDown('Escape');
  assert.equal(elements.filterSidebar.hidden, true);
  assert.equal(elements.filterToggle.focused, true);
  assert.equal(elements.sourceFilter.value, 'Hub A');
  assert.equal(elements.activeFilterCount.textContent, '1');
  assert.match(elements.filterSummary.textContent, /Hub A/);
});

test('weergavekeuze bewaart verborgen grafieken na filteren en vernieuwen', () => {
  const elements = clientHarness([{ source: 'A', sector: 'PO' }], { deferLoad: true });
  const payload = { mode: 'live', sources: [], records: [{ source: 'A', sector: 'PO' }],
    permissions: { canViewFinancials: true } };
  elements.__resolveLoad(payload);
  elements.viewTimeline.checked = false;
  elements.viewTimeline.trigger('change');
  elements.viewFinancial.checked = false;
  elements.viewFinancial.trigger('change');
  elements.sourceFilter.value = 'A';
  elements.sourceFilter.trigger('change');
  assert.equal(elements.timelinePanel.hidden, true);
  assert.equal(elements.financialOverview.hidden, true);
  assert.equal(elements.sectorPanel.hidden, false);
  elements.refreshButton.trigger('click');
  elements.__resolveLoad(payload);
  assert.equal(elements.timelinePanel.hidden, true);
  assert.equal(elements.financialOverview.hidden, true);
  elements.resetButton.trigger('click');
  assert.equal(elements.timelinePanel.hidden, true);
  assert.equal(elements.viewTimeline.checked, false);
});

test('alles tonen verleent geen financiële toegang en een lege weergave is herstelbaar', () => {
  const elements = clientHarness([{ source: 'A' }], { canViewFinancials: false });
  const controlIds = ['viewKpis', 'viewTimeline', 'viewGeography', 'viewSector', 'viewStatus',
    'viewWorkshops', 'viewProviders', 'viewGrades', 'viewRecent', 'viewComparison', 'viewFinancial'];
  controlIds.forEach(id => { elements[id].checked = false; elements[id].trigger('change'); });
  assert.equal(elements.analyticsSection.hidden, true);
  assert.equal(elements.emptyView.hidden, false);
  elements.showAllPanels.trigger('click');
  assert.equal(elements.emptyView.hidden, true);
  assert.equal(elements.analyticsSection.hidden, false);
  assert.equal(elements.sectorPanel.hidden, false);
  assert.equal(elements.financialVisibilityOption.hidden, true);
  assert.equal(elements.financialOverview.hidden, true);
  assert.equal(elements.financialKpis.children.length, 0);
});

test('kaart en gemeentestaven volgen samen de filters en kaartgebied verandert geen telling', () => {
  const elements = clientHarness([{ source: 'A', region: 'Gorinchem' }, { source: 'B', region: 'Altena' }]);
  elements.sourceFilter.value = 'A';
  elements.sourceFilter.trigger('change');
  const total = elements.resultCount.textContent;
  elements.mapScope.value = 'netherlands';
  elements.mapScope.trigger('change');
  assert.equal(elements.mapCoverage.textContent, '1 van 1 aanvragen gekoppeld aan 1 gemeente.');
  assert.deepEqual(elements.regionChart.children[0].children[0].children.map(cell => cell.textContent), ['Gorinchem', '1']);
  assert.equal(elements.resultCount.textContent, total);
});

test('snelle schooljaarwissel synchroniseert met de zijbalk, behoudt overige filters en herstelt na wissen', () => {
  const elements = clientHarness([
    { source: 'A', schoolYear: '2026–2027' },
    { source: 'A', schoolYear: '2025–2026' },
    { source: 'B', schoolYear: '2026–2027' }
  ]);
  const buttons = elements.schoolYearSwitch.children;
  assert.deepEqual(buttons.map(button => button.textContent), ['Alle schooljaren', '2026–2027', '2025–2026']);
  elements.sourceFilter.value = 'A';
  elements.sourceFilter.trigger('change');
  buttons[1].trigger('click');
  assert.equal(elements.schoolYearFilter.value, '2026–2027');
  assert.equal(elements.sourceFilter.value, 'A');
  assert.equal(elements.resultCount.textContent, '1 van 3 workshops zichtbaar');
  assert.equal(buttons[1].getAttribute('aria-pressed'), 'true');
  assert.match(elements.filterSummary.textContent, /2026–2027/);
  elements.schoolYearFilter.value = '2025–2026';
  elements.schoolYearFilter.trigger('change');
  assert.equal(buttons[1].getAttribute('aria-pressed'), 'false');
  assert.equal(buttons[2].getAttribute('aria-pressed'), 'true');
  elements.resetButton.trigger('click');
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'true');
  assert.equal(elements.resultCount.textContent, '3 van 3 workshops zichtbaar');
});

test('schooljaarwissel bouwt bij vernieuwen de actuele schooljaren op en behoudt geldige selectie', () => {
  const elements = clientHarness([], { deferLoad: true });
  const payload = { records: [{ schoolYear: '2026–2027' }], sources: [] };
  elements.__resolveLoad(payload);
  elements.schoolYearSwitch.children[1].trigger('click');
  elements.refreshButton.trigger('click');
  elements.__resolveLoad({ ...payload, records: [...payload.records, { schoolYear: '2027–2028' }] });
  assert.equal(elements.schoolYearFilter.value, '2026–2027');
  assert.deepEqual(elements.schoolYearSwitch.children.map(button => button.value), ['', '2027–2028', '2026–2027']);
  assert.equal(elements.schoolYearSwitch.children[2].getAttribute('aria-pressed'), 'true');
  elements.refreshButton.trigger('click');
  elements.__resolveLoad({ ...payload, records: [] });
  assert.equal(elements.schoolYearFilter.value, '');
  assert.equal(elements.schoolYearSwitch.children.length, 1);
  assert.equal(elements.schoolYearSwitch.children[0].getAttribute('aria-pressed'), 'true');
});

test('actieve filterteller herkent leerlingbereiken en herstelt na Filters wissen', () => {
  const elements = clientHarness([
    { source: 'A', scheduledDate: '2026-09-01', students: 20 },
    { source: 'B', scheduledDate: '2026-10-01', students: 30 }
  ]);
  assert.equal(elements.activeFilterCount.hidden, true);
  elements.studentsFromRange.value = 21;
  elements.studentsFromRange.trigger('input');
  assert.equal(elements.activeFilterCount.textContent, '1');
  assert.match(elements.filterSummary.textContent, /21 – 30 leerlingen/);
  elements.resetButton.trigger('click');
  assert.equal(elements.activeFilterCount.hidden, true);
});

test('demo blijft werken en de browser ontvangt alleen de veilige stap-8-velden', () => {
  const payload = context().getDashboardData();
  assert.equal(payload.mode, 'demo');
  assert.equal(payload.complete, true);
  assert.equal(payload.records.length, 10);
  assert.deepEqual(JSON.parse(JSON.stringify(payload.sources.map(source => [source.name, source.status, source.recordCount]))), [
    ['Tech-hub A', 'demo', 5],
    ['Tech-hub B', 'demo', 5]
  ]);
  assert.deepEqual([...new Set(payload.records.map(record => record.source))].sort(), ['Tech-hub A', 'Tech-hub B']);
  assert.equal(payload.records.filter(record => !record.scheduledDate).length, 1);
  assert.equal(payload.records.filter(record => record.scheduledDates.length > 1).length, 1);
  assert.equal(payload.records.filter(record => record.students === null).length, 1);
  assert.equal(payload.records.filter(record =>
    record.providerTotalCosts !== null && record.invoiceAmount !== null
  ).length, 8);
  assert.deepEqual(Object.keys(payload.records[0]).sort(), [
    'grades', 'invoiceAmount', 'provider', 'providerTotalCosts', 'region', 'requestedDate',
    'scheduledDate', 'scheduledDates', 'school', 'schoolYear', 'sector', 'sessions',
    'source', 'status', 'statusGroup', 'students', 'type', 'workshop'
  ]);
  assert.deepEqual(Array.from(payload.records[0].grades), [7, 8]);
  assert.equal(payload.records[0].providerTotalCosts, 450);
  assert.equal(payload.records[0].invoiceAmount, 600);
});

test('donuts tonen aantallen, percentages en vaste kleuren na filteren', () => {
  const elements = clientHarness([
    { source: 'A', region: 'Gorinchem', sector: 'PO', statusGroup: 'Open' },
    { source: 'A', region: 'Gorinchem', sector: 'PO', statusGroup: 'Ingepland' },
    { source: 'B', region: 'Altena', sector: 'VO', statusGroup: 'Uitgevoerd' }
  ]);
  const ring = elements.sectorChart.children[0];
  assert.equal(ring.tagName, 'SVG');
  assert.match(ring.getAttribute('aria-label'), /3 aanvragen/);
  assert.deepEqual(elements.sectorChart.children[1].children.map(item => item.children[2].textContent),
    ['2 · 66,7%', '1 · 33,3%']);
  assert.equal(ring.children[0].getAttribute('fill'), '#6366f1');
  assert.equal(ring.children[1].getAttribute('fill'), '#06b6d4');
  assert.equal(ring.children.filter(item => item.tagName === 'PATH').length, 2);
  assert.equal(ring.children[0].getAttribute('stroke'), '#ffffff');
  assert.match(ring.children[0].getAttribute('d'), /A77,77.*A53,53/);
  assert.doesNotMatch(ring.children[0].getAttribute('d'), /NaN/);
  elements.sourceFilter.value = 'B';
  elements.sourceFilter.trigger('change');
  assert.equal(elements.sectorChart.children[0].children[0].getAttribute('fill'), '#06b6d4');
  assert.match(elements.sectorChart.children[0].children[0].getAttribute('d'), /A77,77.*A77,77.*A53,53.*A53,53/);
  assert.match(elements.sectorChart.children[1].children[0].children[2].textContent, /100,0%/);
  assert.deepEqual(elements.statusTableRows.children[0].children.map(cell => cell.textContent), ['Uitgevoerd', '1']);
});

test('gemeentekaart telt aanvragen eenmaal en meldt niet-herkende regio’s afzonderlijk', () => {
  const elements = clientHarness([
    { source: 'A', region: 'Gorinchem', scheduledDates: ['2026-09-01', '2026-09-15'] },
    { source: 'A', region: ' gemeente GORINCHEM ' },
    { source: 'B', region: 'GM0512' },
    { source: 'B', region: 'Hardinxveld Giessendam' },
    { source: 'B', region: 'Ameide' },
    { source: 'B', region: 'Onbekend' }
  ]);
  assert.equal(elements.mapCoverage.textContent, '4 van 6 aanvragen gekoppeld aan 2 gemeenten.');
  assert.match(elements.mapUnmatched.textContent, /Ameide \(1\)/);
  assert.match(elements.mapUnmatched.textContent, /Onbekend \(1\)/);
  const rows = elements.mapTableRows.children.map(row => row.children.map(cell => cell.textContent));
  assert.deepEqual(rows.find(row => row[0] === 'Gorinchem'), ['Gorinchem', 'Gemeente', '3']);
  assert.equal(rows.reduce((sum, row) => sum + Number(row[2]), 0), 6);
});

test('kaartkleuren, aantallen en detailselectie volgen dezelfde filters en behouden het werkgebied', () => {
  const elements = clientHarness([
    { source: 'A', region: 'Gorinchem' },
    { source: 'A', region: 'Gorinchem' },
    { source: 'B', region: 'Molenlanden' }
  ]);
  const originalView = elements.municipalityMap.children[0].getAttribute('viewBox');
  let paths = elements.municipalityMap.children[0].children.filter(child => child.tagName === 'PATH');
  const gorinchem = paths.find(path => path.getAttribute('data-code') === 'GM0512');
  const molenlanden = paths.find(path => path.getAttribute('data-code') === 'GM1978');
  assert.notEqual(gorinchem.getAttribute('fill'), molenlanden.getAttribute('fill'));
  gorinchem.trigger('click');
  assert.equal(elements.mapMunicipality.value, 'GM0512');
  assert.equal(elements.mapDetail.textContent, 'Gorinchem: 2 gekoppelde aanvragen.');
  assert.equal(gorinchem.getAttribute('data-selected'), 'true');
  elements.sourceFilter.value = 'B';
  elements.sourceFilter.trigger('change');
  assert.equal(elements.mapCoverage.textContent, '1 van 1 aanvragen gekoppeld aan 1 gemeente.');
  assert.equal(elements.municipalityMap.children[0].getAttribute('viewBox'), originalView);
  assert.equal(elements.mapDetail.textContent, 'Gorinchem: 0 gekoppelde aanvragen.');
  paths = elements.municipalityMap.children[0].children.filter(child => child.tagName === 'PATH');
  assert.equal(paths.find(path => path.getAttribute('data-code') === 'GM0512').getAttribute('fill'), '#ebe8ee');
  elements.mapScope.value = 'netherlands';
  elements.mapScope.trigger('change');
  assert.notEqual(elements.municipalityMap.children[0].getAttribute('viewBox'), originalView);
  elements.resetButton.trigger('click');
  assert.equal(elements.mapScope.value, 'workarea');
  assert.equal(elements.mapMunicipality.value, '');
});

test('ontbrekende kaartasset blokkeert donuts, kerncijfers en gegevens niet', () => {
  const elements = clientHarness([{ source: 'A', sector: 'PO', region: 'Gorinchem' }], { mapAsset: false });
  assert.match(elements.municipalityMap.children[0].textContent, /Kaart niet beschikbaar/);
  assert.equal(elements.mapScope.disabled, true);
  assert.equal(elements.sectorChart.children[0].tagName, 'SVG');
  assert.equal(elements.kpis.children[0].children[1].textContent, '1');
});

test('kaartasset bevat uitsluitend volledige openbare gemeentegeometrie en bronvermelding', () => {
  const html = fs.readFileSync('src/Municipalities.html', 'utf8');
  const data = JSON.parse(html.match(/<script[^>]*>([\s\S]*)<\/script>/)[1]);
  assert.equal(data.municipalities.length, 342);
  assert.equal(new Set(data.municipalities.map(item => item.code)).size, 342);
  assert.match(data.url, /^https:\/\/api\.pdok\.nl\//);
  assert.equal(data.license, 'CC BY 4.0');
  data.municipalities.forEach(item => {
    assert.match(item.code, /^GM\d{4}$/);
    assert.ok(item.path.startsWith('M') && item.path.endsWith('Z'));
    assert.ok(item.bounds.every(Number.isFinite));
    assert.ok(item.label.every(Number.isFinite));
    assert.ok(item.bounds[0] < item.bounds[2] && item.bounds[1] < item.bounds[3]);
  });
});

test('lang laden geeft stapsgewijze feedback en herstelt de bediening na succes', () => {
  const elements = clientHarness([], { deferLoad: true });

  assert.equal(elements.__requestedMethod(), 'getDashboardData');
  assert.equal(elements.dashboard.getAttribute('aria-busy'), 'true');
  assert.equal(elements.refreshButton.disabled, true);
  assert.equal(elements.refreshButton.textContent, 'Laden…');
  assert.equal(elements.message.textContent, 'Dashboardgegevens worden geladen…');
  assert.equal(elements.message.classList.contains('loading'), true);

  elements.__runTimersThrough(1500);
  assert.equal(elements.message.textContent, 'De Google Sheets worden gecontroleerd…');
  elements.__runTimersThrough(5000);
  assert.equal(elements.message.textContent, 'De workshopregels van alle tech-hubs worden samengevoegd…');
  elements.__runTimersThrough(10000);
  assert.match(elements.message.textContent, /duurt langer dan normaal/);

  elements.__resolveLoad({
    mode: 'live',
    generatedAt: '2026-10-17T00:00:00.000Z',
    complete: true,
    snapshot: { source: 'cache', cacheEnabled: true },
    sources: [],
    records: []
  });

  assert.equal(elements.dashboard.getAttribute('aria-busy'), 'false');
  assert.equal(elements.refreshButton.disabled, false);
  assert.equal(elements.refreshButton.textContent, 'Brongegevens vernieuwen');
  assert.equal(elements.message.classList.contains('loading'), false);
  assert.equal(elements.message.hidden, true);
  assert.equal(elements.modeBadge.textContent, 'Live gegevens');
  assert.match(elements.updatedAt.textContent, /^Bijgewerkt /);
  assert.doesNotMatch(elements.updatedAt.textContent, /geladen in|snapshot/);
  assert.equal(elements.dataOrigin.textContent, 'Snapshot');
  assert.match(elements.dataDuration.textContent, /^\d+,\d s$/);

  elements.refreshButton.trigger('click');
  assert.equal(elements.__requestedMethod(), 'refreshDashboardData');
  assert.equal(elements.message.textContent, 'Brongegevens worden vernieuwd…');
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
    ['Tech-hub A', '5', '105', '5', '11', '2', '21,0', '1,0', '0'],
    ['Tech-hub B', '5', '99', '5', '11', '2', '24,8', '1,0', '1']
  ]);
});

test('demodata levert de gedocumenteerde stap-8-financiële totalen op', () => {
  const payload = JSON.parse(JSON.stringify(context().getDashboardData()));
  const elements = clientHarness(payload.records);
  const readable = value => value.replace(/\s/g, ' ');
  const financial = Object.fromEntries(elements.financialKpis.children.map(card => [
    card.children[0].textContent,
    readable(card.children[1].textContent)
  ]));
  const completeness = Object.fromEntries(elements.financialCompleteness.children.map(card => [
    card.children[0].textContent,
    card.children[1].textContent
  ]));

  assert.deepEqual(financial, {
    'Totale kosten aanbieder': '€ 4.750,00',
    'Te factureren': '€ 6.700,00',
    'Marge complete regels': '€ 1.450,00',
    'Gewogen marge': '25,0%'
  });
  assert.deepEqual(completeness, {
    'Complete financiële regels': '8',
    'Onvolledige financiële regels': '2'
  });
});

test('financiële totalen gebruiken bekende bedragen en marge alleen uit complete regels', () => {
  const elements = clientHarness([
    {
      source: 'Tech-hub A', workshop: 'Compleet A',
      providerTotalCosts: 100, invoiceAmount: 200, financialComplete: true
    },
    {
      source: 'Tech-hub A', workshop: 'Alleen kosten',
      providerTotalCosts: 50, invoiceAmount: null, financialComplete: false
    },
    {
      source: 'Tech-hub B', workshop: 'Compleet B',
      providerTotalCosts: 80, invoiceAmount: 100, financialComplete: true
    },
    {
      source: 'Tech-hub B', workshop: 'Alleen factuur',
      providerTotalCosts: null, invoiceAmount: 300, financialComplete: false
    }
  ]);
  const readable = value => value.replace(/\s/g, ' ');
  const financial = () => Object.fromEntries(elements.financialKpis.children.map(card => [
    card.children[0].textContent,
    readable(card.children[1].textContent)
  ]));
  const completeness = () => Object.fromEntries(elements.financialCompleteness.children.map(card => [
    card.children[0].textContent,
    card.children[1].textContent
  ]));

  assert.deepEqual(financial(), {
    'Totale kosten aanbieder': '€ 230,00',
    'Te factureren': '€ 600,00',
    'Marge complete regels': '€ 120,00',
    'Gewogen marge': '40,0%'
  });
  assert.deepEqual(completeness(), {
    'Complete financiële regels': '2',
    'Onvolledige financiële regels': '2'
  });

  elements.sourceFilter.value = 'Tech-hub A';
  elements.sourceFilter.trigger('change');
  assert.deepEqual(financial(), {
    'Totale kosten aanbieder': '€ 150,00',
    'Te factureren': '€ 200,00',
    'Marge complete regels': '€ 100,00',
    'Gewogen marge': '50,0%'
  });
  assert.deepEqual(completeness(), {
    'Complete financiële regels': '1',
    'Onvolledige financiële regels': '1'
  });

  elements.resetButton.trigger('click');
  elements.workshopFilter.value = 'Alleen kosten';
  elements.workshopFilter.trigger('change');
  assert.deepEqual(financial(), {
    'Totale kosten aanbieder': '€ 50,00',
    'Te factureren': '—',
    'Marge complete regels': '—',
    'Gewogen marge': '—'
  });
  assert.deepEqual(completeness(), {
    'Complete financiële regels': '0',
    'Onvolledige financiële regels': '1'
  });
  assert.match(elements.financialNote.textContent, /Marge blijft daarom onbekend/);
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
  assert.equal(elements.timelineCaption.textContent, 'Aanvragen / workshops per maand en tech-hub');
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
      source: 'Tech-hub A', requestedDate: '2026-08-01',
      scheduledDate: '2026-09-10', scheduledDates: ['2026-09-10', '2026-10-10'],
      students: 20, sessions: 2, sector: 'PO', grades: [5, 6],
      workshop: 'A', statusGroup: 'Ingepland'
    },
    {
      source: 'Tech-hub B', requestedDate: '2026-08-02',
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
  const pie = elements.poChart.children[0];
  assert.equal(pie.tagName, 'SVG');
  assert.match(pie.getAttribute('aria-label'), /3 gewogen aanvragen/);
  assert.equal(pie.children.length, 4);
  assert.match(pie.children[0].getAttribute('d'), /^M90,90L.*A77,77/);
  assert.deepEqual(elements.poChart.children[1].children.map(item => item.children[2].textContent),
    ['0,33 · 11,1%', '0,33 · 11,1%', '0,33 · 11,1%', '2 · 66,7%']);
  assert.equal(pie.children[3].getAttribute('fill'), '#94a3b8');
  const color = pie.children[0].getAttribute('fill');
  elements.workshopFilter.value = 'A';
  elements.workshopFilter.trigger('change');
  assert.equal(elements.poChart.children[0].children[0].getAttribute('fill'), color);
  elements.workshopFilter.value = 'B';
  elements.workshopFilter.trigger('change');
  assert.match(elements.poChart.children[0].children[0].getAttribute('d'), /A77,77.*A77,77/);
  assert.equal(elements.poChart.children[1].children[0].children[2].textContent, '1 · 100,0%');
  assert.equal(elements.voChart.children[0].textContent, 'Geen gegevens binnen deze filters.');
});

test('een lege selectie geeft nette lege grafiek- en tabelstaten', () => {
  const elements = clientHarness([
    {
      source: 'Tech-hub A', scheduledDate: '2026-09-01',
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

test('financiële browservelden vallen onder dezelfde verplichte toegangscontrole', () => {
  const denied = context({ Session: session('niet-toegestaan@voorbeeld.nl') });
  assert.throws(() => denied.getDashboardData(), /Geen toegang/);

  const dashboardOnly = context({}, withFinancialEmails([])).getDashboardData();
  assert.equal(dashboardOnly.permissions.canViewFinancials, false);
  assert.equal(Object.prototype.hasOwnProperty.call(dashboardOnly.records[0], 'providerTotalCosts'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(dashboardOnly.records[0], 'invoiceAmount'), false);
  const hiddenElements = clientHarness(dashboardOnly.records, { canViewFinancials: false });
  assert.equal(hiddenElements.financialOverview.hidden, true);
  assert.equal(hiddenElements.financialKpis.children.length, 0);

  const allowed = context().getDashboardData();
  const allowedRecord = allowed.records[0];
  assert.equal(allowed.permissions.canViewFinancials, true);
  assert.equal(allowedRecord.providerTotalCosts, 450);
  assert.equal(allowedRecord.invoiceAmount, 600);
  assert.equal(Object.prototype.hasOwnProperty.call(allowedRecord, 'financialComplete'), false);
  const visibleElements = clientHarness(allowed.records);
  assert.equal(visibleElements.financialOverview.hidden, false);
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
    () => context().normalizeSheet_([['Status'], ['Open']], 'Tech-hub A'),
    /kolom Workshopnaam ontbreekt in Tech-hub A/
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

test('dashboardvelden verlaten gecontroleerd de server maar privacy- en detailvelden niet', () => {
  const internal = { ...normalize().records[0], laterToegevoegdGeheim: 'nieuw-geheim' };
  const publicRecord = context().publicRecord_(internal, true);
  const json = JSON.stringify(publicRecord);

  assert.deepEqual(Object.keys(publicRecord), [
    'source', 'requestedDate', 'scheduledDate', 'scheduledDates', 'schoolYear',
    'school', 'workshop', 'provider', 'region', 'sector', 'grades', 'status',
    'statusGroup', 'type', 'sessions', 'students', 'providerTotalCosts',
    'invoiceAmount'
  ]);
  assert.equal(publicRecord.requestedDate, '2026-10-14');
  assert.equal(publicRecord.scheduledDate, '2026-11-20');
  assert.deepEqual(Array.from(publicRecord.scheduledDates), ['2026-11-20']);
  assert.equal(publicRecord.schoolYear, '2026–2027');
  assert.equal(publicRecord.school, 'School A');
  assert.deepEqual(Array.from(publicRecord.grades), [6, 7, 8]);
  assert.equal(publicRecord.statusGroup, 'Ingepland');
  assert.equal(publicRecord.type, 'Workshop');
  assert.equal(publicRecord.providerTotalCosts, 485.5);
  assert.equal(publicRecord.invoiceAmount, 650);

  for (const privateField of [
    'requestId', 'schoolKey', 'location', 'providerWorkshopPrice', 'travelCosts',
    'extraCosts', 'marginAmount', 'marginPercent', 'financialComplete',
    'lastContactDate', 'actionRequired'
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(publicRecord, privateField), false, privateField);
  }

  for (const privateValue of [
    'REQ-001', 'Privé Persoon', 'private@example.test', '0612345678',
    'Technieklokaal', 'secret-draft-id', 'secret-calendar-id', 'secret-source-id',
    'Niet naar de browser sturen', 'private-debug', '164.5', '25.31', 'nieuw-geheim'
  ]) {
    assert.ok(!json.includes(privateValue), privateValue);
  }
});

test('ontbrekende financiële bedragen blijven null in de browserprojectie', () => {
  const ctx = context();
  const record = {
    source: 'Tech-hub A',
    providerTotalCosts: undefined,
    invoiceAmount: 0,
    financialComplete: true
  };
  const publicRecord = ctx.publicRecord_(record, true);
  const redactedRecord = ctx.publicRecord_(record);

  assert.equal(publicRecord.providerTotalCosts, null);
  assert.equal(publicRecord.invoiceAmount, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(publicRecord, 'financialComplete'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(redactedRecord, 'providerTotalCosts'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(redactedRecord, 'invoiceAmount'), false);
});

test('alle negen dropdownfilters worden uit de records opgebouwd en gecombineerd', () => {
  const records = [
    {
      source: 'Tech-hub A', schoolYear: '2026–2027', region: 'Ameide', sector: 'PO',
      provider: 'Maker A', workshop: '3D ontwerpen', statusGroup: 'Ingepland',
      school: 'School A', type: 'Workshop', status: 'Akkoord', date: '2026-10-10',
      sessions: 2, students: 24
    },
    {
      source: 'Tech-hub A', schoolYear: '2025–2026', region: 'Utrecht', sector: 'VO',
      provider: 'Maker B', workshop: 'Robotica', statusGroup: 'Open',
      school: 'School B', type: 'Training', status: 'Nieuw', date: '2026-05-10',
      sessions: 1, students: 18
    },
    {
      source: 'Tech-hub B', schoolYear: '2026–2027', region: 'Ameide', sector: 'PO',
      provider: 'Maker A', workshop: '3D ontwerpen', statusGroup: 'Uitgevoerd',
      school: 'School C', type: 'Workshop', status: 'Uitgevoerd', date: '2026-09-10',
      sessions: 3, students: 30
    }
  ];
  const elements = clientHarness(records);
  const selections = {
    sourceFilter: 'Tech-hub A',
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
      source: 'Tech-hub A', workshop: 'Meerdere lessen', status: 'Ingepland'
    },
    {
      requestedDate: '2026-02-10', scheduledDate: '2026-04-15',
      scheduledDates: ['2026-04-15'], students: 20,
      source: 'Tech-hub B', workshop: 'Eén les', status: 'Ingepland'
    },
    {
      requestedDate: '2026-03-10', scheduledDate: '', scheduledDates: [], students: 30,
      source: 'Tech-hub B', workshop: 'Nog onbekend', status: 'Open'
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

test('stap-6-kerncijfers en tech-hubvergelijking gebruiken exact dezelfde filters', () => {
  const records = [
    {
      source: 'Tech-hub A', region: 'Noord', school: 'School Eén', students: 20,
      sessions: 2, statusGroup: 'Uitgevoerd', scheduledDate: '2026-09-01',
      scheduledDates: ['2026-09-01'], workshop: 'A', status: 'Uitgevoerd'
    },
    {
      source: 'Tech-hub A', region: ' noord ', school: '  SCHOOL ÉÉN ', students: null,
      sessions: 1, statusGroup: 'Open', scheduledDate: '2026-09-02',
      scheduledDates: ['2026-09-02'], workshop: 'B', status: 'Open'
    },
    {
      source: 'Tech-hub A', region: 'Zuid', school: 'School Eén', students: 30,
      sessions: 3, statusGroup: 'Uitgevoerd', scheduledDate: '2026-09-03',
      scheduledDates: ['2026-09-03'], workshop: 'C', status: 'Uitgevoerd'
    },
    {
      source: 'Tech-hub B', region: 'Noord', school: 'School Eén', students: 10,
      sessions: 1, statusGroup: 'Uitgevoerd', scheduledDate: '2026-09-04',
      scheduledDates: ['2026-09-04'], workshop: 'D', status: 'Uitgevoerd'
    },
    {
      source: 'Tech-hub B', region: 'Noord', school: 'Onbekende school', students: 0,
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
    ['Tech-hub A', '3', '50', '2', '6', '2', '25,0', '1,5', '1'],
    ['Tech-hub B', '2', '10', '1', '1', '1', '5,0', '1,0', '0']
  ]);

  elements.sourceFilter.value = 'Tech-hub B';
  elements.sourceFilter.trigger('change');
  assert.equal(kpis()['Aanvragen / workshops'], '2');
  assert.equal(kpis()['Leerlingdeelnames'], '10');
  assert.equal(kpis()['Gem. leerlingen / aanvraag'], '5,0');
  assert.equal(elements.comparisonSummary.textContent, '2 zichtbare aanvragen');
  assert.deepEqual(rows(), [
    ['Tech-hub A', '0', '0', '0', '0', '0', '—', '—', '0'],
    ['Tech-hub B', '2', '10', '1', '1', '1', '5,0', '1,0', '0']
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
  const result = ctx.readGoogleSheet_({ name: 'Tech-hub A', spreadsheetId: 'test', sheetName: 'Workshops', headerRow: 8 });
  assert.deepEqual(requestedRange, [8, 1, 3, headers.length]);
  assert.equal(result.records.length, 2);
  assert.equal(result.warnings.duplicateRequestIds, 0);
});

test('Google Sheet gebruikt één compacte ankerscan en één brede dataread', () => {
  const ranges = [];
  const formulaRanges = [];
  const sheet = googleSheet([row(), row({ 'Aanvraag ID': 'REQ-002' })], {
    onGetRange: (...args) => ranges.push(args),
    onGetFormulas: (...args) => formulaRanges.push(args)
  });
  const ctx = context({ SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) } });
  ctx.readGoogleSheet_({
    name: 'Tech-hub A', spreadsheetId: 'test', sheetName: 'Workshops', headerRow: 8
  });

  assert.deepEqual(ranges, [
    [8, 1, 1, headers.length],
    [9, 2, 2, 9],
    [8, 1, 3, headers.length]
  ]);
  assert.deepEqual(formulaRanges, [[9, 2, 2, 9]]);
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
    name: 'Tech-hub A', spreadsheetId: 'source-a-id', sheetName: 'Workshops', headerRow: 8
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
    name: 'Tech-hub A', spreadsheetId: 'test', sheetName: 'Workshops', headerRow: 8
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
    name: 'Tech-hub A', spreadsheetId: 'source-a-id', sheetName: 'Workshops', headerRow: 8
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
    name: 'Tech-hub A', spreadsheetId: 'test', sheetName: 'Workshops', headerRow: 8
  });

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].requestId, 'REQ-001');
});

test('rijlimiet heeft een veilige standaard en harde bovengrens', () => {
  assert.equal(liveContext({}, { maxRows: 25000 }).sourceRowLimit_(), 10000);
  const invalidLimit = context({}, source => source.replace('maxRowsPerSource: 5000', "maxRowsPerSource: 'ongeldig'"));
  assert.equal(invalidLimit.sourceRowLimit_(), 5000);
});

test('een live snapshot voorkomt dat dezelfde Google Sheets bij iedere opening opnieuw worden gelezen', () => {
  const stored = memoryCache();
  const sheet = googleSheet([row({ 'Workshopnaam': 'Snapshot workshop' })]);
  let opened = 0;
  const ctx = liveContext({
    CacheService: stored.service,
    LockService: immediateLockService(),
    SpreadsheetApp: {
      openById: () => {
        opened += 1;
        return { getSheetByName: () => sheet };
      }
    }
  });

  const first = ctx.getDashboardData();
  const second = ctx.getDashboardData();

  assert.equal(first.snapshot.source, 'live');
  assert.equal(second.snapshot.source, 'cache');
  assert.equal(second.generatedAt, first.generatedAt);
  assert.equal(second.records[0].workshop, 'Snapshot workshop');
  assert.equal(opened, 2);
});

test('handmatig vernieuwen vervangt de snapshot met nieuwe brongegevens', () => {
  const stored = memoryCache();
  let workshop = 'Eerste versie';
  let opened = 0;
  const ctx = liveContext({
    CacheService: stored.service,
    LockService: immediateLockService(),
    SpreadsheetApp: {
      openById: () => {
        opened += 1;
        return { getSheetByName: () => googleSheet([row({ 'Workshopnaam': workshop })]) };
      }
    }
  });

  assert.equal(ctx.getDashboardData().records[0].workshop, 'Eerste versie');
  workshop = 'Bijgewerkte versie';
  assert.equal(ctx.getDashboardData().records[0].workshop, 'Eerste versie');

  const refreshed = ctx.refreshDashboardData();
  const cached = ctx.getDashboardData();

  assert.equal(refreshed.snapshot.source, 'live');
  assert.equal(refreshed.records[0].workshop, 'Bijgewerkte versie');
  assert.equal(cached.snapshot.source, 'cache');
  assert.equal(cached.records[0].workshop, 'Bijgewerkte versie');
  assert.equal(opened, 4);
});

test('de gedeelde snapshot bevat geen persoonsgegevens en financiële velden blijven per account afgeschermd', () => {
  const stored = memoryCache();
  const ctx = liveContext({
    CacheService: stored.service,
    LockService: immediateLockService(),
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => googleSheet([row()]) }) }
  }, { configTransform: withFinancialEmails([]) });

  const response = ctx.getDashboardData();
  const cached = ctx.readDashboardSnapshot_();
  const cachedJson = JSON.stringify(cached);

  assert.equal(response.permissions.canViewFinancials, false);
  assert.equal(Object.prototype.hasOwnProperty.call(response.records[0], 'providerTotalCosts'), false);
  assert.equal(cached.records[0].providerTotalCosts, 485.5);
  for (const privateValue of ['Privé Persoon', 'private@example.test', '0612345678', 'Niet naar de browser sturen']) {
    assert.ok(!cachedJson.includes(privateValue), privateValue);
  }
});

test('een onvolledige snapshot valt veilig terug op de live Google Sheets', () => {
  const stored = memoryCache();
  let workshop = 'Voor cachefout';
  let opened = 0;
  const ctx = liveContext({
    CacheService: stored.service,
    LockService: immediateLockService(),
    SpreadsheetApp: {
      openById: () => {
        opened += 1;
        return { getSheetByName: () => googleSheet([row({ 'Workshopnaam': workshop })]) };
      }
    }
  });

  ctx.getDashboardData();
  const chunkKey = [...stored.values.keys()].find(key => key.includes(':chunk:'));
  stored.values.delete(chunkKey);
  workshop = 'Na cachefout';

  const recovered = ctx.getDashboardData();
  assert.equal(recovered.snapshot.source, 'live');
  assert.equal(recovered.records[0].workshop, 'Na cachefout');
  assert.equal(opened, 4);
});

test('een tijdelijke bronfout overschrijft een bestaande complete snapshot niet', () => {
  const stored = memoryCache();
  let failSecondSource = false;
  const ctx = liveContext({
    CacheService: stored.service,
    LockService: immediateLockService(),
    SpreadsheetApp: {
      openById: id => {
        if (failSecondSource && id === 'source-b-id') throw new Error('tijdelijke providerfout');
        return { getSheetByName: () => googleSheet([row({ 'Workshopnaam': 'Bewaarde versie' })]) };
      }
    }
  });

  const complete = ctx.getDashboardData();
  failSecondSource = true;
  const failedRefresh = ctx.refreshDashboardData();
  const preserved = ctx.getDashboardData();

  assert.equal(complete.complete, true);
  assert.equal(failedRefresh.complete, false);
  assert.equal(failedRefresh.snapshot.source, 'live');
  assert.equal(preserved.complete, true);
  assert.equal(preserved.snapshot.source, 'cache');
  assert.equal(preserved.records.length, 2);
});

test('de geplande snapshotverversing controleert het account van de triggermaker', () => {
  const denied = liveContext({ Session: session('niet-toegestaan@voorbeeld.nl') });
  assert.throws(() => denied.refreshDashboardSnapshot(), /Geen toegang/);

  const stored = memoryCache();
  const allowed = liveContext({
    CacheService: stored.service,
    LockService: immediateLockService(),
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => googleSheet([row()]) }) }
  });
  assert.match(allowed.refreshDashboardSnapshot(), /^\d{4}-\d{2}-\d{2}T/);
  assert.ok([...stored.values.keys()].some(key => key.endsWith(':manifest')));
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
    name: 'Tech-hub A',
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
  assert.equal(ctx.include('Municipalities'), '<Municipalities>');
  assert.throws(() => ctx.include('Onbekend'), /Bestand niet beschikbaar/);
});

test('doGet probeert uitsluitend de toegangspagina voor geweigerde accounts en valt veilig terug', () => {
  let templateCalls = 0;
  const htmlService = {
    createTemplateFromFile(name) {
      templateCalls += 1;
      assert.equal(name, 'Access');
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

  assert.equal(templateCalls, 1);
  assert.equal(output.title, 'Geen toegang');
  assert.match(output.content, /toegestaan Google-account/);
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
