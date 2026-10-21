const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const HEADERS = ['Aanvraag ID', 'Datum aanvraag', 'Schoolnaam', 'Workshopnaam', 'Gemeente / Regio', 'Aantal leerlingen', 'PO / VO', 'Definitieve datum'];
const ROW = ['A1', 46268, 'School', 'Robot', 'Gorinchem', 24, 'PO', '03-09-2026; 10-09-2026'];
const SOURCE = { name: 'Microsoft hub', type: 'microsoft', driveId: 'drive-secret', itemId: 'file-secret', tableName: 'Workshop data' };

function setup(handler, options = {}) {
  const values = new Map(Object.entries({ MS_TENANT_ID: 'tenant.example',
    MS_CLIENT_ID: '11111111-2222-3333-4444-555555555555', MS_GOOGLE_OWNER_EMAIL: 'jouw-account@voorbeeld.nl' }));
  const identity = values.get('MS_TENANT_ID') + ':' + values.get('MS_CLIENT_ID');
  values.set('MS_TOKENS', JSON.stringify({ identity, accessToken: 'access-secret', refreshToken: 'refresh-secret',
    expiresAt: options.expired ? 0 : Date.now() + 3600000 }));
  const calls = [], logs = [];
  let held = false;
  const ctx = vm.createContext({ Date, Set, console: { log: x => logs.push(x), error: x => logs.push(x) },
    Session: { getActiveUser: () => ({ getEmail: () => options.denied ? '' : 'jouw-account@voorbeeld.nl' }),
      getEffectiveUser: () => ({ getEmail: () => options.wrongOwner ? 'other@example.nl' : 'jouw-account@voorbeeld.nl' }),
      getScriptTimeZone: () => 'Europe/Amsterdam' },
    Utilities: { getUuid: () => '12345678-abcd', formatDate: date => date.toISOString().slice(0, 10) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => values.get(k) || null,
      setProperty: (k, v) => values.set(k, v), deleteProperty: k => values.delete(k) }) },
    LockService: { getUserLock: () => ({ tryLock: () => { if (options.busy) return false; assert.equal(held, false); held = true; return true; },
      releaseLock: () => { held = false; } }) },
    UrlFetchApp: { fetch(url, opts) {
      calls.push({ url, opts });
      const reply = handler(url, opts, { values, held });
      return { getResponseCode: () => reply.status || 200, getContentText: () => reply.raw || JSON.stringify(reply.body) };
    } }
  });
  for (const file of ['Config.gs', 'Data.gs', 'Cache.gs', 'Auth.gs', 'Code.gs', 'Microsoft.gs']) {
    vm.runInContext(fs.readFileSync('src/' + file, 'utf8'), ctx);
  }
  return { ctx, values, calls, logs, locked: () => held, identity };
}
const goodGraph = url => url.endsWith('headerRowRange') ? { body: { values: [HEADERS] } } : { body: { value: [{ values: [ROW] }] } };

test('Microsoft-tabel gebruikt hetzelfde datamodel inclusief Excel-datums en meerdere lesdagen', () => {
  const { ctx, calls } = setup(goodGraph);
  const result = ctx.readSource_(SOURCE);
  assert.equal(result.status, 'ok');
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].students, 24);
  assert.match(result.records[0].requestedDate, /^2026-/);
  assert.deepEqual(Array.from(result.records[0].scheduledDates), ['2026-09-03', '2026-09-10']);
  assert.ok(calls[0].url.includes('Workshop%20data'));
  assert.ok(calls.every(call => call.opts.followRedirects === false));
  const publicJson = JSON.stringify(ctx.publicRecord_(result.records[0], false));
  assert.doesNotMatch(publicJson, /secret|requestId/);
});

