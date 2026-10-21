/** Wachtwoordloze toegang: allowlist + eenmalige e-mailcode + herroepbare sessie. */
const AUTH_PREFIX_ = 'workshop-auth:';

function emailAccessSettings_() {
  const config = APP_CONFIG.emailAccess || {};
  return {
    enabled: config.enabled === true,
    allowedEmails: (Array.isArray(config.allowedEmails) ? config.allowedEmails : []).map(normalizeEmail_),
    codeMinutes: authNumber_(config.codeMinutes, 10, 1, 30),
    sessionHours: authNumber_(config.sessionHours, 8, 1, 24)
  };
}

function authNumber_(value, fallback, minimum, maximum) {
  return Number.isFinite(Number(value))
    ? Math.max(minimum, Math.min(maximum, Math.floor(Number(value)))) : fallback;
}

function emailAccessAllowed_(email) {
  email = normalizeEmail_(email);
  const settings = emailAccessSettings_();
  return email.length <= 254 && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email) &&
    settings.enabled && settings.allowedEmails.indexOf(email) !== -1;
}

/** Geeft voor onbekende adressen hetzelfde antwoord en nooit een allowlist terug. */
function requestEmailCode(address) {
  const email = normalizeEmail_(address);
  const settings = emailAccessSettings_();
  const id = authRandom_();
  const response = {
    challengeId: id,
    codeMinutes: settings.codeMinutes,
    message: 'Als dit adres toegang heeft, ontvang je een e-mail met een inlogcode. Controleer ook je ongewenste e-mail.'
  };
  if (!emailAccessAllowed_(email) || email.length > 254 || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)) return response;

  return withAuthLock_(function() {
    const now = Date.now();
    const properties = PropertiesService.getScriptProperties();
    pruneAuthProperties_(properties, now);
    const mailKey = AUTH_PREFIX_ + 'mail:' + authHash_(email);
    const mail = authRead_(properties, mailKey) || {};
    const globalKey = AUTH_PREFIX_ + 'rate';
    const global = authRead_(properties, globalKey) || {};
    // Hoogstens vijf mails per adres en dertig per project per uur; minimaal 60 s ertussen.
    if (mail.lastSentAt > now - 60000 || (mail.expiresAt > now && mail.count >= 5) ||
        (global.expiresAt > now && global.count >= 30)) {
      if (mail.challengeId) response.challengeId = mail.challengeId;
      return response;
    }
    const code = String(100000 + parseInt(authRandom_().slice(0, 12), 16) % 900000);
    const key = AUTH_PREFIX_ + 'challenge:' + authHash_(id);
    properties.setProperty(key, JSON.stringify({
      email: email, codeHash: authHash_(id + ':' + code), attempts: 0,
      expiresAt: now + settings.codeMinutes * 60000
    }));
    let phase = 'quota';
    try {
      remainingMailQuota_();
      phase = 'send';
      MailApp.sendEmail({
        to: email,
        subject: 'Je inlogcode voor Workshopkompas',
        body: 'Je inlogcode voor Workshopkompas is: ' + code + '\n\n' +
          'Deze code is ' + settings.codeMinutes + ' minuten geldig en kan één keer worden gebruikt.\n' +
          'Deel de code niet. Heb je geen code aangevraagd? Dan kun je deze e-mail negeren.',
        name: 'Workshopkompas'
      });
    } catch (error) {
      properties.deleteProperty(key);
      throw emailMailFailure_(error, phase);
    }
    // Tel alleen geaccepteerde verzendingen. Een mislukte mail geeft nooit een
    // onbruikbare challenge terug en maakt een eerder verstuurde code niet ongeldig.
    properties.setProperty(mailKey, JSON.stringify({
      lastSentAt: now, challengeId: id,
      count: mail.expiresAt > now ? mail.count + 1 : 1,
      expiresAt: mail.expiresAt > now ? mail.expiresAt : now + 3600000
    }));
    properties.setProperty(globalKey, JSON.stringify({
      count: global.expiresAt > now ? global.count + 1 : 1,
      expiresAt: global.expiresAt > now ? global.expiresAt : now + 3600000
    }));
    if (mail.challengeId) properties.deleteProperty(AUTH_PREFIX_ + 'challenge:' + authHash_(mail.challengeId));
    return response;
  });
}

/** Voer als toegestane Google-beheerder uit in de editor; verstuurt geen mail. */
function checkEmailAccessSetup() {
  requireAccess_();
  let remaining;
  try { remaining = remainingMailQuota_(); } catch (error) { throw emailMailFailure_(error, 'setup'); }
  const settings = emailAccessSettings_();
  const result = {
    emailAccessEnabled: settings.enabled,
    allowedAddressesConfigured: settings.allowedEmails.some(emailAccessAllowed_),
    mailPermissionGranted: true,
    remainingDailyQuota: remaining
  };
  console.log('E-mailcontrole geslaagd: ' + JSON.stringify(result));
  return result;
}

function remainingMailQuota_() {
  const remaining = MailApp.getRemainingDailyQuota();
  if (remaining < 1) {
    const error = new Error('Het dagelijkse Google-mailquotum is verbruikt.');
    error.mailCode = 'EMAIL_MAIL_QUOTA_EXCEEDED';
    throw error;
  }
  return remaining;
}

