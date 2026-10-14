function readSource_(source) {
  if (source.type === 'googleSheets') {
    if (!source.spreadsheetId || !source.sheetName) throw new Error('Bron nog niet ingesteld.');
    const sheet = SpreadsheetApp.openById(source.spreadsheetId).getSheetByName(source.sheetName);
    if (!sheet) throw new Error('Tabblad ontbreekt.');
    const row = source.headerRow == null ? 1 : source.headerRow;
    if (!Number.isInteger(row) || row < 1) throw new Error('Ongeldige kopregel.');
    const last = sheet.getLastRow(), width = sheet.getLastColumn();
    if (last < row || !width) throw new Error('Geen kopregel.');
    if (last - row > CONFIG.maxRowsPerSource) throw new Error('Rijlimiet overschreden.');
    return sheet.getRange(row, 1, last - row + 1, width).getValues();
  }
  if (source.type === 'microsoftExcel') return readMicrosoft_(source);
  throw new Error('Onbekend brontype.');
}
function graphGet_(url, token) {
  // Pagination links must stay on the intended API host; never forward a bearer token elsewhere.
  if (!url.startsWith('https://graph.microsoft.com/v1.0/')) throw new Error('Onveilige Graph URL.');
  const response = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true, followRedirects: false });
  if (response.getResponseCode() !== 200) throw new Error('Microsoft-bron niet beschikbaar.');
  return JSON.parse(response.getContentText());
}
function readMicrosoft_(source) {
  if (!source.driveId || !source.itemId || !source.tableName) throw new Error('Microsoft-bron nog niet ingesteld.');
  const token = microsoftToken_(source.connectionId);
  const root = 'https://graph.microsoft.com/v1.0/drives/' + encodeURIComponent(source.driveId) +
    '/items/' + encodeURIComponent(source.itemId) + '/workbook/tables/' + encodeURIComponent(source.tableName);
  let columns = [], url = root + '/columns?$top=100';
  const visited = new Set();
  while (url) {
    if (visited.has(url) || visited.size > 100) throw new Error('Ongeldige paginering.');
    visited.add(url);
    const page = graphGet_(url, token);
    columns = columns.concat(page.value || []); url = page['@odata.nextLink'];
  }
  columns.sort((a, b) => a.index - b.index);
  const rows = [columns.map(c => c.name)];
  // Explicit skip/top also works when the workbook API does not emit nextLink.
  const pageSize = 500;
  for (let skip = 0; ; skip += pageSize) {
    const page = graphGet_(root + '/rows?$top=' + pageSize + '&$skip=' + skip, token);
    if (!Array.isArray(page.value)) throw new Error('Ongeldig antwoord.');
    page.value.forEach(r => { if (!r.values || !Array.isArray(r.values[0])) throw new Error('Ongeldige rij.'); rows.push(r.values[0]); });
    if (rows.length - 1 > CONFIG.maxRowsPerSource) throw new Error('Rijlimiet overschreden.');
    if (page.value.length < pageSize) break;
  }
  return rows;
}