test('paginering gebruikt top/skip en telt lege formuleachtige rijen niet als workshops', () => {
  const { ctx, calls } = setup(url => {
    if (url.endsWith('headerRowRange')) return { body: { values: [HEADERS] } };
    const rows = url.includes('$skip=0') ? Array.from({ length: 500 }, () => ({ values: [['', '', '', '', '', 0, '', '']] })) : [{ values: [ROW] }];
    return { body: { value: rows, '@odata.nextLink': 'https://evil.example/steal' } };
  });
  const result = ctx.readMicrosoftTable_(SOURCE);
  assert.equal(result.records.length, 1);
  assert.ok(calls[2].url.endsWith('$skip=500'));
  assert.ok(calls.every(call => !call.url.includes('evil.example')));
});

test('rijlimiet kapt af met een expliciete ondergrenswaarschuwing', () => {
  const { ctx } = setup(url => url.endsWith('headerRowRange') ? { body: { values: [HEADERS] } } :
    { body: { value: [{ values: [ROW] }, { values: [[...ROW.slice(0, 1).map(() => 'A2'), ...ROW.slice(1)]] }] } });
  ctx.sourceRowLimit_ = () => 1;
  const result = ctx.readMicrosoftTable_(SOURCE);
  assert.equal(result.records.length, 1);
  assert.equal(result.warnings.rowsTruncated, 1);
});

test('verlopen tokens worden onder lock vernieuwd en rotatie wordt opgeslagen', () => {
  const { ctx, values, calls, locked } = setup((url, opts, state) => {
    assert.equal(state.held, true);
    assert.equal(opts.payload.grant_type, 'refresh_token');
    return { body: { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 } };
  }, { expired: true });
  assert.equal(ctx.microsoftAccessToken_(), 'new-access');
  assert.equal(ctx.microsoftAccessToken_(), 'new-access');
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(values.get('MS_TOKENS')).refreshToken, 'new-refresh');
  assert.equal(locked(), false);
});

test('refresh zonder nieuw refresh token behoudt het bestaande token', () => {
  const { ctx, values } = setup(() => ({ body: { access_token: 'new', expires_in: 3600 } }), { expired: true });
  ctx.microsoftAccessToken_();
  assert.equal(JSON.parse(values.get('MS_TOKENS')).refreshToken, 'refresh-secret');
});

test('401 vernieuwt eenmaal; een blijvende fout wordt veilig afgevangen', () => {
  let count = 0;
  const { ctx, calls } = setup(url => url.includes('/token') ? { body: { access_token: 'retry', expires_in: 3600 } } :
    (++count === 1 ? { status: 401, body: { error: { message: 'secret' } } } : { body: { values: [HEADERS] } }));
  ctx.microsoftGraphGet_('/drives/d/items/i/workbook/tables/t/headerRowRange');
  assert.equal(calls.length, 3);
  assert.equal(calls[2].opts.headers.Authorization, 'Bearer retry');
});

test('Graph-, netwerk-, JSON- en throttlingfouten lekken geen providerdetails', () => {
  for (const handler of [() => { throw new Error('token-secret https://private'); },
    () => ({ raw: '<html>secret</html>' }), () => ({ status: 403, body: { error: { message: 'refresh-secret' } } }),
    () => ({ status: 429, body: { error: { message: 'secret' } } })]) {
    const { ctx, logs } = setup(handler);
    const result = ctx.readSource_(SOURCE);
    assert.equal(result.status, 'error');
    assert.equal(result.errorCode, 'SOURCE_READ_FAILED');
    assert.doesNotMatch(JSON.stringify(result) + logs.join(''), /refresh-secret|token-secret|https:\/\/private|file-secret/);
  }
});

test('Microsoft-uitval laat een onafhankelijke Google-bron beschikbaar', () => {
  const { ctx } = setup(() => ({ status: 403, body: {} }));
  ctx.readGoogleSheet_ = () => ({ records: [{ school: 'Google school' }], warnings: ctx.emptyWarnings_() });
  vm.runInContext(`APP_CONFIG.sources.splice(0, 2,
    { name: 'Google', spreadsheetId: 'id', sheetName: 'Workshops' }, ${JSON.stringify(SOURCE)});`, ctx);
  const result = ctx.readConfiguredSheets_();
  assert.equal(result.complete, false);
  assert.equal(result.records.length, 1);
  assert.equal(result.sources[0].status, 'ok');
  assert.equal(result.sources[1].status, 'error');
});

