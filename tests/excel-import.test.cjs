const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const SOURCE = { name: 'Importhub', type: 'excel-import', url: 'https://example.sharepoint.com/file.xlsx?download=1',
  sourceSheetName: 'Aanvragen', headerRow: 2, spreadsheetId: 'target-private', sheetName: 'Import_Microsoft' };
const HEADERS = ['Aanvraag ID', 'Datum aanvraag', 'Schoolnaam', 'Workshopnaam', 'Aantal leerlingen', 'Lesmomenten',
  'PO / VO', 'Groep / leerjaar', 'Definitieve datum', 'Totale kosten aanbieder', 'Te factureren i_lab', 'E-mailadres', 'Notities'];
const ROW = ['A-1', '01-09-2026', 'Testschool', 'Robot', 24, 2, 'PO', 'groep 7/8',
  '03-09-2026;10-09-2026', 450, 600, 'prive@example.nl', 'Niet kopiëren'];

function setup(options = {}) {
  let nextId = 1;
  const props = new Map(), logs = [], fetches = [], removedFiles = [], invalidations = [];
  const books = new Map();
  const flags = { failWrite: false, failPublish: false, failMetadata: false, status: 200, html: false, ...options };
  function book(id) {
    const sheets = [];
    const value = {
      id, sheets, getSheetByName: name => sheets.find(sheet => sheet.name === name) || null,
      insertSheet(name) {
        if (sheets.some(sheet => sheet.name === name)) throw new Error('duplicate');
        const sheet = makeSheet(name); sheets.push(sheet); return sheet;
      },
      deleteSheet(sheet) { sheets.splice(sheets.indexOf(sheet), 1); }
    };
    books.set(id, value);
    function makeSheet(name) {
      const sheet = {
        name, id: nextId++, matrix: [], formulas: [], maxRows: 1000,
        getSheetId() { return this.id; },
        getLastRow() { return this.matrix.length; },
        getLastColumn() { return Math.max(0, ...this.matrix.map(row => row.length)); },
        getMaxRows() { return this.maxRows; },
        insertRowsAfter(start, count) { this.maxRows += count; },
        setFrozenRows() {},
        setName(next) {
          if (flags.failPublish && next === SOURCE.sheetName) throw new Error('provider-private-name');
          if (sheets.some(other => other !== this && other.name === next)) throw new Error('duplicate');
          this.name = next;
        },
        getRange(row, col, height, width) {
          const get = matrix => Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => matrix[row + r - 1]?.[col + c - 1] ?? ''));
          return { getValues: () => get(sheet.matrix), getFormulas: () => get(sheet.formulas),
            setValues(matrix) {
              if (flags.failWrite) throw new Error('provider-private-cells');
              for (let r = 0; r < height; r++) {
                sheet.matrix[row + r - 1] ||= [];
                for (let c = 0; c < width; c++) sheet.matrix[row + r - 1][col + c - 1] = matrix[r][c];
              }
            } };
        }
      };
      return sheet;
    }
    return value;
  }
  const converted = book('temporary-id');
  const convertedSheet = converted.insertSheet('Aanvragen');
  convertedSheet.matrix = [[], HEADERS, ROW];
  const target = book(SOURCE.spreadsheetId);
  const blob = { getBytes: () => flags.bytes || [80, 75, 3, 4, 1, 2], setContentType() { return this; }, setName() { return this; } };
  let held = false;
  const ctx = vm.createContext({ Date, Set, console: { log: x => logs.push(String(x)), error: x => logs.push(String(x)) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props.get(key) || null,
      setProperty(key, value) { if (flags.failMetadata) throw new Error('private-metadata'); props.set(key, value); } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (flags.busy) return false; held = true; return true; }, releaseLock: () => { held = false; } }) },
    Session: { getActiveUser: () => ({ getEmail: () => flags.denied ? '' : 'jouw-account@voorbeeld.nl' }),
      getEffectiveUser: () => ({ getEmail: () => flags.wrongOwner ? 'outsider@example.nl' : 'jouw-account@voorbeeld.nl' }),
      getScriptTimeZone: () => 'Europe/Amsterdam' },
    Utilities: { getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: (algorithm, value) => Array.from(crypto.createHash('sha256').update(value).digest()),
      formatDate: date => date.toISOString().slice(0, 16) },
    SpreadsheetApp: { openById: id => { if (!books.has(id)) throw new Error('private-id'); return books.get(id); }, flush() {} },
    Drive: { Files: { create: () => ({ id: 'temporary-id' }), remove: id => removedFiles.push(id) } },
    DriveApp: { getFileById: () => ({ getSize: () => flags.fileSize || 6, getBlob: () => blob }) },
    UrlFetchApp: { fetch(url, opts) {
      fetches.push({ url, opts });
      if (flags.networkError) throw new Error('secret URL and account');
      return { getResponseCode: () => flags.status,
        getAllHeaders: () => ({ 'Content-Type': flags.html ? 'text/html' : 'application/octet-stream', ...(flags.location ? { Location: flags.location } : {}) }),
        getBlob: () => blob };
    } },
    CacheService: { getScriptCache: () => ({ remove: key => invalidations.push(key) }) }
  });
  for (const file of ['Config.gs', 'Data.gs', 'Cache.gs', 'Auth.gs', 'Code.gs', 'ExcelImport.gs']) vm.runInContext(fs.readFileSync('src/' + file, 'utf8'), ctx);
  function configure(sources = [SOURCE]) { vm.runInContext('APP_CONFIG.sources.splice(0, APP_CONFIG.sources.length, ...' + JSON.stringify(sources) + ');', ctx); }
  configure();
  return { ctx, flags, props, logs, fetches, removedFiles, invalidations, target, convertedSheet, configure, held: () => held };
}

