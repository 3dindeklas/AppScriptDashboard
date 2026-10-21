const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, SOURCE, HEADERS, ROW } = require('./helpers/excel-import-service.cjs');

test('URL-import behoudt bronkolommen en waarden en gebruikt dezelfde dashboardnormalisatie', () => {
  const { ctx, target, removedFiles, invalidations } = setup();
  const result = ctx.refreshExcelImports();
  assert.equal(result[0].status, 'ok');
  const sheet = target.getSheetByName(SOURCE.sheetName);
  assert.ok(sheet);
  assert.equal(sheet.matrix.length, 2);
  assert.deepEqual(Array.from(sheet.matrix[0]), HEADERS);
  assert.deepEqual(Array.from(sheet.matrix[1]), ROW);
  assert.match(JSON.stringify(sheet.matrix), /prive@example/);
  assert.doesNotMatch(JSON.stringify(ctx.getDashboardData()), /prive@example|Niet kopiëren/);
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

test('OneDrive-deellink behoudt parameters en vraagt een download aan vóór doorverwijzen', () => {
  const { ctx, fetches } = setup({ status: 401 });
  assert.throws(() => ctx.downloadExcelImport_('https://1drv.ms/x/c/demo/share-token?e=test'), /IMPORT_LOGIN_REQUIRED/);
  assert.equal(fetches[0].url, 'https://1drv.ms/x/c/demo/share-token?e=test&download=1');
  assert.equal(ctx.excelImportUrl_('https://my.microsoftpersonalcontent.com/personal/demo/file.xlsx').origin,
    'https://my.microsoftpersonalcontent.com');
  assert.throws(() => ctx.excelImportUrl_('https://my.microsoftpersonalcontent.com.evil.example/file.xlsx'), /NOT_ALLOWED/);
});

test('Microsoft-personalcontent redirect wordt gevolgd en een 401 blijft een aanmeldfout', () => {
  const { ctx, flags, fetches } = setup({ status: 302, location: 'https://my.microsoftpersonalcontent.com/personal/demo/file.xlsx' });
  const original = ctx.UrlFetchApp.fetch;
  ctx.UrlFetchApp.fetch = (url, opts) => {
    if (url.includes('my.microsoftpersonalcontent.com')) { flags.status = 401; flags.location = ''; }
    return original(url, opts);
  };
  assert.throws(() => ctx.downloadExcelImport_('https://1drv.ms/x/c/demo/share-token?e=test'), /IMPORT_LOGIN_REQUIRED/);
  assert.equal(fetches.length, 2);
});

test('importfouten tonen fase en een aparte code voor ontbrekende Google-rechten', () => {
  const { ctx, logs } = setup({ conversionError: 'Permission required: drive.file https://private.example/token' });
  const result = ctx.refreshExcelImports()[0];
  assert.equal(result.errorCode, 'IMPORT_GOOGLE_PERMISSION_REQUIRED');
  assert.equal(result.phase, 'conversion');
  assert.match(result.message, /checkAppSetup/);
  assert.match(logs.join(''), /IMPORT_START/);
  assert.match(logs.join(''), /phase=conversion/);
  assert.doesNotMatch(logs.join(''), /private.example/);
});

test('publieke OneDrive-download neemt anonieme redirectcookie mee en slaat hem nergens op', () => {
  const { ctx, props, logs } = setup();
  let calls = 0;
  ctx.UrlFetchApp.fetch = (url, opts) => {
    calls++;
    if (calls === 1) {
      assert.equal(opts.headers.Cookie, undefined);
      return { getResponseCode: () => 302, getAllHeaders: () => ({
        Location: '/public-download.xlsx', 'Set-Cookie': ['anonymous=private-cookie; Path=/; Secure; HttpOnly']
      }) };
    }
    assert.equal(opts.headers.Cookie, 'anonymous=private-cookie');
    return { getResponseCode: () => 200, getAllHeaders: () => ({'Content-Type': 'application/octet-stream'}),
      getBlob: () => ({ valid: true }) };
  };
  assert.equal(ctx.downloadExcelImport_('https://onedrive.live.com/:x:/g/personal/demo/link?download=1').valid, true);
  assert.equal(calls, 2);
  assert.equal(props.size, 0);
  assert.doesNotMatch(logs.join(''), /private-cookie/);
});

test('cookies blijven per download geïsoleerd en worden niet naar andere hosts gestuurd', () => {
  const { ctx } = setup();
  let calls=0;
  ctx.UrlFetchApp.fetch = (url, opts) => {
    calls++;
    assert.equal(opts.headers.Cookie, undefined);
    if (calls === 1) return { getResponseCode: () => 302, getAllHeaders: () => ({
      Location: 'https://my.microsoftpersonalcontent.com/public.xlsx', 'Set-Cookie': 'anonymous=private; Path=/' }) };
    return { getResponseCode: () => 200, getAllHeaders: () => ({}), getBlob: () => ({ valid:true }) };
  };
  ctx.downloadExcelImport_('https://onedrive.live.com/public?download=1');
  ctx.downloadExcelImport_('https://onedrive.live.com/second?download=1');
  assert.equal(calls,3);
});

test('cookiepad, domein, vervanging en verwijderen worden gerespecteerd', () => {
  const { ctx } = setup();
  const jar=[];
  const current=ctx.excelImportUrl_('https://onedrive.live.com/personal/demo/view');
  ctx.excelImportRememberCookies_({'set-cookie':[
    'pathcookie=one; Path=/personal/demo', 'rootcookie=two; Domain=.live.com; Path=/',
    'bad=three; Domain=evil.example; Path=/', 'publicsuffix=four; Domain=com', 'hostonly=five; Path=/'
  ]},current,jar);
  assert.match(ctx.excelImportCookieHeader_(current,jar), /pathcookie=one/);
  assert.doesNotMatch(ctx.excelImportCookieHeader_(ctx.excelImportUrl_('https://onedrive.live.com/personal/demonstration/view'),jar), /pathcookie/);
  assert.doesNotMatch(ctx.excelImportCookieHeader_(ctx.excelImportUrl_('https://other.sharepoint.com/view'),jar), /cookie|hostonly/);
  assert.equal(jar.some(cookie=>cookie.name==='bad'||cookie.name==='publicsuffix'),false);
  ctx.excelImportRememberCookies_({'Set-Cookie':'pathcookie=new; Path=/personal/demo'},current,jar);
  assert.match(ctx.excelImportCookieHeader_(current,jar),/pathcookie=new/);
  ctx.excelImportRememberCookies_({'Set-Cookie':'pathcookie=; Path=/personal/demo; Max-Age=0'},current,jar);
  assert.doesNotMatch(ctx.excelImportCookieHeader_(current,jar),/pathcookie/);
});

test('samengevoegde Set-Cookie met Expires, ongeldige headers en cookiegrenzen worden veilig verwerkt', () => {
  const { ctx }=setup(); const jar=[];
  const current=ctx.excelImportUrl_('https://onedrive.live.com/public');
  ctx.excelImportRememberCookies_({'Set-Cookie':'first=one; Expires=Wed, 01 Jan 2099 00:00:00 GMT; Path=/, second=two; Path=/'},current,jar);
  assert.match(ctx.excelImportCookieHeader_(current,jar),/first=one; second=two/);
  ctx.excelImportRememberCookies_({'Set-Cookie':['bad=value\r\nInjected: secret','old=value; Expires=Wed, 01 Jan 2000 00:00:00 GMT']},current,jar);
  assert.equal(jar.length,2);
  ctx.excelImportRememberCookies_({'Set-Cookie':Array.from({length:30},(_,i)=>'cookie'+i+'='+('x'.repeat(3000))+'; Path=/')},current,jar);
  assert.ok(jar.length<=24);
  const header=ctx.excelImportCookieHeader_(current,jar);
  assert.ok(header.length<=8192);
  assert.ok(header.split('; ').every(pair=>pair.split('=')[1].length===3000));
});

test('afgesproken i_lab-kolommen inclusief lege tussenkolommen blijven exact behouden', () => {
  const { ctx, convertedSheet, target } = setup();
  const columns = ['#', '  Aanvraag ID  ', 'Datum aanvraag', 'Schoolnaam', 'Contactpersoon', 'E-mailadres',
    'Telefoon', 'Gemeente / Regio', '', 'Workshopnaam', 'Aanbieder', 'Lesmomenten', 'Aantal leerlingen',
    'Groep / leerjaar', 'PO / VO', 'Gewenste periode', 'Definitieve datum', 'Locatie', 'Type', '',
    'Punten per workshop', '', 'Status', 'Actie nodig', 'Notities'];
  const values = { '#': 17, 'Aanvraag ID': 'REQ-17', 'Datum aanvraag': '01-09-2026', 'Schoolnaam': 'Testschool',
    'Contactpersoon': 'Prive contactnaam', 'E-mailadres': 'contact@example.nl', 'Telefoon': '0612345678',
    'Gemeente / Regio': 'Gorinchem', 'Workshopnaam': 'Paper Circuits', 'Aanbieder': '3Dindeklas',
    'Lesmomenten': 2, 'Aantal leerlingen': 24, 'Groep / leerjaar': 'groep 7/8', 'PO / VO': 'PO',
    'Gewenste periode': 'najaar', 'Definitieve datum': '03-09-2026; 10-09-2026', 'Locatie': 'Lokaal 2',
    'Type': 'Workshop', 'Punten per workshop': 350, 'Status': 'Bevestiging', 'Actie nodig': 'Bellen',
    'Notities': 'Prive bronnotitie' };
  const originalRow = columns.map(column => values[column.trim()] ?? '');
  convertedSheet.matrix = [[], columns, originalRow];
  const normal = ctx.readGoogleSheet_({ spreadsheetId: 'temporary-id', sheetName: 'Aanvragen', headerRow: 2, name: SOURCE.name });
  assert.equal(ctx.refreshExcelImports()[0].status, 'ok');
  const imported = target.getSheetByName(SOURCE.sheetName);
  assert.deepEqual(Array.from(imported.matrix[0]), columns);
  assert.deepEqual(Array.from(imported.matrix[1]), originalRow);
  assert.equal(imported.matrix[0].includes('Totale kosten aanbieder'), false);
  assert.equal(imported.matrix[0].includes('Te factureren i_lab'), false);
  const records = ctx.readSource_(SOURCE).records;
  assert.deepEqual(JSON.parse(JSON.stringify(records)), JSON.parse(JSON.stringify(normal.records)));
  assert.equal(records[0].desiredPeriod, 'najaar');
  assert.equal(records[0].actionRequired, 'Bellen');
  assert.equal(records[0].location, 'Lokaal 2');
  const browser = JSON.stringify(ctx.getDashboardData());
  assert.doesNotMatch(browser, /Prive contactnaam|contact@example.nl|0612345678|Prive bronnotitie|Bellen|Lokaal 2/);
});

test('ruwe celwaarden en waarschuwingen volgen dezelfde lezer zonder voorafgaande normalisatie', () => {
  const { ctx, convertedSheet, target } = setup();
  const date = new Date('2026-09-01T00:00:00Z');
  convertedSheet.matrix[2][1] = date;
  convertedSheet.matrix[2][4] = 'onbekend';
  convertedSheet.matrix[2][8] = '03-09-2026, 10-09-2026';
  ctx.refreshExcelImports();
  const copied = target.sheets[0].matrix;
  assert.equal(copied[1][1], date);
  assert.equal(copied[1][4], 'onbekend');
  assert.equal(copied[1][8], '03-09-2026, 10-09-2026');
  assert.equal(ctx.readSource_(SOURCE).warnings.invalidStudentCounts, 1);
  assert.equal(ctx.readSource_(SOURCE).records[0].students, null);
});

test('gedeelde rijselectie behoudt kolommen en slaat formulerijen vóór de rijlimiet over', () => {
  const { ctx, convertedSheet } = setup();
  convertedSheet.matrix = [[], HEADERS, ROW, ROW, ROW];
  convertedSheet.formulas[3] = ROW.map(() => '=generated()');
  ctx.sourceRowLimit_ = () => 1;
  const rows = ctx.readGoogleSheetRows_({ spreadsheetId:'temporary-id', sheetName:'Aanvragen', headerRow:2, name:'Bron' });
  assert.equal(rows.values.length, 2);
  assert.deepEqual(Array.from(rows.values[0]), HEADERS);
  assert.deepEqual(Array.from(rows.values[1]), ROW);
  assert.equal(rows.rowsTruncated, 1);
});