test('ontbrekende instellingen, verkeerde eigenaar en bezette lock geven geen Graph-aanroep', () => {
  for (const options of [{ wrongOwner: true }, { busy: true }]) {
    const { ctx, calls, locked } = setup(goodGraph, options);
    assert.throws(() => ctx.microsoftAccessToken_(), /MICROSOFT_/);
    assert.equal(calls.length, 0);
    assert.equal(locked(), false);
  }
  const { ctx, calls, values } = setup(goodGraph);
  values.delete('MS_CLIENT_ID');
  assert.throws(() => ctx.microsoftAccessToken_(), /SETUP_REQUIRED/);
  assert.equal(calls.length, 0);
  assert.equal(ctx.readSource_({ type: 'microsoft', name: 'Hub' }).status, 'not-configured');
  assert.equal(ctx.readSource_({ type: 'unknown', name: 'Hub' }).status, 'not-configured');
});

test('invalid_grant wist tokens en vraagt om opnieuw koppelen', () => {
  const { ctx, values, locked } = setup(() => ({ status: 400, body: { error: 'invalid_grant', error_description: 'private' } }), { expired: true });
  assert.throws(() => ctx.microsoftAccessToken_(), /RECONNECT_REQUIRED/);
  assert.equal(values.has('MS_TOKENS'), false);
  assert.equal(locked(), false);
});

test('device-aanmelding blijft in de editor en slaat alleen server-side tokens op', () => {
  const { ctx, values, logs } = setup(url => url.endsWith('devicecode') ?
    { body: { device_code: 'device-secret', user_code: 'ABCD', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 5 } } :
    { body: { access_token: 'connected', refresh_token: 'refresh', expires_in: 3600 } });
  ctx.beginMicrosoftConnection_();
  assert.match(logs.join(''), /ABCD/);
  assert.doesNotMatch(logs.join(''), /device-secret|access-secret/);
  assert.match(ctx.completeMicrosoftConnection_(), /Wacht/);
  const pending = JSON.parse(values.get('MS_PENDING_CONNECTION'));
  pending.nextPollAt = 0; values.set('MS_PENDING_CONNECTION', JSON.stringify(pending));
  assert.equal(ctx.completeMicrosoftConnection_(), 'Microsoft gekoppeld.');
  assert.equal(values.has('MS_PENDING_CONNECTION'), false);
  assert.equal(JSON.parse(values.get('MS_TOKENS')).accessToken, 'connected');
});

test('onbevoegde bezoeker kan de Microsoft-beheerfuncties niet uitvoeren', () => {
  const { ctx, calls } = setup(goodGraph, { denied: true });
  for (const name of ['beginMicrosoftConnection_', 'completeMicrosoftConnection_', 'disconnectMicrosoft_']) {
    assert.throws(() => ctx[name](), /Geen toegang/);
  }
  assert.equal(calls.length, 0);
});