test('URL-import maakt een tabblad met alleen analysekolommen en bewaart meerdere lesdagen en bedragen', () => {
  const { ctx, target, removedFiles, invalidations } = setup();
  const result = ctx.refreshExcelImports();
  assert.equal(result[0].status, 'ok');
  const sheet = target.getSheetByName(SOURCE.sheetName);
  assert.ok(sheet);
  assert.equal(sheet.matrix.length, 2);
  assert.doesNotMatch(JSON.stringify(sheet.matrix), /prive@example|Niet kopiëren|E-mailadres|Notities/);
  assert.deepEqual(removedFiles, ['temporary-id']);
  assert.equal(invalidations.length, 1);
  const source = ctx.readSource_(SOURCE);
  assert.equal(source.records.length, 1);
  assert.deepEqual(Array.from(source.records[0].scheduledDates), ['2026-09-03', '2026-09-10']);
  assert.equal(source.records[0].providerTotalCosts, 450);
  assert.match(source.message, /Laatste geslaagde import/);
});

test('dashboard uitlezen gebruikt het Google-tabblad en doet geen nieuwe download', () => {
  const { ctx, fetches } = setup();
  ctx.refreshExcelImports();
  const count = fetches.length;
  ctx.readConfiguredSheets_(); ctx.readConfiguredSheets_();
  assert.equal(fetches.length, count);
});

test('herimport houdt één stabiele tabbladnaam en vervangt oude regels zonder dubbelen', () => {
  const { ctx, target, convertedSheet } = setup();
  ctx.refreshExcelImports();
  const firstId = target.getSheetByName(SOURCE.sheetName).id;
  convertedSheet.matrix[2] = [...ROW]; convertedSheet.matrix[2][3] = 'Nieuwe workshop';
  ctx.refreshExcelImports();
  assert.equal(target.sheets.length, 1);
  assert.notEqual(target.sheets[0].id, firstId);
  assert.equal(ctx.readSource_(SOURCE).records[0].workshop, 'Nieuwe workshop');
});

test('401 of HTML behoudt vorige gegevens en toont een importmelding met onvolledig overzicht', () => {
  for (const mode of ['unauthorized', 'viewer']) {
    const { ctx, flags, target } = setup();
    ctx.refreshExcelImports();
    const originalId = target.sheets[0].id;
    if (mode === 'unauthorized') flags.status = 401;
    else flags.html = true;
    assert.equal(ctx.refreshExcelImports()[0].status, 'error');
    assert.equal(target.sheets[0].id, originalId);
    const source = ctx.readSource_(SOURCE);
    assert.equal(source.records.length, 1);
    assert.equal(source.status, 'warning');
    assert.match(source.message, /Vorige gegevens blijven zichtbaar/);
    assert.equal(ctx.readConfiguredSheets_().complete, false);
  }
});

test('bron zonder geslaagde import toont gerichte fout en geen verzonnen gegevens', () => {
  const { ctx } = setup({ status: 401 });
  ctx.refreshExcelImports();
  const result = ctx.readSource_(SOURCE);
  assert.equal(result.records.length, 0);
  assert.equal(result.errorCode, 'IMPORT_LOGIN_REQUIRED');
  assert.match(result.message, /Microsoft-aanmelding/);
});

