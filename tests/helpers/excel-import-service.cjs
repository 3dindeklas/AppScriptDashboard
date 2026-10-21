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
  const cacheValues = new Map();
  const authorizationCalls = [];
  const props = new Map(), logs = [], fetches = [], removedFiles = [], invalidations = [];
  const books = new Map();
  const flags = { failWrite: false, failPublish: false, failMetadata: false, status: 200, html: false, ...options };
  function book(id) {
    const sheets = [];
    const value = {
      id, sheets, getSheets: () => sheets, getSheetByName: name => sheets.find(sheet => sheet.name === name) || null,
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
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props.get(key) || null, deleteProperty: key => props.delete(key),
      setProperty(key, value) { if (flags.failMetadata) throw new Error('private-metadata'); props.set(key, value); } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (flags.busy) return false; held = true; return true; }, releaseLock: () => { held = false; } }) },
    Session: { getActiveUser: () => ({ getEmail: () => flags.denied ? '' : 'jouw-account@voorbeeld.nl' }),
      getEffectiveUser: () => ({ getEmail: () => flags.wrongOwner ? 'outsider@example.nl' : 'jouw-account@voorbeeld.nl' }),
      getScriptTimeZone: () => 'Europe/Amsterdam' },
    ScriptApp: { AuthMode: { FULL: 'FULL' }, AuthorizationStatus: { REQUIRED: 'REQUIRED', NOT_REQUIRED: 'NOT_REQUIRED' },
      requireAllScopes: mode => authorizationCalls.push(mode),
      getAuthorizationInfo: () => ({ getAuthorizationStatus: () => flags.authRequired ? 'REQUIRED' : 'NOT_REQUIRED',
        getAuthorizedScopes: () => flags.grantedScopes || ['userinfo.email', 'spreadsheets', 'script.send_mail', 'script.external_request', 'drive.file', 'drive.readonly'].map(scope => 'https://www.googleapis.com/auth/' + scope) }) },
    MailApp: { getRemainingDailyQuota: () => { if (flags.mailError) throw new Error(flags.mailError); return flags.mailQuota ?? 100; },
      sendEmail: () => { throw new Error('Diagnose mag geen mail versturen'); } },
    Utilities: { newBlob: () => blob, getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: (algorithm, value) => Array.from(crypto.createHash('sha256').update(value).digest()),
      formatDate: date => date.toISOString().slice(0, 16) },
    SpreadsheetApp: { openById: id => { if (!books.has(id)) throw new Error('private-id'); return books.get(id); }, flush() {} },
    Drive: { Files: { get: () => ({ capabilities: { canEdit: !flags.readonlyTarget } }),
      create: () => { if (flags.conversionError) throw new Error(flags.conversionError); return { id: 'temporary-id' }; },
      remove: id => { if (flags.cleanupError) throw new Error(flags.cleanupError); removedFiles.push(id); } } },
    DriveApp: { getFileById: () => ({ getSize: () => flags.fileSize || 6, getBlob: () => blob }) },
    UrlFetchApp: { fetch(url, opts) {
      fetches.push({ url, opts });
      if (flags.networkError) throw new Error('secret URL and account');
      return { getResponseCode: () => url === 'https://www.google.com/generate_204' ? 204 : flags.status,
        getAllHeaders: () => ({ 'Content-Type': flags.html ? 'text/html' : 'application/octet-stream', ...(flags.location ? { Location: flags.location } : {}) }),
        getBlob: () => blob };
    } },
    CacheService: { getScriptCache: () => ({ put: (key, value) => cacheValues.set(key, value), get: key => cacheValues.get(key) || null,
      remove: key => { cacheValues.delete(key); invalidations.push(key); } }) }
  });
  for (const file of ['Config.gs', 'Data.gs', 'Cache.gs', 'Auth.gs', 'Code.gs', 'ExcelImport.gs', 'Diagnostics.gs']) {
    let source = fs.readFileSync('src/' + file, 'utf8');
    if (file === 'Config.gs' && flags.emailEnabled) source = source.replace('enabled: false', 'enabled: true');
    vm.runInContext(source, ctx);
  }
  function configure(sources = [SOURCE]) { vm.runInContext('APP_CONFIG.sources.splice(0, APP_CONFIG.sources.length, ...' + JSON.stringify(sources) + ');', ctx); }
  configure();
  return { ctx, flags, props, logs, fetches, removedFiles, invalidations, target, convertedSheet, configure, authorizationCalls, held: () => held };
}


module.exports = { setup, SOURCE, HEADERS, ROW };
