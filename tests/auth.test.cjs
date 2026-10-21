const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { setup } = require('./helpers/auth-service.cjs');


function login(app) {
  const challenge = app.ctx.requestEmailCode('gast@microsoft.example');
  return app.ctx.verifyEmailCode(challenge.challengeId, app.code()).token;
}

test('niet-ingelogde bezoekers krijgen alleen toegangspagina, nooit Index of data', () => {
  const app = setup();
  const html = app.ctx.doGet().getContent();
  assert.deepEqual(app.templates, ['Access']);
  assert.match(html, /id="emailAccessForm"/);
  assert.doesNotMatch(html, /id="dashboard"|id="kpis"|id="sourceCards"|id="municipalityData"/);
  assert.throws(() => app.ctx.getDashboardData(), /ACCESS_REQUIRED/);
  assert.throws(() => app.ctx.refreshDashboardData(), /ACCESS_REQUIRED/);
  assert.throws(() => app.ctx.openGoogleDashboard(), /ACCESS_REQUIRED/);
  assert.throws(() => app.ctx.include('Client'), /ACCESS_REQUIRED/);
  assert.throws(() => app.ctx.getDashboardPage('gast@microsoft.example'), /ACCESS_REQUIRED/);
});

test('e-mailtoegang staat standaard uit en een lege of uitgeschakelde lijst geeft geen code', () => {
  const config = fs.readFileSync('src/Config.gs', 'utf8');
  assert.match(config, /emailAccess:[\s\S]*?enabled: false,[\s\S]*?allowedEmails: \[\]/);
  const app = setup({ enabled: false });
  assert.doesNotMatch(app.ctx.doGet().getContent(), /id="emailAccessForm"/);
  app.ctx.requestEmailCode('gast@microsoft.example');
  assert.equal(app.mails.length, 0);
  assert.equal(app.values.size, 0);
});

test('alleen exacte allowlist-adressen krijgen mail; antwoord maakt lidmaatschap niet bekend', () => {
  const app = setup();
  const denied = app.ctx.requestEmailCode('ander@microsoft.example');
  const allowed = app.ctx.requestEmailCode('  GAST@MICROSOFT.EXAMPLE  ');
  assert.equal(denied.message, allowed.message);
  assert.equal(denied.codeMinutes, allowed.codeMinutes);
  assert.equal(denied.challengeId.length, 64);
  assert.equal(app.mails.length, 1);
  assert.equal(app.mails[0].to, 'gast@microsoft.example');
  app.ctx.requestEmailCode('gast@microsoft.example,ander@example.nl');
  assert.equal(app.mails.length, 1);
  assert.throws(() => app.ctx.verifyEmailCode(denied.challengeId, app.code()), /ongeldig of verlopen/);
});

test('codes zijn eenmalig, sessies duren acht uur en financiële toegang is apart toegestaan', () => {
  const app = setup();
  const challenge = app.ctx.requestEmailCode('gast@microsoft.example');
  const code = app.code();
  const { token } = app.ctx.verifyEmailCode(challenge.challengeId, code);
  assert.equal(token.length, 64);
  assert.throws(() => app.ctx.verifyEmailCode(challenge.challengeId, code), /ongeldig of verlopen/);
  assert.equal(app.ctx.requireAccess_(token), 'gast@microsoft.example');
  assert.equal(app.ctx.getSessionStatus(token).expiresInMs, 8 * 3600000);
  const payload = app.ctx.getDashboardData(token);
  assert.equal(payload.records.length, 10);
  assert.equal(payload.permissions.canViewFinancials, false);
  assert.equal(Object.hasOwn(payload.records[0], 'invoiceAmount'), false);
  vm.runInContext("APP_CONFIG.financialAllowedEmails.push('gast@microsoft.example')", app.ctx);
  assert.equal(app.ctx.getDashboardData(token).permissions.canViewFinancials, true);
  const page = app.ctx.getDashboardPage(token);
  assert.match(page.html, /id="dashboard"/);
  assert.ok(!page.html.includes(token));
  assert.ok(!page.html.includes('gast@microsoft.example'));
  assert.ok(!JSON.stringify(Array.from(app.values.values())).includes(token));
  assert.ok(!JSON.stringify(Array.from(app.values.values())).includes(code));
  app.advance(8 * 3600000);
  assert.throws(() => app.ctx.getDashboardData(token), /ACCESS_REQUIRED/);
  assert.throws(() => app.ctx.getDashboardPage(token), /ACCESS_REQUIRED/);
  assert.throws(() => app.ctx.include('Client', token), /ACCESS_REQUIRED/);
});