test('Drive-export heeft voorrang op URL en gebruikt geen Microsoft-verzoeken', () => {
  const { ctx, configure, fetches } = setup();
  const source = { ...SOURCE, driveFileId: 'uploaded-file-id' };
  configure([source]);
  assert.equal(ctx.refreshExcelImports()[0].status, 'ok');
  assert.equal(fetches.length, 0);
  assert.equal(ctx.readSource_(source).records.length, 1);
});

test('verkeerd Excel-tabblad, lege data en verkeerde koppen vervangen vorige import niet', () => {
  for (const mode of ['missing', 'empty', 'headers']) {
    const { ctx, target, convertedSheet, removedFiles } = setup();
    ctx.refreshExcelImports();
    const id = target.sheets[0].id;
    if (mode === 'missing') convertedSheet.name = 'Ander tabblad';
    if (mode === 'empty') convertedSheet.matrix = [[], HEADERS];
    if (mode === 'headers') convertedSheet.matrix[1] = ['Verkeerde kop'];
    assert.equal(ctx.refreshExcelImports()[0].status, 'error');
    assert.equal(target.sheets[0].id, id);
    assert.equal(removedFiles.length, 2);
  }
});

test('mislukte staging of publicatie herstelt de vorige tabbladnaam', () => {
  for (const mode of ['failWrite', 'failPublish', 'failMetadata']) {
    const { ctx, flags, target } = setup();
    ctx.refreshExcelImports();
    const original = target.sheets[0];
    // Publicatie faalt alleen bij staging, niet bij terugzetten van de originele naam.
    if (mode === 'failPublish') {
      const real = original.setName.bind(original);
      original.setName = name => { const before = flags.failPublish; flags.failPublish = false; try { real(name); } finally { flags.failPublish = before; } };
    }
    flags[mode] = true;
    assert.equal(ctx.refreshExcelImports()[0].status, 'error');
    assert.equal(target.sheets.length, 1);
    assert.equal(target.getSheetByName(SOURCE.sheetName), original);
  }
});

test('bestaand niet-beheerd tabblad en dubbele bronbestemming worden niet overschreven', () => {
  const { ctx, target, configure } = setup();
  const existing = target.insertSheet(SOURCE.sheetName); existing.matrix = [['Eigen administratie']];
  assert.equal(ctx.refreshExcelImports()[0].errorCode, 'IMPORT_TARGET_EXISTS');
  assert.equal(existing.matrix[0][0], 'Eigen administratie');
  configure([SOURCE, { name: 'Google', spreadsheetId: SOURCE.spreadsheetId, sheetName: SOURCE.sheetName }]);
  assert.equal(ctx.refreshExcelImports()[0].errorCode, 'IMPORT_TARGET_CONFLICT');
});

test('formulerijen tellen niet mee en er worden uitsluitend waarden geschreven', () => {
  const { ctx, convertedSheet, target } = setup();
  convertedSheet.matrix.push([...ROW]);
  convertedSheet.formulas[3] = ROW.map(() => '=someFormula()');
  convertedSheet.matrix[2][2] = '=IMPORTXML("https://private.example")';
  // Letterlijke brontekst, geen formule in de broncel.
  assert.equal(ctx.refreshExcelImports()[0].recordCount, 1);
  assert.equal(target.sheets[0].matrix[1][2].charAt(0), "'");
});

test('instellingswijziging maakt oude import ongeschikt totdat de nieuwe bron succesvol is geladen', () => {
  const { ctx } = setup(); ctx.refreshExcelImports();
  const changed = { ...SOURCE, sourceSheetName: 'Nieuw tabblad' };
  assert.equal(ctx.readSource_(changed).records.length, 0);
});

test('onbevoegden en bezette lock starten geen import', () => {
  for (const options of [{ denied: true }, { wrongOwner: true }, { busy: true }]) {
    const { ctx, fetches, held } = setup(options);
    assert.throws(() => ctx.refreshExcelImports());
    assert.equal(fetches.length, 0);
    assert.equal(held(), false);
  }
  const { ctx } = setup({ wrongOwner: true });
  assert.throws(() => ctx.refreshExcelImports_(), /Geen toegang/);
});

test('Google-only bronnen hebben geen importservice of importrechten nodig bij dashboardladen', () => {
  const { ctx, configure, fetches } = setup(); configure([{ name: 'Google', spreadsheetId: 's', sheetName: 'Workshops' }]);
  ctx.readGoogleSheet_ = () => ({ records: [], warnings: ctx.emptyWarnings_() });
  delete ctx.Drive; delete ctx.PropertiesService;
  assert.equal(ctx.readConfiguredSheets_().complete, true);
  assert.equal(fetches.length, 0);
});

