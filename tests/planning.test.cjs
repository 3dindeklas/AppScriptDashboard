const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function model() {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync('src/Planning.html', 'utf8').replace(/^<script>\s*|\s*<\/script>\s*$/g, ''), ctx);
  return ctx.window.WorkshopPlanning.model;
}
const copy = value => JSON.parse(JSON.stringify(value));

test('lesreeksen over meerdere maanden behouden alle datums en hun volgnummer', () => {
  const m = model();
  const record = { scheduledDates: ['2026-11-03', '2026-10-27', '2026-10-27', '2026-11-10', 'ongeldig'] };
  assert.deepEqual(copy(m.dates(record)), ['2026-10-27', '2026-11-03', '2026-11-10']);
  const october = m.events([record], '2026-10'), november = m.events([record], '2026-11');
  assert.equal(october.length, 1);
  assert.equal(november.length, 2);
  assert.equal(november[0].ordinal, 2);
  assert.equal(november[0].allDates.length, 3);
});

test('verschillende aanvragen met dezelfde school, workshop en datum verdwijnen niet', () => {
  const m = model();
  const record = { school: 'Testschool', workshop: 'Robot', scheduledDates: ['2026-10-27'], students: 24 };
  const rows = m.events([record, { ...record }], '2026-10');
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].key, rows[1].key);
  assert.equal(rows[0].record.students, 24);
});

test('kalenderfilters werken zonder dashboarddatumbasis of schooljaarfilter', () => {
  const m = model();
  const records = [
    { source: 'A', provider: 'P', statusGroup: 'Ingepland', scheduledDates: ['2026-10-01'] },
    { source: 'B', provider: 'Q', statusGroup: 'Geannuleerd', scheduledDates: ['2026-10-02'] },
    { source: 'A', provider: 'Q', statusGroup: 'Open', scheduledDates: [] }
  ];
  assert.equal(m.select(records, {}, false).length, 2);
  assert.equal(m.select(records, {}, true).length, 3);
  const selected = m.select(records, { provider: 'Q' }, false);
  assert.equal(selected.length, 1);
  assert.equal(m.events(selected, '2026-10').length, 0);
  assert.equal(m.dates(selected[0]).length, 0);
});

test('maandraster begint maandag en houdt schrikkeldagen en jaarwisseling correct', () => {
  const m = model();
  assert.equal(m.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(m.shiftMonth('2026-01', -1), '2025-12');
  for (const month of ['2024-02', '2026-02', '2026-03', '2026-10', '2026-12']) {
    const days = m.monthDays(month);
    assert.equal(days.length % 7, 0);
    assert.equal(new Date(days[0] + 'T12:00:00Z').getUTCDay(), 1);
    assert.equal(new Date(days.at(-1) + 'T12:00:00Z').getUTCDay(), 0);
  }
  assert.equal(m.monthDays('2024-02').includes('2024-02-29'), true);
  assert.equal(m.validDate('2026-02-29'), false);
  assert.equal(m.validDate('2026-02-30'), false);
  assert.equal(m.validDate('2024-02-29'), true);
  assert.deepEqual(copy(m.dates({ scheduledDate: '2026-10-25' })), ['2026-10-25']);
});

test('de lesdatums verschuiven niet bij zomertijd of een andere browsertijdzone', () => {
  const m = model();
  const dates = ['2026-03-29', '2026-10-25', '2026-12-31', '2027-01-01'];
  const record = { scheduledDates: dates };
  assert.deepEqual(copy(m.dates(record)), dates);
  assert.deepEqual(copy(m.events([record], '2026-10').map(event => event.date)), ['2026-10-25']);
});

test('aanbiederkleur is stabiel bij sorteren en filteren', () => {
  const m = model();
  assert.equal(m.providerColor('3Dindeklas'), m.providerColor('3Dindeklas'));
  assert.match(m.providerColor('Onbekend'), /^#[a-f0-9]{6}$/);
});