test('codes verlopen na tien minuten en vijf foute pogingen blokkeren de code', () => {
  const app = setup();
  let challenge = app.ctx.requestEmailCode('gast@microsoft.example');
  let code = app.code();
  app.advance(10 * 60000);
  assert.throws(() => app.ctx.verifyEmailCode(challenge.challengeId, code), /ongeldig of verlopen/);
  challenge = app.ctx.requestEmailCode('gast@microsoft.example');
  code = app.code();
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.throws(() => app.ctx.verifyEmailCode(challenge.challengeId, wrong), /ongeldig of verlopen/);
  assert.throws(() => app.ctx.verifyEmailCode(challenge.challengeId, code), /ongeldig of verlopen/);
});

test('opnieuw versturen vervangt de oude code en de mailfrequentie wordt server-side begrensd', () => {
  const app = setup();
  const first = app.ctx.requestEmailCode('gast@microsoft.example');
  const firstCode = app.code();
  const retry = app.ctx.requestEmailCode('gast@microsoft.example');
  assert.equal(retry.challengeId, first.challengeId);
  assert.equal(app.mails.length, 1);
  app.advance(60000);
  const second = app.ctx.requestEmailCode('gast@microsoft.example');
  assert.notEqual(second.challengeId, first.challengeId);
  assert.throws(() => app.ctx.verifyEmailCode(first.challengeId, firstCode), /ongeldig of verlopen/);
  for (let i = 0; i < 10; i++) { app.advance(60000); app.ctx.requestEmailCode('gast@microsoft.example'); }
  assert.equal(app.mails.length, 5);
  app.advance(3600000);
  app.ctx.requestEmailCode('gast@microsoft.example');
  assert.equal(app.mails.length, 6);
});

test('uitloggen en verwijderen uit de e-maillijst trekken de sessie op de server in', () => {
  const app = setup();
  const token = login(app);
  app.ctx.logoutDashboard(token);
  assert.throws(() => app.ctx.getDashboardData(token), /ACCESS_REQUIRED/);
  app.advance(60000);
  const next = login(app);
  vm.runInContext('APP_CONFIG.emailAccess.allowedEmails.length = 0', app.ctx);
  assert.throws(() => app.ctx.getSessionStatus(next), /ACCESS_REQUIRED/);
  assert.throws(() => app.ctx.refreshDashboardData(next), /ACCESS_REQUIRED/);
  assert.equal(app.ctx.logoutDashboard('ongeldig'), true);
});

test('verkeerde, vervalste en beschadigde sessies geven geen toegang', () => {
  const app = setup();
  for (const token of ['', null, {}, 'gast@microsoft.example', '0'.repeat(64)]) {
    assert.throws(() => app.ctx.getDashboardPage(token), /ACCESS_REQUIRED/);
  }
  const token = login(app);
  const key = Array.from(app.values.keys()).find(key => key.includes(':session:'));
  app.values.set(key, '{ kapot');
  assert.throws(() => app.ctx.getDashboardData(token), /ACCESS_REQUIRED/);
});

test('een toegestane Google-gebruiker blijft werken zonder e-mail of gastinstellingen', () => {
  const app = setup({ googleEmail: 'jouw-account@voorbeeld.nl', enabled: false });
  assert.match(app.ctx.doGet().getContent(), /id="dashboard"/);
  assert.equal(app.ctx.getDashboardData().records.length, 10);
  assert.equal(app.mails.length, 0);
});

test('lock- en mailproblemen geven geen bruikbare code of technische details', () => {
  const blocked = setup({ lock: false });
  assert.throws(() => blocked.ctx.requestEmailCode('gast@microsoft.example'), /even druk/);
  for (const option of [{ quota: 0 }, { mailFailure: true }]) {
    const app = setup(option);
    assert.throws(() => app.ctx.requestEmailCode('gast@microsoft.example'), error => {
      assert.doesNotMatch(error.message, /Quota|Geheime providerfout|gast@/);
      return true;
    });
    assert.equal(Array.from(app.values.keys()).filter(key => key.includes(':challenge:')).length, 0);
  }
});

test('projectbrede mailgrens geldt ook wanneer ieder adres maar één code aanvraagt', () => {
  const app = setup();
  const emails = Array.from({ length: 31 }, (_, index) => 'gast' + index + '@microsoft.example');
  vm.runInContext('APP_CONFIG.emailAccess.allowedEmails.push(...' + JSON.stringify(emails) + ')', app.ctx);
  emails.forEach(email => app.ctx.requestEmailCode(email));
  assert.equal(app.mails.length, 30);
  app.advance(3600000);
  app.ctx.requestEmailCode(emails[30]);
  assert.equal(app.mails.length, 31);
});

test('een ongeldig gasttoken valt nooit terug op een eventueel toegestaan Google-account', () => {
  const app = setup({ googleEmail: 'jouw-account@voorbeeld.nl' });
  assert.equal(app.ctx.getDashboardData().records.length, 10);
  assert.throws(() => app.ctx.getDashboardData('0'.repeat(64)), /ACCESS_REQUIRED/);
});