test('viewerlinks, loginredirects en externe redirects geven gerichte veilige foutcodes', () => {
  const { ctx } = setup();
  assert.throws(() => ctx.downloadExcelImport_('https://excel.cloud.microsoft/open/onedrive/?docId=demo'), /IMPORT_VIEWER_LINK/);
  assert.throws(() => ctx.downloadExcelImport_('http://example.sharepoint.com/file.xlsx'), /IMPORT_URL_NOT_ALLOWED/);
  assert.throws(() => ctx.downloadExcelImport_('https://user:pass@example.sharepoint.com/file.xlsx'), /IMPORT_URL_NOT_ALLOWED/);
  const login = setup({ status: 302, location: 'https://login.microsoftonline.com/common/oauth2/authorize' });
  assert.throws(() => login.ctx.downloadExcelImport_(SOURCE.url), /IMPORT_LOGIN_REQUIRED/);
  const other = setup({ status: 302, location: 'https://evil.example/steal' });
  assert.throws(() => other.ctx.downloadExcelImport_(SOURCE.url), /IMPORT_URL_NOT_ALLOWED/);
});

test('bestandstype, downloadlimiet en tijdelijke bestandsopruiming zijn begrensd', () => {
  const wrong = setup({ bytes: [60, 104, 116, 109, 108] });
  assert.equal(wrong.ctx.refreshExcelImports()[0].errorCode, 'IMPORT_NOT_EXCEL');
  const tooBig = setup({ fileSize: 6 * 1024 * 1024 });
  tooBig.configure([{ ...SOURCE, driveFileId: 'big-file' }]);
  assert.equal(tooBig.ctx.refreshExcelImports()[0].errorCode, 'IMPORT_TOO_LARGE');
  const redirects = setup({ status: 302, location: '/endless' });
  assert.throws(() => redirects.ctx.downloadExcelImport_(SOURCE.url), /IMPORT_TOO_MANY_REDIRECTS/);
  assert.equal(redirects.fetches.length, 6);
});

test('foutlogs en browserprojectie bevatten geen URL, bestand-ID of providerdetail', () => {
  const { ctx, logs } = setup({ networkError: true });
  ctx.refreshExcelImports();
  const result = ctx.publicSourceStatus_(ctx.readSource_(SOURCE));
  const output = JSON.stringify(result) + logs.join('');
  assert.doesNotMatch(output, /example.sharepoint.com|secret URL|target-private/);
  assert.match(output, /IMPORT_DOWNLOAD_FAILED/);
});

test('browserantwoord houdt importmetadata, aanvraag-ID en financiële bedragen per rol afgeschermd', () => {
  const { ctx } = setup();
  ctx.refreshExcelImports();
  const payload = ctx.getDashboardData();
  assert.equal(payload.complete, true);
  assert.equal(payload.records[0].providerTotalCosts, 450);
  const json = JSON.stringify(payload);
  assert.doesNotMatch(json, /example.sharepoint.com|target-private|sheetId|signature|requestId|prive@example/);
  const record = ctx.publicRecord_(ctx.readSource_(SOURCE).records[0], false);
  assert.equal(Object.hasOwn(record, 'providerTotalCosts'), false);
  assert.equal(Object.hasOwn(record, 'invoiceAmount'), false);
});

test('gewijzigd doeltabblad wordt afgewezen en een eerste mislukte import laat geen staging achter', () => {
  const { ctx, target } = setup(); ctx.refreshExcelImports();
  const original = target.sheets[0]; target.deleteSheet(original); target.insertSheet(SOURCE.sheetName);
  assert.equal(ctx.readSource_(SOURCE).status, 'error');
  const first = setup({ failWrite: true });
  assert.equal(first.ctx.refreshExcelImports()[0].status, 'error');
  assert.equal(first.target.sheets.length, 0);
  assert.deepEqual(first.removedFiles, ['temporary-id']);
});

test('ontbrekende Google Drive-service geeft een gerichte melding en blokkeert andere bronnen niet', () => {
  const { ctx, configure, fetches } = setup(); delete ctx.Drive;
  assert.equal(ctx.refreshExcelImports()[0].errorCode, 'IMPORT_DRIVE_SERVICE_REQUIRED');
  assert.equal(fetches.length, 0);
  configure([SOURCE, { name: 'Google', spreadsheetId: 'google', sheetName: 'Workshops' }]);
  ctx.readGoogleSheet_ = () => ({ records: [{ school: 'Google school' }], warnings: ctx.emptyWarnings_() });
  const result = ctx.readConfiguredSheets_();
  assert.equal(result.records.length, 1);
  assert.equal(result.complete, false);
});
