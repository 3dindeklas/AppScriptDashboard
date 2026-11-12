const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const VISIT_A = 'd1442b9b-06e4-44c8-b5da-0aaf72ead570';
const VISIT_B = 'd1442b9b-06e4-44c8-b5da-0aaf72ead571';

function harness(options = {}) {
  const rows = options.rows ? options.rows.map(row => row.slice()) : [];
  let now = new Date('2026-11-12T12:00:00Z');
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
    static now() { return now.getTime(); }
    static [Symbol.hasInstance](value) { return value instanceof Date; }
  }
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
    getLastColumn: () => Math.max(0, ...rows.map(row => row.length)),
    getRange(row, column, count = 1, columns = 1) {
      return {
        getValues: () => Array.from({ length: count }, (unused, index) =>
          Array.from({ length: columns }, (unused2, col) =>
            rows[row - 1 + index] ? rows[row - 1 + index][column - 1 + col] : undefined)),
        setValues(values) {
          values.forEach((cells, i) => {
            const target = rows[row - 1 + i] ||= [];
            cells.forEach((value, j) => { target[column - 1 + j] = value; });
          });
        },
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
    Date: Clock,
    Utilities: { formatDate: date => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit'}).format(date) },
    console: { warn() {}, error() {}, log() {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key) || null,
      setProperty: (key, value) => properties.set(key, value),
      deleteProperty: key => properties.delete(key),
      getProperties: () => Object.fromEntries(properties)
    }) },
    authHash_: value => crypto.createHash('sha256').update(String(value)).digest('hex'),
    normalizeEmail_: value => String(value || '').trim().toLowerCase(),
    SpreadsheetApp: { flush() {}, openById: id => {
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
    get deletions() { return deletions; }, setLockBusy(value) { lockBusy = value; }, setNow(value) { now = new Date(value); } };
}

test('eerste opening maakt verborgen __stats-tabblad en schrijft uitsluitend minimale informatie', () => {
  const app = harness();
  assert.equal(app.ctx.recordDashboardVisit_(' DOCENT@Voorbeeld.nl ', false, VISIT_A), true);
  assert.equal(app.insertions, 1);
  assert.equal(app.hidden, true);
  assert.deepEqual(Array.from(app.rows[0]), [
    'Tijdstip', 'Gebruiker (e-mailadres)', 'Toegang', 'Gebeurtenis', 'Dag', 'Bezoeken', 'Filterwijzigingen', 'Laatste activiteit'
  ]);
  assert.equal(app.rows[1][0] instanceof Date, true);
  assert.deepEqual(Array.from(app.rows[1].slice(1, 7)), [
    'docent@voorbeeld.nl', 'Google-account', 'Dagtotalen', '2026-11-12', 1, 0
  ]);
  assert.equal(app.formatCalls[1].value, 'dd-mm-yyyy hh:mm:ss');
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
  const old = new Date('2026-03-01T00:00:00Z');
  const recent = new Date('2026-11-02T00:00:00Z');
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
  assert.equal(app.rows.length, 2);
  assert.equal(app.rows[1][5], 2);

  // E-mailcode-sessies zijn gekoppeld aan het echte (gehashte) sessietoken.
  app.ctx.getDashboardData('token', VISIT_A);
  app.ctx.getDashboardData('token', VISIT_B);
  assert.equal(app.rows.length, 3);
  assert.equal(app.rows[2][2], 'E-mailcode');
  assert.equal(app.rows[2][5], 1);
  app.ctx.getDashboardData('nieuwe-token', VISIT_A);
  assert.equal(app.rows.length, 3);
  assert.equal(app.rows[2][5], 2);

  // Zonder tabsessie is Google-verkeer niet als login aan te merken.
  app.ctx.getDashboardData('');
  assert.equal(app.rows.length, 3);
  assert.equal(app.rows[2][5], 2);
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
  assert.equal(app.rows.length, 2);
  assert.equal(app.rows[1][5], 2);
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

  app.properties.set('WORKSHOPKOMPAS_STATS_VISIT:verlopen', String(Date.parse('2026-03-01T00:00:00Z')));
  app.properties.delete('WORKSHOPKOMPAS_STATS_LAST_CLEANUP');
  assert.equal(app.ctx.recordDashboardVisit_('docent@voorbeeld.nl', false, VISIT_B), true);
  assert.equal(app.properties.has('WORKSHOPKOMPAS_STATS_VISIT:verlopen'), false);
});


test('Amsterdamse daggrens telt dezelfde sessie pas na lokale middernacht opnieuw', () => {
  const app = harness();
  app.setNow('2026-11-12T22:59:00Z');
  assert.equal(app.ctx.recordDashboardVisit_('gast@voorbeeld.nl', true, VISIT_A), true);
  assert.equal(app.ctx.recordDashboardVisit_('gast@voorbeeld.nl', true, VISIT_A), false);
  app.setNow('2026-11-12T23:00:00Z');
  assert.equal(app.ctx.recordDashboardVisit_('gast@voorbeeld.nl', true, VISIT_A), true);
  assert.deepEqual(app.rows.slice(1).map(row => Array.from(row.slice(4, 7))), [
    ['2026-11-12', 1, 0], ['2026-11-13', 1, 0]
  ]);
});

test('filteractie is geauthenticeerd en verandert nooit de bezoekenteller', () => {
  const app = harness();
  vm.runInContext(fs.readFileSync('src/Code.gs', 'utf8'), app.ctx);
  app.ctx.requireAccess_ = token => {
    if (token !== 'valid') throw new Error('ACCESS_REQUIRED');
    return 'collega@outlook.com';
  };
  assert.throws(() => app.ctx.trackDashboardFilterChange('invalid'), /ACCESS_REQUIRED/);
  assert.equal(app.rows.length, 0);
  assert.equal(app.ctx.recordDashboardVisit_('collega@outlook.com', true, VISIT_A), true);
  assert.equal(app.ctx.trackDashboardFilterChange('valid'), true);
  assert.equal(app.ctx.trackDashboardFilterChange('valid'), true);
  assert.deepEqual(Array.from(app.rows[1].slice(4, 7)), ['2026-11-12', 1, 2]);
  app.setNow('2026-11-13T10:00:00Z');
  assert.equal(app.ctx.trackDashboardFilterChange('valid'), true);
  assert.deepEqual(Array.from(app.rows[2].slice(4, 7)), ['2026-11-13', 0, 1]);
});

test('bestaande bezoekregels blijven intact en vreemde uitbreidingen worden niet overschreven', () => {
  const headers = ['Tijdstip', 'Gebruiker (e-mailadres)', 'Toegang', 'Gebeurtenis'];
  const old = [new Date('2026-11-11T10:00:00Z'), 'docent@voorbeeld.nl', 'Google-account', 'Dashboard geopend'];
  const app = harness({rows: [headers, old]});
  assert.equal(app.ctx.recordFilterChange_('docent@voorbeeld.nl', false), true);
  assert.deepEqual(app.rows[1], old);
  assert.deepEqual(Array.from(app.rows[0].slice(4)), ['Dag', 'Bezoeken', 'Filterwijzigingen', 'Laatste activiteit']);
  const unrelated = harness({ rows: [headers, [...old, 'eigen data']] });
  assert.equal(unrelated.ctx.recordFilterChange_('docent@voorbeeld.nl', false), false);
  assert.equal(unrelated.rows[1][4], 'eigen data');
});


test('laatste activiteit beweegt mee met getelde acties, eerste tijdstip blijft staan', () => {
  const app = harness();
  const email = 'gast@voorbeeld.nl';
  assert.equal(app.ctx.recordDashboardVisit_(email, true, VISIT_A), true);
  const first = app.rows[1][0].toISOString();
  assert.equal(app.rows[1][7].toISOString(), first);
  app.setNow('2026-11-12T13:00:00Z');
  assert.equal(app.ctx.recordDashboardVisit_(email, true, VISIT_A), false);
  assert.equal(app.rows[1][7].toISOString(), first);
  assert.equal(app.ctx.recordFilterChange_(email, true), true);
  assert.equal(app.rows[1][7].toISOString(), '2026-11-12T13:00:00.000Z');
  app.setNow('2026-11-12T14:00:00Z');
  assert.equal(app.ctx.recordDashboardVisit_(email, true, VISIT_B), true);
  assert.equal(app.rows[1][0].toISOString(), first);
  assert.equal(app.rows[1][7].toISOString(), '2026-11-12T14:00:00.000Z');
  assert.deepEqual(Array.from(app.rows[1].slice(5, 7)), [2, 1]);
});

test('bestaande dagtotalen krijgen een nieuwe kolom zonder verzonnen tijdstippen', () => {
  const headers = ['Tijdstip', 'Gebruiker (e-mailadres)', 'Toegang', 'Gebeurtenis', 'Dag', 'Bezoeken', 'Filterwijzigingen'];
  const previous = [new Date('2026-11-11T11:00:00Z'), 'gast@voorbeeld.nl', 'E-mailcode', 'Dagtotalen', '2026-11-11', 1, 2];
  const app = harness({ rows: [headers, previous] });
  assert.equal(app.ctx.recordFilterChange_('gast@voorbeeld.nl', true), true);
  assert.equal(app.rows[0][7], 'Laatste activiteit');
  assert.deepEqual(app.rows[1], previous);
});
