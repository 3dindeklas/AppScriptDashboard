const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function context(extra={}) {
  const ctx = vm.createContext({ Date, console, ...extra });
  for (const file of ['Config.gs','Normalize.gs','Code.gs','Sources.gs','Microsoft.gs','Demo.gs','Analytics.html']) {
    vm.runInContext(fs.readFileSync('src/'+file,'utf8').replace(/^<script>\s*|\s*<\/script>\s*$/g,''),ctx);
  }
  return ctx;
}
const headers = ['Aanvraag ID','Datum aanvraag','Schoolnaam','Workshopnaam','Aantal leerlingen','Status','Lesmomenten','PO / VO','Groep / leerjaar','Gemeente / Regio','Totale kosten aanbieder','Te factureren i_lab','Definitieve datum','E-mailadres','Notities'];
const row = ['a1','14-10-2026','School A','3D printen',24,'Akkoord',2,'PO','6/7/8','Ameide','€ 1.234,50','1.500,00','20-11-2026','secret@example.test','Private note'];
const source = {id:'a',label:'Stichting A'};
const normalize = matrix => context().normalizeSource_(matrix,source);
function analytics() { return vm.runInContext('Analytics',context()); }
function record(extra={}) { return {source:'a',foundation:'A',requested:'2026-09-01',scheduled:null,school:'School A',schoolKey:'school a|ameide',region:'Ameide',workshop:'3D',provider:'A',sessions:2,students:24,sector:'PO',grades:[6,7,8],type:'Workshop',status:'Akkoord',statusGroup:'Ingepland',costs:200,revenue:300,...extra}; }
const filterDefaults = {dateField:'requested',includeUndated:true,includeUnknownStudents:true,minStudents:0,maxStudents:100};

