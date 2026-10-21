const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { setup, SOURCE, HEADERS } = require('./helpers/excel-import-service.cjs');

const byId = (report, id) => report.checks.find(check => check.id === id);

test('diagnose controleert autorisatie, services en importtoegang zonder echte tabbladen te wijzigen', () => {
  const { ctx, target, removedFiles, logs, props } = setup();
  const report = ctx.checkAppSetup();
  assert.equal(report.ok, true);
  assert.equal(report.errors, 0);
  assert.equal(byId(report, 'drive_create').status, 'ok');
  assert.equal(byId(report, 'sheet_write').status, 'ok');
  assert.equal(byId(report, 'drive_cleanup').status, 'ok');
  assert.equal(byId(report, 'source_1').status, 'ok');
  assert.equal(byId(report, 'download_1').status, 'ok');
  assert.equal(target.sheets.length, 0);
  assert.deepEqual(removedFiles, ['temporary-id']);
  assert.equal(props.size, 0);
  assert.match(logs[0], /APP_CHECK_START/);
  assert.match(logs.at(-1), /APP_CHECK_DONE/);
});

test('authorizeApp vraagt alle manifestscopes en verwijst naar de volgende editoractie', () => {
  const { ctx, authorizationCalls, logs } = setup(); ctx.authorizeApp();
  assert.deepEqual(authorizationCalls, ['FULL']);
  assert.match(logs.join(''), /checkAppSetup/);
  assert.match(logs.join(''), /refreshExcelImports/);
});

test('scopefouten noemen het ontbrekende manifestrecht en breken overige controles niet af', () => {
  const { ctx } = setup({ authRequired: true, grantedScopes: ['https://www.googleapis.com/auth/userinfo.email'] });
  const report = ctx.checkAppSetup();
  assert.equal(byId(report, 'authorization').code, 'AUTHORIZATION_REQUIRED');
  assert.equal(byId(report, 'scope_spreadsheets').code, 'SCOPE_MISSING');
  assert.match(byId(report, 'scope_drive.file').action, /drive.file/);
  assert.equal(byId(report, 'properties').status, 'ok');
  assert.equal(report.ok, false);
});

test('ontbrekende Drive-service en alleen-lezen doelbestand zijn afzonderlijk herkenbaar', () => {
  const missing = setup(); delete missing.ctx.Drive;
  const report = missing.ctx.checkAppSetup();
  assert.equal(byId(report, 'drive_create').code, 'DRIVE_SERVICE_MISSING');
  assert.equal(byId(report, 'sheet_write').status, 'skipped');
  const readonly = setup({ readonlyTarget: true });
  assert.equal(byId(readonly.ctx.checkAppSetup(), 'source_1').code, 'TARGET_NOT_WRITABLE');
});

test('Google-toestemming en Microsoft 401 krijgen verschillende foutcodes', () => {
  const google = setup({ conversionError: 'You do not have permission: required scope drive.file; private-account@example.nl' });
  const microsoft = setup({ status: 401 });
  assert.equal(byId(google.ctx.checkAppSetup(), 'drive_create').code, 'GOOGLE_PERMISSION_REQUIRED');
  assert.equal(byId(microsoft.ctx.checkAppSetup(), 'download_1').code, 'IMPORT_LOGIN_REQUIRED');
});

test('diagnose onderscheidt een uitgeschakelde API en ruimt ook na een schrijftestfout op', () => {
  const disabled = setup({ conversionError: 'Drive API has not been used in project secret-project' });
  assert.equal(byId(disabled.ctx.checkAppSetup(), 'drive_create').code, 'DRIVE_API_DISABLED');
  const write = setup({ failWrite: true });
  const report = write.ctx.checkAppSetup();
  assert.equal(byId(report, 'sheet_write').status, 'error');
  assert.equal(byId(report, 'drive_cleanup').status, 'ok');
  assert.deepEqual(write.removedFiles, ['temporary-id']);
});

test('opruimfout wordt gerapporteerd en latere broncontroles worden nog uitgevoerd', () => {
  const { ctx } = setup({ cleanupError: 'Permission required for remove temporary-secret-id' });
  const report = ctx.checkAppSetup();
  assert.equal(byId(report, 'drive_cleanup').status, 'error');
  assert.equal(byId(report, 'download_1').status, 'ok');
});

test('mailcontrole gebruikt het quotum zonder mail te versturen en maakt quotumproblemen zichtbaar', () => {
  const empty = setup({ emailEnabled: true, mailQuota: 0 });
  assert.equal(byId(empty.ctx.checkAppSetup(), 'mail').code, 'MAIL_QUOTA_EMPTY');
  const allowed = setup({ emailEnabled: true });
  assert.equal(byId(allowed.ctx.checkAppSetup(), 'mail').status, 'ok');
});

test('Google-only controle slaat imports over en accepteert spreadsheets als ruimer leesrecht', () => {
  const { ctx, configure, convertedSheet, removedFiles } = setup();
  convertedSheet.matrix[1] = HEADERS;
  configure([{ name: 'Google', spreadsheetId: 'temporary-id', sheetName: 'Aanvragen', headerRow: 2 }]);
  const report = ctx.checkAppSetup();
  assert.equal(byId(report, 'scope_spreadsheets.readonly').status, 'ok');
  assert.equal(byId(report, 'source_1').status, 'ok');
  assert.equal(byId(report, 'mail').status, 'skipped');
  assert.equal(report.checks.some(check => check.id === 'drive_create'), false);
  assert.equal(removedFiles.length, 0);
});

test('onbevoegden kunnen diagnose en autorisatie niet gebruiken', () => {
  const { ctx, authorizationCalls, fetches } = setup({ denied: true });
  assert.throws(() => ctx.authorizeApp(), /Geen toegang/);
  assert.throws(() => ctx.checkAppSetup(), /Geen toegang/);
  assert.equal(authorizationCalls.length, 0);
  assert.equal(fetches.length, 0);
});

test('diagnoserapport en logs lekken geen accounts, bestands-IDs, tokenfragmenten of bron-URL', () => {
  const { ctx, logs } = setup({ conversionError: 'Permission required for https://secret.example/file?token=secret-token account@example.nl' });
  const report = ctx.checkAppSetup();
  const output = JSON.stringify(report) + logs.join('');
  assert.doesNotMatch(output, /secret.example|secret-token|account@example.nl|target-private|temporary-id|example.sharepoint.com/);
  assert.match(output, /GOOGLE_PERMISSION_REQUIRED/);
});
