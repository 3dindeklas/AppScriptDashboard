const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

function setup(options = {}) {
  let now = Date.parse('2026-10-21T10:00:00Z');
  const values = new Map();
  const mails = [];
  const templates = [];
  const logs = [];
  const props = {
    getProperty: key => values.get(key) || null,
    setProperty: (key, value) => values.set(key, value),
    deleteProperty: key => values.delete(key),
    getProperties: () => Object.fromEntries(values)
  };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const ctx = vm.createContext({
    Date: Clock,
    console: { error: value => logs.push(String(value)), log: value => logs.push(String(value)) },
    Session: {
      getActiveUser: () => ({ getEmail: () => options.googleEmail || '' }),
      getEffectiveUser: () => ({ getEmail: () => 'jouw-account@voorbeeld.nl' })
    },
    PropertiesService: { getScriptProperties: () => props },
    LockService: { getScriptLock: () => ({ tryLock: () => options.lock !== false, releaseLock() {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (algorithm, value) => Array.from(crypto.createHash('sha256').update(value).digest(), b => b > 127 ? b - 256 : b)
    },
    MailApp: {
      getRemainingDailyQuota: () => {
        if (options.quotaError) throw new Error(options.quotaError);
        return options.quota ?? 100;
      },
      sendEmail: mail => {
        if (options.mailFailure) throw new Error(typeof options.mailFailure === 'string' ? options.mailFailure : 'Geheime providerfout');
        mails.push(mail);
      }
    }
  });
  function output(content) {
    return { content, getContent: () => content,
      setTitle(title) { this.title = title; return this; }, addMetaTag() { return this; } };
  }
  ctx.HtmlService = {
    createTemplateFromFile(name) {
      templates.push(name);
      const template = { accessToken: '', emailLoginEnabled: false };
      template.evaluate = () => {
        const source = fs.readFileSync('src/' + name + '.html', 'utf8');
        let cursor = 0;
        let program = 'let html="";';
        for (const match of source.matchAll(/<\?(!=|=)?([\s\S]*?)\?>/g)) {
          program += 'html+=' + JSON.stringify(source.slice(cursor, match.index)) + ';';
          program += match[1] ? 'html+=(' + match[2].trim().replace(/;$/, '') + ');' : match[2];
          cursor = match.index + match[0].length;
        }
        program += 'html+=' + JSON.stringify(source.slice(cursor)) + ';return html;';
        const render = vm.runInContext('(function(accessToken,emailLoginEnabled){' + program + '})', ctx);
        return output(render(template.accessToken, template.emailLoginEnabled));
      };
      return template;
    },
    createHtmlOutputFromFile: name => output(fs.readFileSync('src/' + name + '.html', 'utf8')),
    createHtmlOutput: output
  };
  for (const file of ['Config.gs', 'Data.gs', 'Auth.gs', 'Code.gs']) {
    let source = fs.readFileSync('src/' + file, 'utf8');
    if (file === 'Config.gs') source = source.replace(/emailAccess: Object.freeze\(\{[\s\S]*?\}\),/,
      'emailAccess: Object.freeze(' + JSON.stringify({ enabled: options.enabled !== false,
        allowedEmails: ['gast@microsoft.example'], codeMinutes: 10, sessionHours: 8 }) + '),');
    vm.runInContext(source, ctx);
  }
  return { ctx, values, mails, templates, logs, advance: ms => { now += ms; },
    code: () => mails[mails.length - 1].body.match(/\b\d{6}\b/)[0] };
}

module.exports = { setup };