test('Microsoft-identiteit en bronlocatie maken bestaande snapshots ongeldig', () => {
  const { ctx, values } = setup(goodGraph);
  vm.runInContext('APP_CONFIG.sources.push(' + JSON.stringify(SOURCE) + ')', ctx);
  const before = ctx.snapshotConfigVersion_();
  values.set('MS_CLIENT_ID', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.notEqual(ctx.snapshotConfigVersion_(), before);
  const after = ctx.snapshotConfigVersion_();
  vm.runInContext("APP_CONFIG.sources[2].tableName = 'Anders'", ctx);
  assert.notEqual(ctx.snapshotConfigVersion_(), after);
});

test('pending en slow_down respecteren de pollinterval zonder tokens te vervangen', () => {
  for (const error of ['authorization_pending', 'slow_down']) {
    const { ctx, values, identity } = setup(() => ({ status: 400, body: { error } }));
    values.set('MS_PENDING_CONNECTION', JSON.stringify({ identity, deviceCode: 'private',
      expiresAt: Date.now() + 60000, nextPollAt: 0, interval: 5 }));
    const before = values.get('MS_TOKENS');
    assert.match(ctx.completeMicrosoftConnection_(), /nog niet afgerond/);
    const pending = JSON.parse(values.get('MS_PENDING_CONNECTION'));
    assert.equal(pending.interval, error === 'slow_down' ? 10 : 5);
    assert.ok(pending.nextPollAt > Date.now());
    assert.equal(values.get('MS_TOKENS'), before);
  }
});

test('verlopen of geweigerde device-aanmelding wordt opgeruimd zonder eerdere koppeling te wissen', () => {
  for (const expired of [true, false]) {
    const { ctx, values, identity } = setup(() => ({ status: 400, body: { error: 'authorization_declined' } }));
    values.set('MS_PENDING_CONNECTION', JSON.stringify({ identity, deviceCode: 'private',
      expiresAt: expired ? 0 : Date.now() + 60000, nextPollAt: 0, interval: 5 }));
    const before = values.get('MS_TOKENS');
    assert.throws(() => ctx.completeMicrosoftConnection_(), /MICROSOFT_CONNECT_/);
    assert.equal(values.has('MS_PENDING_CONNECTION'), false);
    assert.equal(values.get('MS_TOKENS'), before);
  }
});

test('ongeldige Graph-structuren en externe paden worden afgewezen', () => {
  for (const body of [{ values: 'not a matrix' }, { values: [HEADERS], value: [{}] }]) {
    const { ctx } = setup(() => ({ body }));
    assert.throws(() => ctx.readMicrosoftTable_(SOURCE), /MICROSOFT_INVALID_/);
  }
  const { ctx, calls } = setup(goodGraph);
  assert.throws(() => ctx.microsoftGraphGet_('https://evil.example'), /INVALID_PATH/);
  assert.equal(calls.length, 0);
});

test('Google-only configuratie gebruikt geen Microsoft-opslag of HTTP', () => {
  const { ctx, calls } = setup(goodGraph);
  ctx.PropertiesService = { getScriptProperties: () => { throw new Error('Microsoft-opslag mag niet worden gebruikt'); } };
  ctx.readGoogleSheet_ = () => ({ records: [], warnings: ctx.emptyWarnings_() });
  assert.equal(typeof ctx.snapshotConfigVersion_(), 'string');
  assert.equal(ctx.readConfiguredSheets_().records.length, 0);
  assert.equal(calls.length, 0);
});

test('ontkoppelen neemt eerst de snapshotlock en wist tokens en cache', () => {
  const { ctx, values } = setup(goodGraph);
  let scriptHeld = false, removed = '';
  ctx.LockService.getScriptLock = () => ({ tryLock: () => { scriptHeld = true; return true; }, releaseLock: () => { scriptHeld = false; } });
  ctx.CacheService = { getScriptCache: () => ({ remove: key => { assert.equal(scriptHeld, true); removed = key; } }) };
  values.set('MS_PENDING_CONNECTION', '{}');
  ctx.disconnectMicrosoft_();
  assert.equal(values.has('MS_TOKENS'), false);
  assert.equal(values.has('MS_PENDING_CONNECTION'), false);
  assert.match(removed, /manifest$/);
  assert.equal(scriptHeld, false);
});

test('corrupte tokenopslag kan geen tokenfragment in het serverlog laten belanden', () => {
  const { ctx, values, logs } = setup(goodGraph);
  values.set('MS_TOKENS', '{access_token: sensitive-fragment}');
  assert.equal(ctx.readSource_(SOURCE).status, 'error');
  assert.doesNotMatch(logs.join(''), /sensitive-fragment/);
  assert.match(logs.join(''), /MICROSOFT_INTERNAL_FAILED/);
});

test('fysieke scanlimiet beëindigt grote lege tabellen met waarschuwing', () => {
  const { ctx, calls } = setup(url => url.endsWith('headerRowRange') ? { body: { values: [HEADERS] } } :
    { body: { value: Array.from({ length: 500 }, () => ({ values: [[]] })) } });
  const result = ctx.readMicrosoftTable_(SOURCE);
  assert.equal(result.records.length, 0);
  assert.equal(result.warnings.rowsTruncated, 1);
  assert.equal(calls.length, 41);
});
