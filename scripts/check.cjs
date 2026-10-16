const fs = require('node:fs');
const vm = require('node:vm');

const sourceFiles = fs.readdirSync('src');

for (const name of sourceFiles) {
  const source = fs.readFileSync('src/' + name, 'utf8');

  if (name.endsWith('.gs')) {
    new vm.Script(source, { filename: name });
    if (/\b(?:document|window)\b/.test(source)) {
      throw new Error(name + ' bevat browsercode. document/window horen alleen in HTML-bestanden.');
    }
  }

  if (name === 'Client.html') {
    new vm.Script(source.replace(/^<script>\s*|\s*<\/script>\s*$/g, ''), { filename: name });
  }
}

const manifest = JSON.parse(fs.readFileSync('src/appsscript.json', 'utf8'));
if (manifest.runtimeVersion !== 'V8') throw new Error('Apps Script V8-runtime ontbreekt.');

const index = fs.readFileSync('src/Index.html', 'utf8');
for (const include of ["include('Styles')", "include('Client')"]) {
  if (!index.includes(include)) throw new Error('Index.html mist ' + include + '.');
}

console.log('Servercode, clientcode, HTML-includes en manifest zijn syntactisch geldig.');