test('Dutch numbers, zeros, missing and malformed values remain distinct',()=> {
  const c=context();
  for(const [value, expected] of [['€ 1.234,50',1234.5],['1.234',1234],['25,5',25.5],[0,0],['0',0],['',null],['n.v.t.',null],['12 leerlingen',null],['2x',null],[Infinity,null]]) assert.equal(c.number_(value),expected);
  assert.equal(c.count_(-1),null); assert.equal(c.count_(2.5),null);
});
test('dates parse Dutch, ISO and Excel serials; reject ambiguous/multiple/invalid dates',()=> {
  const c=context();
  assert.equal(c.date_('14/10/2026'),'2026-10-14');assert.equal(c.date_('2024-02-29'),'2024-02-29');
  assert.equal(c.date_(45000),'2023-03-15');assert.equal(c.date_(45000.75),'2023-03-15');
  for(const v of ['31-02-2026','2026-13-01','14-10-2026, 21-10-2026','morgen','2026-01-01<script>']) assert.equal(c.date_(v),null);
});
test('normalization maps by headers and strips contact fields, notes and identifiers',()=> {
  const r=normalize([headers,row]);assert.equal(r.records.length,1);
  assert.equal(r.records[0].costs,1234.5);assert.equal(r.records[0].statusGroup,'Ingepland');
  assert.equal(r.records[0].scheduled,'2026-11-20');assert.deepEqual(Array.from(r.records[0].grades),[6,7,8]);
  const json=JSON.stringify(r);for(const secret of ['secret@example.test','Private note','a1','E-mailadres']) assert.ok(!json.includes(secret));
  const reordered=normalize([headers.slice().reverse(),row.slice().reverse()]);assert.equal(JSON.stringify(reordered),JSON.stringify(r));
});
test('spacers and header whitespace tolerated, required and duplicate headers fail',()=> {
  const h=headers.map(v=>'  '+v+'  ');h.splice(3,0,'',''); const r=row.slice();r.splice(3,0,'','');
  assert.equal(normalize([h,r]).records.length,1);
  assert.throws(()=>normalize([['Schoolnaam'],['A']]),/Verplichte/);
  assert.throws(()=>normalize([headers.concat(' Schoolnaam '),row.concat('B')]),/Dubbele kolomkop/);
});
test('duplicate IDs reject source; blank IDs warn; empty/formula-only rows ignored',()=> {
  assert.throws(()=>normalize([headers,row,row]),/Dubbele aanvraag/);
  const r=row.slice();r[0]='';assert.equal(normalize([headers,r]).warnings.missingIds,1);
  const empty=Array(headers.length).fill('');empty[10]=1500;
  assert.equal(normalize([headers,empty]).records.length,0);
});
test('combination grades support lists/ranges and reject out-of-sector or ambiguous labels',()=> {
  const c=context(); assert.deepEqual(Array.from(c.grades_('groep 3 t/m 5','PO')),[3,4,5]);
  assert.deepEqual(Array.from(c.grades_('1/2','VO')),[1,2]);assert.deepEqual(Array.from(c.grades_('6/7','VO')),[]);
  assert.deepEqual(Array.from(c.grades_('brugklas','VO')),[]);assert.deepEqual(Array.from(c.grades_('5-3','PO')),[]);
});
test('school years switch on August 1; range endpoints inclusive and missing dates explicit',()=> {
  const a=analytics();assert.equal(a.schoolYear('2026-07-31'),'2025–2026');assert.equal(a.schoolYear('2026-08-01'),'2026–2027');
  const rows=[record(),record({requested:null}),record({requested:'2026-10-31'}),record({requested:'2026-11-01'})];
  assert.equal(a.filter(rows,{...filterDefaults,from:'2026-09',to:'2026-10',includeUndated:false}).length,2);
  assert.equal(a.filter(rows,{...filterDefaults,from:'2026-09',to:'2026-10'}).length,3);
  assert.equal(a.filter(rows,{...filterDefaults,dateField:'scheduled',includeUndated:false}).length,0);
});
test('combined dropdowns and sliders filter records including true zero and missing counts',()=> {
  const a=analytics(), rows=[record(),record({source:'b'}),record({students:null}),record({students:0}),record({sector:'VO'})];
  assert.equal(a.filter(rows,{...filterDefaults,source:'a',sector:'PO',minStudents:20,includeUnknownStudents:false}).length,1);
  assert.equal(a.filter(rows,{...filterDefaults,maxStudents:0,includeUnknownStudents:false}).length,1);
  assert.equal(a.filter(rows,{...filterDefaults,maxStudents:0}).length,2);
});
test('summary counts requests and sessions separately, deduplicates schools across foundations',()=> {
  const a=analytics(), s=a.summary([record(),record({source:'b',students:26}),record({students:null,sessions:null,schoolKey:''})]);
  assert.equal(s.requests,3);assert.equal(s.students,50);assert.equal(s.sessions,4);assert.equal(s.schools,1);
  assert.equal(s.avgPerSchool,2);assert.equal(s.avgStudents,25);assert.equal(s.unknownStudents,1);
});
test('finance excludes incomplete pairs from margin and uses weighted percentage',()=> {
  const s=analytics().summary([record(),record({costs:100,revenue:1000}),record({costs:null,revenue:500}),record({costs:20,revenue:null})]);
  assert.equal(s.revenue,1800);assert.equal(s.costs,320);assert.equal(s.margin,1000);assert.equal(s.financeComplete,2);
  assert.ok(Math.abs(s.marginPct-1000/1300*100)<1e-9);
  assert.equal(analytics().summary([]).marginPct,null);
});
test('mixed-grade allocation preserves total requests and includes unknown grades',()=> {
  const a=analytics();const bars=a.grades([record(),record({grades:[]}),record({sector:'VO',grades:[1]})],'PO');
  assert.ok(Math.abs(bars.reduce((s,r)=>s+r.value,0)-2)<1e-9);
});
test('month timeline fills gaps, empty data and negative date intervals are handled',()=> {
  const a=analytics();assert.deepEqual(Array.from(a.months([record({requested:'2025-12-20'}),record({requested:'2026-02-01'})],'requested')),['2025-12','2026-01','2026-02']);
  assert.equal(a.summary([record({scheduled:'2026-08-01'})]).delay,null);
  assert.equal(a.summary([record({scheduled:'2026-09-11'})]).delay,10);
  assert.equal(a.summary([]).avgPerSchool,null);
});
function authContext(email, properties={}, extras={}) {
  return context({Session:{getActiveUser:()=>({getEmail:()=>email})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]??null})},...extras});
}
test('deny by default, blank identity denied, exact email allowlist checked on every RPC',()=> {
  for (const email of ['', 'intruder@example.test', 'allowed@example.test.attacker']) {
    const c=authContext(email,{DASHBOARD_ALLOWED_EMAILS:'allowed@example.test'});
    assert.throws(()=>c.getDashboardData(),/Geen toegang/);
  }
  assert.throws(()=>authContext('allowed@example.test').getDashboardData(),/Geen toegang/);
  assert.equal(authContext('Allowed@Example.test',{DASHBOARD_ALLOWED_EMAILS:'allowed@example.test'}).getDashboardData().demo,true);
});
test('live failures report partial data without leaking upstream errors or substituting demos',()=> {
  const c=authContext('a@test.nl',{DASHBOARD_ALLOWED_EMAILS:'a@test.nl',DEMO_MODE:'false',DASHBOARD_SOURCES:JSON.stringify([{id:'a',label:'A'},{id:'b',label:'B'}])});
  c.readSource_=s=>{if(s.id==='b')throw Error('TOKEN private sheet data');return [headers,row];};
  const payload=c.getDashboardData();assert.equal(payload.demo,false);assert.equal(payload.records.length,1);
  assert.equal(payload.sources[1].ok,false);assert.ok(!JSON.stringify(payload).includes('TOKEN'));
});
test('Graph rejects foreign next-link hosts before attaching bearer token',()=> {
  let fetched=false;const c=context({UrlFetchApp:{fetch:()=>{fetched=true;}}});
  assert.throws(()=>c.graphGet_('https://attacker.test/','secret'),/Onveilige/);assert.equal(fetched,false);
  assert.throws(()=>c.graphGet_('https://graph.microsoft.com.attacker.test/v1.0/','secret'),/Onveilige/);
});
test('Microsoft adapter paginates rows and orders table columns by index',()=> {
  const c=context();c.microsoftToken_=()=> 'test';let pages=0;
  c.graphGet_=url=>{
    if(url.includes('/columns'))return {value:[{index:1,name:'Schoolnaam'},{index:0,name:'Aanvraag ID'}]};
    pages++;return {value:pages===1?Array.from({length:500},(_,i)=>({values:[[String(i),'School']]})):[{values:[['last','School']]}]};
  };
  const rows=c.readMicrosoft_({driveId:'d',itemId:'i',tableName:'T',connectionId:'M365_B'});
  assert.equal(rows.length,502);assert.equal(rows[0][0],'Aanvraag ID');assert.equal(pages,2);
});
test('Microsoft refresh rotates token and releases lock on success/failure',()=> {
  let released=0, saved, removed;const props={M365_B_TENANT_ID:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',M365_B_CLIENT_ID:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',M365_B_REFRESH_TOKEN:'old'};
  const c=context({PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>saved=[k,v]})},LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>released++})},CacheService:{getScriptCache:()=>({get:()=>null,put:()=>{}})}});
  c.tokenRequest_=()=>({access_token:'new-access',refresh_token:'new-refresh',expires_in:3600});assert.equal(c.microsoftToken_('M365_B'),'new-access');assert.equal(saved[1],'new-refresh');assert.equal(released,1);
  c.tokenRequest_=()=>{throw Error('offline');};assert.throws(()=>c.microsoftToken_('M365_B'),/offline/);assert.equal(released,2);
});
test('Google adapter respects configured header row and refuses silent truncation',()=> {
  let range;
  const sheet={getLastRow:()=>10,getLastColumn:()=>3,getRange:(...args)=>{range=args;return {getValues:()=>[['headers']]};}};
  const c=context({SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet})}});
  c.readSource_({type:'googleSheets',spreadsheetId:'x',sheetName:'Data',headerRow:8});assert.deepEqual(range,[8,1,3,3]);
  sheet.getLastRow=()=>16000;assert.throws(()=>c.readSource_({type:'googleSheets',spreadsheetId:'x',sheetName:'Data',headerRow:8}),/Rijlimiet/);
});
test('only doGet and guarded getDashboardData are exposed Apps Script RPCs',()=> {
  const names=fs.readdirSync('src').filter(f=>f.endsWith('.gs')).flatMap(f=>[...fs.readFileSync('src/'+f,'utf8').matchAll(/^function (\w+)\(/gm)].map(m=>m[1])).filter(n=>!n.endsWith('_'));
  assert.deepEqual(names.sort(),['doGet','getDashboardData','include']);
});
test('demo contains both sources, fictional schools, and no hidden personal fields',()=> {
  const p=context().demoPayload_();assert.equal(p.demo,true);assert.equal(p.sources.length,2);assert.equal(p.records.length,163);
  assert.ok(p.records.every(r=>r.school.startsWith('Voorbeeldschool ')));
  assert.ok(!JSON.stringify(p).includes('@'));
});

test('invalid source JSON returns an actionable safe diagnostic, never demo fallback',()=> {
  for (const invalid of ['[{ id: "secret-sheet" }]', "[{'id':'secret-sheet'}]", '[{"id":"secret-sheet",}]', '', '   ', '```json\n[]\n```']) {
    const c=authContext('a@test.nl',{DASHBOARD_ALLOWED_EMAILS:'a@test.nl',DASHBOARD_SOURCES:invalid});
    const payload=c.getDashboardData();
    assert.equal(payload.error.code,'CONFIG_SOURCES_JSON');
    assert.match(payload.error.message,/dubbele rechte aanhalingstekens/);
    assert.equal(payload.records,undefined);assert.equal(payload.demo,undefined);
    assert.ok(!JSON.stringify(payload).includes('secret-sheet'));
  }
});
test('source config validates arrays, entries and booleans without incidental TypeErrors',()=> {
  const cases=[['null','CONFIG_SOURCES_SHAPE'],['{}','CONFIG_SOURCES_SHAPE'],['[]','CONFIG_SOURCES_SHAPE'],
    ['[null]','CONFIG_SOURCES_ENTRY'],['["source"]','CONFIG_SOURCES_ENTRY'],
    ['[{"id":3,"label":"A"}]','CONFIG_SOURCES_ENTRY'],
    ['[{"id":"a","label":"A","enabled":"false"}]','CONFIG_SOURCES_ENTRY'],
    ['[{"id":"a","label":"A"},{"id":"a","label":"B"}]','CONFIG_SOURCES_ENTRY'],
    ['[{"id":"a","label":"A","enabled":false}]','CONFIG_SOURCES_DISABLED']];
  for(const [raw,expected] of cases) {
    const c=authContext('a@test.nl',{DASHBOARD_ALLOWED_EMAILS:'a@test.nl',DASHBOARD_SOURCES:raw});
    assert.equal(c.getDashboardData().error.code,expected);
  }
});
test('deleted sources property uses Config.gs; valid JSON still loads live; demo typos fail closed',()=> {
  const props={DASHBOARD_ALLOWED_EMAILS:'a@test.nl',DEMO_MODE:'true'};
  assert.equal(authContext('a@test.nl',props).getDashboardData().demo,true);
  const c=authContext('a@test.nl',{...props,DEMO_MODE:' false ',DASHBOARD_SOURCES:'[{"id":"a","label":"A","type":"googleSheets"}]'});
  c.readSource_=()=>[headers,row];assert.equal(c.getDashboardData().records.length,1);
  for(const value of ['yes','"false"','']) {
    assert.equal(authContext('a@test.nl',{...props,DEMO_MODE:value}).getDashboardData().error.code,'CONFIG_DEMO_MODE');
  }
});
function htmlMock(overrides={}) {
  const files={
    Index:"<html><?!= include('Styles'); ?><?!= include('Analytics'); ?><?!= include('Client'); ?></html>",
    Styles:'<style>body{color:green}</style>', Analytics:'<script>const a=1;</script>', Client:'<script>const b=2;</script>',
    ...overrides
  };
  let reads=0, includeFn;
  const output=html=>({html,getContent(){return html;},setTitle(){return this;},addMetaTag(){return this;}});
  return {get reads(){return reads;},setInclude(fn){includeFn=fn;},createHtmlOutput:output,
    createHtmlOutputFromFile:name=>{reads++;if(files[name] instanceof Error)throw files[name];return {getContent:()=>files[name]};},
    createTemplateFromFile:name=>{reads++;if(files[name] instanceof Error)throw files[name];return {evaluate:()=>{
      try { return output(files[name].replace(/<\?!= include\('([^']+)'\); \?>/g,(_,partial)=>includeFn(partial))); }
      catch(error) { throw Error('Template evaluation failed: '+error.message); }
    }};}};
}
function attachInclude(context,service){service.setInclude(context.include);return context;}
test('doGet denies unauthorized users before parsing config or reading UI files',()=> {
  const service=htmlMock();
  const c=authContext('outsider@test.nl',{DASHBOARD_ALLOWED_EMAILS:'a@test.nl',DASHBOARD_SOURCES:'bad json'},
    {console:{error:()=>{}},HtmlService:service});
  const html=c.doGet().html;
  assert.match(html,/<h1>Geen toegang<\/h1>/);assert.ok(!html.includes('CONFIG_'));assert.equal(service.reads,0);
  assert.throws(()=>c.getDashboardData(),/Geen toegang/);
});
test('doGet separates authorized configuration failures from access denials',()=> {
  const service=htmlMock(),logs=[];
  const c=authContext('a@test.nl',{DASHBOARD_ALLOWED_EMAILS:'a@test.nl',DASHBOARD_SOURCES:'[{ secret: "private-sheet" }]'},
    {console:{error:m=>logs.push(m)},HtmlService:service});
  const html=c.doGet().html;
  assert.match(html,/<h1>Configuratiefout<\/h1>/);assert.match(html,/CONFIG_SOURCES_JSON/);
  assert.ok(!html.includes('private-sheet'));assert.ok(!logs.join('').includes('private-sheet'));assert.equal(service.reads,0);
});
test('official include reads only allowlisted static partials',()=> {
  const service=htmlMock();
  const c=attachInclude(context({HtmlService:service}),service);
  assert.match(c.include('Styles'),/color:green/);
  assert.throws(()=>c.include('Secrets'),/PAGE_RENDER_FAILED/);
});
test('doGet reports the exact missing UI file without rendering or logging raw exceptions',()=> {
  for(const name of ['Index','Styles','Analytics','Client']) {
    const logs=[],service=htmlMock({[name]:Error('<script>privateToken()</script>')});
    const c=attachInclude(authContext('a@test.nl',{DASHBOARD_ALLOWED_EMAILS:'a@test.nl'},
      {console:{error:m=>logs.push(m)},HtmlService:service}),service);
    const html=c.doGet().html;assert.match(html,new RegExp('UI_FILE_'+name.toUpperCase()));assert.ok(!html.includes('Geen toegang'));
    assert.ok(!html.includes('privateToken'));assert.deepEqual(logs,['Workshopkompas: UI_FILE_'+name.toUpperCase()]);
  }
});

test('unexpected identity-service error is not falsely reported as access denied',()=> {
  const c=context({Session:{getActiveUser:()=>{throw Error('provider private details');}},console:{error:()=>{}},HtmlService:htmlMock()});
  const html=c.doGet().html;assert.match(html,/ACCESS_CHECK_FAILED/);assert.ok(!html.includes('provider private details'));
});
test('authorized doGet evaluates the official include pattern and diagnostics pass',()=> {
  const service=htmlMock();
  const c=attachInclude(authContext('a@test.nl',{DASHBOARD_ALLOWED_EMAILS:'a@test.nl'},
    {console:{log:()=>{},error:()=>{}},HtmlService:service}),service);
  const html=c.doGet().html;
  assert.match(html,/body\{color:green\}/);assert.match(html,/const a=1/);assert.match(html,/const b=2/);
  assert.ok(!html.includes('<?!='));
  const result=JSON.parse(JSON.stringify(c.diagnoseDashboard_()));
  assert.equal(result.ok,true);assert.ok(result.files.Index>90);
  assert.deepEqual(result.files,{Styles:32,Analytics:27,Client:27,Index:99});
  assert.match(c.startupErrorPage_(c.dashboardErrorInfo_('CONFIG_SOURCES_SHAPE')).html,/&quot;id&quot;/);
});