test('ontbrekend mailrecht krijgt een herstelbare foutcode en dezelfde referentie in het serverlog', () => {
  const app = setup({ quotaError: 'You do not have permission to call MailApp.getRemainingDailyQuota. Required permissions: https://www.googleapis.com/auth/script.send_mail' });
  assert.throws(() => app.ctx.requestEmailCode('gast@microsoft.example'), error => {
    assert.match(error.message, /EMAIL_MAIL_PERMISSION_REQUIRED/);
    assert.match(error.message, /gastmanifest.*mailautorisatie/);
    const reference = error.message.match(/Referentie: ([A-F0-9]{8})/)[1];
    assert.match(app.logs[0], new RegExp('\\[' + reference + '\\]'));
    assert.match(app.logs[0], /phase=quota.*MailApp\.getRemainingDailyQuota.*script\.send_mail/);
    assert.doesNotMatch(error.message, /Required permissions|MailApp\.getRemainingDailyQuota/);
    return true;
  });
  assert.equal(app.mails.length, 0);
  assert.equal(app.values.size, 0);
});

test('geen mailquotum en een verzendfout worden afzonderlijk herkenbaar zonder privédetails', () => {
  for (const [options, expected, phase] of [
    [{ quota: 0 }, 'EMAIL_MAIL_QUOTA_EXCEEDED', 'quota'],
    [{ mailFailure: 'Providerfout voor gast@microsoft.example code 123456 sleutel ' + 'a'.repeat(64) }, 'EMAIL_CODE_SEND_FAILED', 'send']
  ]) {
    const app = setup(options);
    assert.throws(() => app.ctx.requestEmailCode('gast@microsoft.example'), new RegExp(expected));
    assert.match(app.logs[0], new RegExp('phase=' + phase + ' code=' + expected));
    assert.doesNotMatch(app.logs.join('\n'), /gast@microsoft\.example|123456|a{64}/);
    assert.equal(app.values.size, 0);
  }
});

test('herhalen na een mislukte verzending blijft falen en doet niet alsof een code is verstuurd', () => {
  const options = { mailFailure: true };
  const app = setup(options);
  for (let index = 0; index < 2; index++) {
    assert.throws(() => app.ctx.requestEmailCode('gast@microsoft.example'), /EMAIL_CODE_SEND_FAILED/);
  }
  assert.equal(app.logs.length, 2);
  assert.equal(app.mails.length, 0);
  assert.equal(app.values.size, 0);
  options.mailFailure = false;
  const challenge = app.ctx.requestEmailCode('gast@microsoft.example');
  assert.equal(app.mails.length, 1);
  assert.ok(app.ctx.verifyEmailCode(challenge.challengeId, app.code()).token);
});

test('een mislukte herverzending houdt de eerdere geldige code en verzendteller intact', () => {
  const options = {};
  const app = setup(options);
  const first = app.ctx.requestEmailCode('gast@microsoft.example');
  const code = app.code();
  const before = JSON.stringify(Array.from(app.values.entries()));
  app.advance(60000);
  options.mailFailure = true;
  assert.throws(() => app.ctx.requestEmailCode('gast@microsoft.example'), /EMAIL_CODE_SEND_FAILED/);
  assert.equal(JSON.stringify(Array.from(app.values.entries())), before);
  assert.ok(app.ctx.verifyEmailCode(first.challengeId, code).token);
});

test('mailcontrole voor de editor vraagt geen code aan en vereist bestaande Google-toegang', () => {
  const app = setup({ googleEmail: 'jouw-account@voorbeeld.nl' });
  const result = app.ctx.checkEmailAccessSetup();
  assert.equal(result.mailPermissionGranted, true);
  assert.equal(result.remainingDailyQuota, 100);
  assert.equal(result.emailAccessEnabled, true);
  assert.equal(result.allowedAddressesConfigured, true);
  assert.equal(app.values.size, 0);
  assert.equal(app.mails.length, 0);
  assert.match(app.logs[0], /E-mailcontrole geslaagd/);
  assert.doesNotMatch(app.logs[0], /@/);
  const denied = setup();
  assert.throws(() => denied.ctx.checkEmailAccessSetup(), /ACCESS_REQUIRED/);
  const permissionMissing = setup({ googleEmail: 'jouw-account@voorbeeld.nl', quotaError: 'Authorization is required' });
  assert.throws(() => permissionMissing.ctx.checkEmailAccessSetup(), /EMAIL_MAIL_PERMISSION_REQUIRED/);
});

test('toegestane Hotmail-adressen volgen dezelfde e-mailcodeflow', () => {
  const app = setup();
  vm.runInContext("APP_CONFIG.emailAccess.allowedEmails.push('voorbeeld@hotmail.com')", app.ctx);
  const challenge = app.ctx.requestEmailCode('voorbeeld@hotmail.com');
  assert.equal(app.mails[0].to, 'voorbeeld@hotmail.com');
  const { token } = app.ctx.verifyEmailCode(challenge.challengeId, app.code());
  assert.equal(app.ctx.requireAccess_(token), 'voorbeeld@hotmail.com');
});
