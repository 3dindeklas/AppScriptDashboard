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
if (manifest.webapp?.executeAs !== 'USER_ACCESSING') {
  throw new Error('De web-app moet uitvoeren als de gebruiker die de app opent.');
}
if (!manifest.oauthScopes?.includes('https://www.googleapis.com/auth/userinfo.email')) {
  throw new Error('De userinfo.email-scope ontbreekt voor de accountcontrole.');
}

const index = fs.readFileSync('src/Index.html', 'utf8');
for (const include of ["include('Styles')", "include('Municipalities')", "include('Client')"]) {
  if (!index.includes(include)) throw new Error('Index.html mist ' + include + '.');
}
const asset = fs.readFileSync('src/Municipalities.html', 'utf8');
const map = JSON.parse(asset.match(/<script[^>]*>([\s\S]*)<\/script>/)[1]);
if (!Array.isArray(map.municipalities) || map.municipalities.length < 300) {
  throw new Error('De openbare gemeentegrenzen ontbreken of zijn onvolledig.');
}

console.log('Servercode, clientcode, HTML-includes en manifest zijn syntactisch geldig.');
