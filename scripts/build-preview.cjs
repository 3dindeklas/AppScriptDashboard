// Bouwt uitsluitend een lokale preview met fictieve gegevens.
const fs = require('node:fs');
const vm = require('node:vm');

const context = vm.createContext({ Date, console });
for (const file of ['Config.gs', 'Data.gs']) {
  vm.runInContext(fs.readFileSync('src/' + file, 'utf8'), context);
}

const demo = vm.runInContext('demoDashboardData_()', context);
const payload = {
  mode: 'demo',
  generatedAt: new Date().toISOString(),
  complete: demo.complete,
  permissions: { canViewFinancials: true },
  records: vm.runInContext('demoDashboardData_().records.map(function(record) { return publicRecord_(record, true); })', context),
  sources: vm.runInContext('demoDashboardData_().sources.map(publicSourceStatus_)', context)
};

let html = fs.readFileSync('src/Index.html', 'utf8').replace(
  /<\?!= include\('([^']+)'\); \?>/g,
  (_, name) => fs.readFileSync('src/' + name + '.html', 'utf8')
);

html = html.replace(
  '<script>\n  (() => {',
  '<script>\n  window.__DEMO_PAYLOAD__ = ' + JSON.stringify(payload).replace(/</g, '\\u003c') + ';\n  (() => {'
);

fs.mkdirSync('preview', { recursive: true });
fs.writeFileSync('preview/index.html', html);
console.log('Fictieve preview gemaakt: preview/index.html');
