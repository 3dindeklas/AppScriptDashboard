/** Delegated device-code sign-in for an organizational Microsoft account. Editor-only helpers. */
function microsoftConfig_(id) {
  if (!/^[A-Z0-9_]+$/.test(id || '')) throw new Error('Ongeldige connectionId.');
  const p = PropertiesService.getScriptProperties();
  const tenant = p.getProperty(id + '_TENANT_ID'), client = p.getProperty(id + '_CLIENT_ID');
  if (!/^[a-f0-9-]{36}$/i.test(tenant || '') || !/^[a-f0-9-]{36}$/i.test(client || '')) throw new Error('Stel tenant- en client-ID in.');
  return { id: id, p: p, client: client, endpoint: 'https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/' };
}
function tokenRequest_(c, payload, route) {
  const r = UrlFetchApp.fetch(c.endpoint + (route || 'token'), {
    method: 'post', payload: Object.assign({ client_id: c.client }, payload),
    muteHttpExceptions: true, followRedirects: false });
  const body = JSON.parse(r.getContentText());
  if (r.getResponseCode() !== 200) {
    if (body.error === 'authorization_pending') throw new Error('Aanmelding nog niet afgerond. Meld je aan en voer deze functie opnieuw uit.');
    throw new Error('Microsoft-aanmelding mislukt of verlopen. Start de verbinding opnieuw; controleer ook tenantbeleid.');
  }
  return body;
}
function microsoftToken_(id) {
  const c = microsoftConfig_(id), lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const cache = CacheService.getScriptCache(), cached = cache.get(id + '_ACCESS_TOKEN');
    if (cached) return cached;
    const refresh = c.p.getProperty(id + '_REFRESH_TOKEN');
    if (!refresh) throw new Error('Microsoft is nog niet gekoppeld.');
    const result = tokenRequest_(c, { grant_type: 'refresh_token', refresh_token: refresh });
    if (!result.access_token) throw new Error('Token ontbreekt.');
    if (result.refresh_token) c.p.setProperty(id + '_REFRESH_TOKEN', result.refresh_token);
    cache.put(id + '_ACCESS_TOKEN', result.access_token, Math.max(1, Math.min(3300, (result.expires_in || 3600) - 120)));
    return result.access_token;
  } finally { lock.releaseLock(); }
}
function setupMicrosoftSource_() {
  const email = requireAccess_();
  const admins = (PropertiesService.getScriptProperties().getProperty('DASHBOARD_ADMIN_EMAILS') || '').split(/[,;\n]/).map(key_);
  if (!admins.includes(email)) throw new Error('Alleen een ingestelde beheerder kan koppelen.');
  const source = settings_().sources.find(s => s.id === CONFIG.microsoftSetupSourceId && s.type === 'microsoftExcel');
  if (!source) throw new Error('Stel microsoftSetupSourceId in Config.gs in.');
  return source;
}
function startMicrosoftConnection_() {
  const c = microsoftConfig_(setupMicrosoftSource_().connectionId);
  const r = tokenRequest_(c, { scope: 'https://graph.microsoft.com/Files.ReadWrite offline_access' }, 'devicecode');
  c.p.setProperty(c.id + '_DEVICE_CODE', r.device_code);
  console.log('Open ' + r.verification_uri + ' en vul code ' + r.user_code + ' in. Voer na aanmelden finishMicrosoftConnection_ uit.');
}
function finishMicrosoftConnection_() {
  const c = microsoftConfig_(setupMicrosoftSource_().connectionId), lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const code = c.p.getProperty(c.id + '_DEVICE_CODE');
    if (!code) throw new Error('Start eerst de verbinding.');
    const r = tokenRequest_(c, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: code });
    if (!r.refresh_token) throw new Error('Geen offline-toestemming ontvangen.');
    c.p.setProperty(c.id + '_REFRESH_TOKEN', r.refresh_token);
    c.p.deleteProperty(c.id + '_DEVICE_CODE');
    CacheService.getScriptCache().remove(c.id + '_ACCESS_TOKEN');
    console.log('Microsoft gekoppeld.');
  } finally { lock.releaseLock(); }
}
function disconnectMicrosoft_() {
  const c = microsoftConfig_(setupMicrosoftSource_().connectionId);
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    c.p.deleteProperty(c.id + '_REFRESH_TOKEN'); c.p.deleteProperty(c.id + '_DEVICE_CODE');
    CacheService.getScriptCache().remove(c.id + '_ACCESS_TOKEN');
  } finally { lock.releaseLock(); }
}
