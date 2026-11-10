const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const VISIT_A = 'd1442b9b-06e4-44c8-b5da-0aaf72ead570';
const VISIT_B = 'd1442b9b-06e4-44c8-b5da-0aaf72ead571';

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
    console: { warn() {}, error() {}, log() {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key) || null,
      setProperty: (key, value) => properties.set(key, value),
      deleteProperty: key => properties.delete(key),
      getProperties: () => Object.fromEntries(properties)
    }) },
    authHash_: value => crypto.createHash('sha256').update(String(value)).digest('hex'),
    normalizeEmail_: value => String(value || '').trim().toLowerCase(),
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
  assert.equal(app.ctx.recordDashboardVisit_(' DOCENT@Voorbeeld.nl ', false, VISIT_A), true);
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
  assert.equal(app.ctx.recordDashboardVisit_('gast@voorbeeld.nl', true, VISIT_B), true);
  assert.equal(app.insertions, 1);
  assert.equal(app.rows.length, 3);
  assert.equal(app.rows[2][2], 'E-mailcode');
});

test('een onjuist tabblad, lock of ontbrekende rechten blokkeert dashboard niet', () => {
  const wrong = harness({ rows: [['Andere gegevens', 'Niet overschrijven']] });
  assert.equal(wrong.ctx.recordDashboardVisit_('docent@voorbeeld.nl', false, VISIT_A), false);
  assert.equal(wrong.rows.length, 1);
  const locked = harness();
  locked.setLockBusy(true);
  assert.equal(locked.ctx.recordDashboardVisit_('docent@voorbeeld.nl', false, VISIT_A), false);
  assert.equal(locked.opens, 0);
  const unavailable = harness({ failOpen: true });
  assert.equal(unavailable.ctx.recordDashboardVisit_('docent@voorbeeld.nl', false, VISIT_A), false);
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
  assert.equal(app.ctx.recordDashboardVisit_('nieuw@voorbeeld.nl', false, VISIT_A), true);
  assert.equal(app.deletions, 1);
  assert.equal(app.rows.length, 3);
  assert.equal(app.rows[1][1], 'recent@voorbeeld.nl');
  assert.equal(app.rows[2][1], 'nieuw@voorbeeld.nl');
});

test('een nieuwe sessie wordt eenmaal geregistreerd, refresh en bronverversing niet', () => {
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
  app.ctx.publicRecord_ = record => record;
  app.ctx.publicSourceStatus_ = source => source;
  const opened = app.ctx.getDashboardData('', VISIT_A);
  assert.deepEqual(JSON.parse(JSON.stringify(opened.records)), []);
  assert.equal(app.rows.length, 2);

  // Browser-refresh met dezelfde tabsessie, ook bij herhaaldelijk data ophalen.
  app.ctx.getDashboardData('', VISIT_A);
  app.ctx.getDashboardData('', VISIT_A);
  assert.equal(app.rows.length, 2);
  app.ctx.refreshDashboardData('');
  assert.equal(app.rows.length, 2);

  // Nieuw tabblad: wel een nieuwe sessie, zonder de andere cijfers te wijzigen.
  app.ctx.getDashboardData('', VISIT_B);
  assert.equal(app.rows.length, 3);
  assert.equal(app.rows[2][2], 'Google-account');

  // E-mailcode-sessies zijn gekoppeld aan het echte (gehashte) sessietoken.
  app.ctx.getDashboardData('token', VISIT_A);
  app.ctx.getDashboardData('token', VISIT_B);
  assert.equal(app.rows.length, 4);
  assert.equal(app.rows[3][2], 'E-mailcode');
  app.ctx.getDashboardData('nieuwe-token', VISIT_A);
  assert.equal(app.rows.length, 5);

  // Zonder tabsessie is Google-verkeer niet als login aan te merken.
  app.ctx.getDashboardData('');
  assert.equal(app.rows.length, 5);
});