/** Publiek: een vaste herstelmelding. Serverlog: begrensde, opgeschoonde oorzaak. */
function emailMailFailure_(error, phase) {
  const detail = String(error && error.message ? error.message : error);
  let code = 'EMAIL_CODE_SEND_FAILED';
  let message = 'Er kon geen inlogcode worden verstuurd. Neem contact op met de beheerder.';
  if (/script\.send_mail|authorization|authorisation|permission|not authorized|access denied|autorisatie|machtiging|toestemming/i.test(detail)) {
    code = 'EMAIL_MAIL_PERMISSION_REQUIRED';
    message = 'De app heeft geen toestemming om inlogcodes te versturen. Laat de beheerder het gastmanifest en de Google-mailautorisatie controleren.';
  } else if ((error && error.mailCode === 'EMAIL_MAIL_QUOTA_EXCEEDED') ||
      /\bquota\b|daily limit|limit exceeded|too many times|limiet|quotum/i.test(detail)) {
    code = 'EMAIL_MAIL_QUOTA_EXCEEDED';
    message = 'De dagelijkse verzendlimiet is bereikt. Probeer later opnieuw of neem contact op met de beheerder.';
  }
  const reference = errorReference_();
  const safeDetail = detail
    .replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+/gi, '[e-mailadres]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[sleutel]')
    .replace(/\b\d{6}\b/g, '[code]')
    .slice(0, 1500);
  try {
    console.error('[' + reference + '] requestEmailCode phase=' + phase + ' code=' + code + ': ' + safeDetail);
  } catch (loggingError) { /* Een loggingfout mag de herstelmelding niet blokkeren. */ }
  return new Error(message + ' Foutcode: ' + code + '. Referentie: ' + reference + '.');
}

function verifyEmailCode(challengeId, code) {
  if (!authTokenShape_(challengeId)) throw invalidCode_();
  return withAuthLock_(function() {
    const properties = PropertiesService.getScriptProperties();
    const key = AUTH_PREFIX_ + 'challenge:' + authHash_(challengeId);
    const challenge = authRead_(properties, key);
    const now = Date.now();
    if (!challenge || !Number.isFinite(challenge.expiresAt) || challenge.expiresAt <= now ||
        !Number.isInteger(challenge.attempts) || challenge.attempts >= 5 || !emailAccessAllowed_(challenge.email)) {
      properties.deleteProperty(key);
      throw invalidCode_();
    }
    if (!/^\d{6}$/.test(String(code)) || !authEqual_(challenge.codeHash, authHash_(challengeId + ':' + code))) {
      challenge.attempts += 1;
      if (challenge.attempts >= 5) properties.deleteProperty(key);
      else properties.setProperty(key, JSON.stringify(challenge));
      throw invalidCode_();
    }
    properties.deleteProperty(key);
    pruneAuthProperties_(properties, now);
    const sessions = Object.keys(properties.getProperties()).filter(function(name) {
      return name.indexOf(AUTH_PREFIX_ + 'session:') === 0;
    });
    if (sessions.length >= 200) throw new Error('Er zijn te veel actieve sessies. Probeer later opnieuw.');
    const token = authRandom_();
    const expiresAt = now + emailAccessSettings_().sessionHours * 3600000;
    properties.setProperty(AUTH_PREFIX_ + 'session:' + authHash_(token), JSON.stringify({ email: challenge.email, expiresAt: expiresAt }));
    return { token: token };
  });
}

function emailSession_(token) {
  if (!authTokenShape_(token)) throw accessRequired_();
  const properties = PropertiesService.getScriptProperties();
  const key = AUTH_PREFIX_ + 'session:' + authHash_(token);
  const session = authRead_(properties, key);
  if (!session || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now() || !emailAccessAllowed_(session.email)) {
    properties.deleteProperty(key);
    throw accessRequired_();
  }
  return session;
}

function getSessionStatus(token) {
  const session = emailSession_(token);
  return { expiresInMs: session.expiresAt - Date.now() };
}

function logoutDashboard(token) {
  if (authTokenShape_(token)) {
    PropertiesService.getScriptProperties().deleteProperty(AUTH_PREFIX_ + 'session:' + authHash_(token));
  }
  return true;
}

function accessRequired_() {
  return new Error('Geen toegang of je sessie is verlopen. Foutcode: ACCESS_REQUIRED.');
}

function invalidCode_() {
  return new Error('De code is ongeldig of verlopen. Vraag zo nodig een nieuwe code aan.');
}

function authTokenShape_(token) {
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
}

function authRandom_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
}

function authHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)
    .map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}

function authEqual_(left, right) {
  if (typeof left !== 'string' || left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return different === 0;
}

function authRead_(properties, key) {
  try { return JSON.parse(properties.getProperty(key) || 'null'); } catch (error) { return null; }
}

function pruneAuthProperties_(properties, now) {
  const all = properties.getProperties();
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(AUTH_PREFIX_) !== 0) return;
    let value;
    try { value = JSON.parse(all[key]); } catch (error) { value = null; }
    if (!value || !Number.isFinite(value.expiresAt) || value.expiresAt <= now) properties.deleteProperty(key);
  });
}

function withAuthLock_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Het aanmelden is even druk. Probeer het nogmaals.');
  try { return callback(); } finally { lock.releaseLock(); }
}
