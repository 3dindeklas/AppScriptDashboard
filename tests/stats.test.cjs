const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness(options = {}) {
  const rows = options.rows ? options.rows.slice() : [];
  const properties = new Map(options.properties || [
    ['WORKSHOPKOMPAS_STATS_SPREADSHEET_ID', 'stats-test-spreadsheet']
  ]);
  let hidden = false;
  let lockBusy = false;
  let insertions = 0;
  let opens = 0;
  let deletions = 0;
  const formatCalls = [];
  const sheet = {
    getSheetId: () => 99,
    getLastRow: () => rows.length,
    appendRow: values => { rows.push(values); },
    getRange(row, column, count = 1, columns = 1) {
      return {
        getValues: () => Array.from({ length: count }, (unused, index) =>
          Array.from({ length: columns }, (unused2, col) =>
            rows[row - 1 + index] ? rows[row - 1 + index][column - 1 + col] : undefined)),
        setNumberFormat(value) { formatCalls.push({ row, column, value }); }
      };
    },
    deleteRows(row, count) { rows.splice(row - 1, count); deletions += count; },
    isSheetHidden: () => hidden,
    hideSheet: () => { hidden = true; }
  };
  const book = {
    getSheetByName: name => (rows.length || insertions) && name === '__stats' ? sheet : null,
    insertSheet: name => { assert.equal(name, '__stats'); insertions++; return sheet; },
    getSheets: () => [{ getSheetId: () => 1, isSheetHidden: () => false }, sheet]
  };
  const ctx = vm.createContext({
    Date,
    console: { warn() {}, error() {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key) || null,
      setProperty: (key, value) => properties.set(key, value)
    }) },
    SpreadsheetApp: { openById: id => {
      opens++;
      if (options.failOpen) throw new Error('Geen schrijfrechten op statsbestand');
      assert.equal(id, 'stats-test-spreadsheet');
      return book;
    } },
    LockService: { getScriptLock: () => ({
      tryLock: () => !lockBusy,
      releaseLock() {}
    }) }
  });
  vm.runInContext(fs.readFileSync('src/Config.gs', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('src/Stats.gs', 'utf8'), ctx);
  return { ctx, rows, properties, sheet, formatCalls, get opens() { return opens; },
    get insertions() { return insertions; }, get hidden() { return hidden; },
    get deletions() { return deletions; }, setLockBusy(value) { lockBusy = value; } };
}

test('eerste opening maakt verborgen __stats-tabblad en schrijft uitsluitend minimale informatie', () => {
  const app = harness();
  assert.equal(app.ctx.recordDashboardVisit_(' DOCENT@Voorbeeld.nl ', false), true);
  assert.equal(app.insertions, 1);
  assert.equal(app.hidden, true);
  assert.deepEqual(Array.from(app.rows[0]), [
    'Tijdstip', 'Gebruiker (e-mailadres)', 'Toegang', 'Gebeurtenis'
  ]);
  assert.equal(app.rows[1][0] instanceof Date, true);
  assert.deepEqual(Array.from(app.rows[1].slice(1)), [
    'docent@voorbeeld.nl', 'Google-account', 'Dashboard geopend'
  ]);
  assert.equal(app.formatCalls[0].value, 'dd-mm-yyyy hh:mm:ss');
  assert.equal(app.ctx.recordDashboardVisit_('gast@voorbeeld.nl', true), true);
  assert.equal(app.insertions, 1);
  assert.equal(app.rows.length, 3);
  assert.equal(app.rows[2][2], 'E-mailcode');
});

test('een onjuist tabblad, lock of ontbrekende rechten blokkeert dashboard niet', () => {
  const wrong = harness({ rows: [['Andere gegevens', 'Niet overschrijven']] });
  assert.equal(wrong.ctx.recordDashboardVisit_('docent@voorbeeld.nl', false), false);
  assert.equal(wrong.rows.length, 1);
  const locked = harness();
  locked.setLockBusy(true);
  assert.equal(locked.ctx.recordDashboardVisit_('docent@voorbeeld.nl', false), false);
  assert.equal(locked.opens, 0);
  const unavailable = harness({ failOpen: true });
  assert.equal(unavailable.ctx.recordDashboardVisit_('docent@voorbeeld.nl', false), false);
  assert.equal(unavailable.rows.length, 0);
});

test('bezoekstatistieken verwijderen na 180 dagen oude rijen en houden recente rijen', () => {
  const old = new Date(Date.now() - 200 * 86400000);
  const recent = new Date(Date.now() - 10 * 86400000);
  const app = harness({ rows: [
    ['Tijdstip', 'Gebruiker (e-mailadres)', 'Toegang', 'Gebeurtenis'],
    [old, 'oud@voorbeeld.nl', 'Google-account', 'Dashboard geopend'],
    [recent, 'recent@voorbeeld.nl', 'Google-account', 'Dashboard geopend']
  ] });
  assert.equal(app.ctx.recordDashboardVisit_('nieuw@voorbeeld.nl', false), true);
  assert.equal(app.deletions, 1);
  assert.equal(app.rows.length, 3);
  assert.equal(app.rows[1][1], 'recent@voorbeeld.nl');
  assert.equal(app.rows[2][1], 'nieuw@voorbeeld.nl');
});

test('normale dashboarddata registreert een bezoek; geforceerd vernieuwen niet', () => {
  const app = harness();
  // Code.gs is dezelfde serverroute die de live webapp gebruikt.
  vm.runInContext(fs.readFileSync('src/Code.gs', 'utf8'), app.ctx);
  app.ctx.requireAccess_ = () => 'docent@voorbeeld.nl';
  app.ctx.canViewFinancials_ = () => false;
  app.ctx.liveDashboardSnapshot_ = () => ({
    snapshot: { records: [], sources: [], updatedAt: '2026-11-10T12:00:00Z', complete: true },
    source: 'live', storage: 'disabled'
  });
  app.ctx.snapshotCacheEnabled_ = () => false;
  const opened = app.ctx.getDashboardData('');
  assert.deepEqual(JSON.parse(JSON.stringify(opened.records)), []);
  assert.equal(app.rows.length, 2);
  app.ctx.refreshDashboardData('');
  assert.equal(app.rows.length, 2);
  assert.equal(app.ctx.getDashboardData('token').records.length, 0);
  assert.equal(app.rows.length, 3);
  assert.equal(app.rows[2][2], 'E-mailcode');
});