test('e-mailcode-dashboardpagina van niet-Gmailgebruiker logt direct en nooit dubbel', () => {
  const app = harness();
  vm.runInContext(fs.readFileSync('src/Code.gs', 'utf8'), app.ctx);
  const email = 'collega@outlook.com';
  const token = 'a'.repeat(64);
  app.ctx.emailSession_ = () => ({ email, expiresAt: Date.now() + 3600000 });
  app.ctx.dashboardPage_ = () => ({ getContent: () => '<main id="dashboard"></main>' });
  app.ctx.requireAccess_ = () => email;
  app.ctx.canViewFinancials_ = () => false;
  app.ctx.liveDashboardSnapshot_ = () => ({
    snapshot: { records: [], sources: [], updatedAt: '2026-11-10T12:00:00Z', complete: true },
    source: 'cache', storage: 'used'
  });
  app.ctx.snapshotCacheEnabled_ = () => true;
  app.ctx.publicRecord_ = record => record;
  app.ctx.publicSourceStatus_ = source => source;

  const page = app.ctx.getDashboardPage(token);
  assert.match(page.html, /dashboard/);
  assert.equal(app.rows.length, 2);
  assert.equal(app.rows[1][1], email);
  assert.equal(app.rows[1][2], 'E-mailcode');

  app.ctx.getDashboardData(token, VISIT_A);
  app.ctx.getDashboardPage(token); // Browser-refresh van dezelfde gast.
  assert.equal(app.rows.length, 2);

  const secondToken = 'b'.repeat(64);
  app.ctx.getDashboardPage(secondToken); // Nieuwe echte login via e-mailcode.
  assert.equal(app.rows.length, 3);
  assert.equal(app.rows[2][1], email);
});

test('diagnose in gastproject herkent een ontbrekende of bruikbare stats-koppeling', () => {
  const missing = harness({ properties: [] });
  missing.ctx.activeUserEmail_ = () => 'beheerder@voorbeeld.nl';
  missing.ctx.effectiveUserEmail_ = () => 'beheerder@voorbeeld.nl';
  vm.runInContext("APP_CONFIG.allowedEmails[0] = 'beheerder@voorbeeld.nl'", missing.ctx);
  const absent = missing.ctx.checkUsageStatsSetup();
  assert.equal(absent.ok, false);
  assert.equal(absent.code, 'STATS_SPREADSHEET_NOT_CONFIGURED');
  assert.equal(absent.action.includes('DIT Apps Script-project'), true);

  const configured = harness();
  configured.ctx.activeUserEmail_ = () => 'beheerder@voorbeeld.nl';
  configured.ctx.effectiveUserEmail_ = () => 'beheerder@voorbeeld.nl';
  vm.runInContext("APP_CONFIG.allowedEmails[0] = 'beheerder@voorbeeld.nl'", configured.ctx);
  const checked = configured.ctx.checkUsageStatsSetup();
  assert.equal(checked.ok, true);
  assert.equal(checked.code, 'STATS_CONFIGURED');
  assert.equal(checked.sheetFound, false);
  assert.equal(configured.rows.length, 0); // Diagnostiek schrijft geen bezoek.
});

test('idempotentie gebruikt server-side sessiesleutel en schrapt oude markeringen', () => {
  const app = harness();
  assert.equal(app.ctx.recordDashboardVisit_('docent@voorbeeld.nl', false, VISIT_A), true);
  assert.equal(app.ctx.recordDashboardVisit_('docent@voorbeeld.nl', false, VISIT_A), false);
  assert.equal(app.rows.length, 2);
  assert.equal(app.opens, 1); // De tweede poging raakt het spreadsheet niet.
  assert.equal(app.ctx.recordDashboardVisit_('docent@voorbeeld.nl', false, 'ongeldig'), false);
  assert.equal(app.rows.length, 2);
  const keys = Array.from(app.properties.keys()).filter(k => k.startsWith('WORKSHOPKOMPAS_STATS_VISIT:'));
  assert.equal(keys.length, 1);
  assert.doesNotMatch(keys[0], /docent@voorbeeld|d1442b9b/);

  app.properties.set('WORKSHOPKOMPAS_STATS_VISIT:verlopen', String(Date.now() - 200 * 86400000));
  app.properties.delete('WORKSHOPKOMPAS_STATS_LAST_CLEANUP');
  assert.equal(app.ctx.recordDashboardVisit_('docent@voorbeeld.nl', false, VISIT_B), true);
  assert.equal(app.properties.has('WORKSHOPKOMPAS_STATS_VISIT:verlopen'), false);
});
