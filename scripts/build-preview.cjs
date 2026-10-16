// Produces only fictional data. No credentials, network requests or live-data fallback.
const fs = require('node:fs');
const vm = require('node:vm');
const ctx = vm.createContext({ Date, console });
for (const f of ['Config.gs','Normalize.gs','Demo.gs']) vm.runInContext(fs.readFileSync('src/'+f,'utf8'),ctx);
const payload = vm.runInContext('demoPayload_()',ctx);
let html = fs.readFileSync('src/Index.html','utf8').replace(/<\?!= include\('([^']+)'\); \?>/g, (_, name) => fs.readFileSync('src/' + name + '.html', 'utf8'));
html = html.replace('<script>\n(() => {','<script>\nwindow.__DEMO_PAYLOAD__ = '+JSON.stringify(payload).replace(/</g,'\\u003c')+';\n(() => {');
fs.mkdirSync('preview',{recursive:true});fs.writeFileSync('preview/index.html',html);
console.log('Fictieve preview gemaakt: preview/index.html');
