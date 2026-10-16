const fs = require('node:fs');
const vm = require('node:vm');
for (const name of fs.readdirSync('src')) {
  const source = fs.readFileSync('src/' + name,'utf8');
  if (name.endsWith('.gs')) new vm.Script(source, {filename:name});
  if (['Analytics.html','Client.html'].includes(name)) new vm.Script(source.replace(/^<script>\s*|\s*<\/script>\s*$/g,''),{filename:name});
}
const manifest = JSON.parse(fs.readFileSync('src/appsscript.json','utf8'));
if (manifest.webapp.executeAs !== 'USER_ACCESSING' || manifest.webapp.access !== 'ANYONE') throw Error('Unexpected deployment identity');
JSON.parse(fs.readFileSync('docs/sources.example.json', 'utf8'));
console.log('Apps Script, browser JavaScript, manifest and source-example syntax OK.');
