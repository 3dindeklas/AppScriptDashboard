function key_(value) {
  return String(value == null ? '' : value).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}
function text_(value) { return String(value == null ? '' : value).trim().replace(/\s+/g, ' '); }

/** Dutch numeric strings, native Excel/Sheets numbers; malformed and empty != zero. */
function number_(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = text_(value).replace(/[€\s\u00a0]/g, '');
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+(,\d+)?$/.test(s)) s = s.replace(',', '.');
  else if (!/^-?\d+\.\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function count_(value) {
  const n = number_(value);
  return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
}
function isoDay_(y, m, d) {
  if (y < 1900 || y > 2200) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return String(y) + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
function date_(value) {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : Utilities.formatDate(value, 'Europe/Amsterdam', 'yyyy-MM-dd');
  if (typeof value === 'number' && value > 0 && value < 110000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return isoDay_(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = text_(value);
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return isoDay_(+match[1], +match[2], +match[3]);
  match = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  return match ? isoDay_(+match[3], +match[2], +match[1]) : null;
}
function grades_(value, sector) {
  const s = key_(value).replace(/groep|leerjaar|klas/g, '').trim();
  const max = sector === 'PO' ? 8 : sector === 'VO' ? 6 : 0;
  if (!max || !s) return [];
  let numbers;
  const range = s.match(/^(\d)\s*(?:-|t\/m|tot)\s*(\d)$/);
  if (range) {
    const a = +range[1], b = +range[2];
    if (a > b) return [];
    numbers = Array.from({ length: b - a + 1 }, (_, i) => a + i);
  } else if (/^\d(?:\s*(?:\/|,|&|en|\+)\s*\d)*$/.test(s)) numbers = s.match(/\d/g).map(Number);
  else return [];
  return numbers.every(n => n >= 1 && n <= max) ? [...new Set(numbers)] : [];
}
function normalizeSource_(matrix, source) {
  if (!matrix.length) throw new Error('Kolomkoppen ontbreken.');
  const aliases = CONFIG.headerAliases;
  const headers = matrix[0].map(key_);
  function index(name) {
    const names = [name].concat(aliases[name] || []).map(key_);
    const matches = headers.map((h, i) => names.includes(h) ? i : -1).filter(i => i >= 0);
    if (matches.length > 1) throw new Error('Dubbele kolomkop.');
    return matches.length ? matches[0] : -1;
  }
  const fields = {
    requestId: 'Aanvraag ID', requested: 'Datum aanvraag', school: 'Schoolnaam', region: 'Gemeente / Regio',
    workshop: 'Workshopnaam', provider: 'Aanbieder', sessions: 'Lesmomenten', students: 'Aantal leerlingen',
    grade: 'Groep / leerjaar', sector: 'PO / VO', scheduled: 'Definitieve datum', type: 'Type',
    costs: 'Totale kosten aanbieder', revenue: 'Te factureren i_lab', status: 'Status'
  };
  const indices = {};
  Object.keys(fields).forEach(k => indices[k] = index(fields[k]));
  ['requestId', 'requested', 'school', 'workshop', 'students', 'status'].forEach(k => {
    if (indices[k] < 0) throw new Error('Verplichte kolom ontbreekt.');
  });
  if (matrix.length - 1 > CONFIG.maxRowsPerSource) throw new Error('Rijlimiet overschreden.');
  const seen = new Set(), records = [];
  const warnings = { missingIds: 0, missingStudents: 0, invalidDates: 0, missingFinance: 0, unknownGrades: 0, missingSessions: 0 };
  matrix.slice(1).forEach(row => {
    const get = k => indices[k] < 0 ? '' : row[indices[k]];
    // Ignore footer/formula-only rows, but retain requests with incomplete school/workshop fields.
    if (![get('requestId'), get('school'), get('workshop')].some(v => text_(v))) return;
    const id = key_(get('requestId'));
    if (id && seen.has(id)) throw new Error('Dubbele aanvraag-ID binnen bron.');
    if (id) seen.add(id); else warnings.missingIds++;
    const sectorText = text_(get('sector')).toUpperCase();
    const sector = ['PO', 'VO'].includes(sectorText) ? sectorText : 'Onbekend';
    const requested = date_(get('requested')), scheduled = date_(get('scheduled'));
    const students = count_(get('students')), sessions = count_(get('sessions'));
    const costs = number_(get('costs')), revenue = number_(get('revenue'));
    const grades = grades_(get('grade'), sector);
    if (students === null) warnings.missingStudents++;
    if (sessions === null) warnings.missingSessions++;
    if (!requested || (text_(get('scheduled')) && !scheduled)) warnings.invalidDates++;
    if (costs === null || revenue === null) warnings.missingFinance++;
    if (!grades.length) warnings.unknownGrades++;
    const school = text_(get('school')), region = text_(get('region')) || 'Onbekend';
    const status = text_(get('status')) || 'Onbekend';
    records.push({ source: source.id, foundation: source.label, requested: requested, scheduled: scheduled,
      school: school || 'Onbekend', schoolKey: school ? key_(school) + '|' + key_(region) : '',
      region: region, workshop: text_(get('workshop')) || 'Onbekend', provider: text_(get('provider')) || 'Onbekend',
      sessions: sessions, students: students, sector: sector, grades: grades,
      type: text_(get('type')) || 'Onbekend', status: status,
      statusGroup: CONFIG.statusGroups[key_(status)] || 'Overig', costs: costs, revenue: revenue });
  });
  return { records: records, warnings: warnings };
}
