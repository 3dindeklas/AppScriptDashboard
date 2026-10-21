/** Microsoft Graph-adapter. Alle functies zijn privé voor google.script.run. */
const MICROSOFT_SCOPE_ = 'https://graph.microsoft.com/Files.ReadWrite offline_access';

function microsoftSettings_() {
  const props = PropertiesService.getScriptProperties();
  const tenant = props.getProperty('MS_TENANT_ID') || '';
  const client = props.getProperty('MS_CLIENT_ID') || '';
  const owner = normalizeEmail_(props.getProperty('MS_GOOGLE_OWNER_EMAIL'));
  if (!owner || effectiveUserEmail_() !== owner ||
      (APP_CONFIG.allowedEmails || []).map(normalizeEmail_).indexOf(owner) === -1) {
    throw new Error('MICROSOFT_OWNER_REQUIRED');
  }
  if (!/^[a-zA-Z0-9.-]+$/.test(tenant) || !/^[a-f0-9-]{36}$/i.test(client)) {
    throw new Error('MICROSOFT_SETUP_REQUIRED');
  }
  return { props: props, tenant: tenant, client: client, identity: tenant + ':' + client };
}

/** Editorbeheer: alleen een toegestane Google-beheerder die als zichzelf uitvoert. */
function requireMicrosoftAdmin_() {
  const email = activeUserEmail_();
  const allowed = (APP_CONFIG.allowedEmails || []).map(normalizeEmail_);
  if (!email || email !== effectiveUserEmail_() || allowed.indexOf(email) === -1) {
    throw new Error('Geen toegang tot Microsoft-beheer.');
  }
}

/** Start handmatig vanuit de Apps Script-editor; nooit via de dashboardpagina. */
function beginMicrosoftConnection_() {
  requireMicrosoftAdmin_();
  return microsoftLocked_(function() {
    const settings = microsoftSettings_();
    const response = microsoftIdentityRequest_(settings, 'devicecode', {
      client_id: settings.client, scope: MICROSOFT_SCOPE_
    });
    const body = response.body;
    if (response.status !== 200 || !body.device_code || !body.user_code || !body.verification_uri ||
        !(Number(body.expires_in) > 0)) throw new Error('MICROSOFT_CONNECT_FAILED');
    const interval = Math.max(5, Number(body.interval) || 5);
    settings.props.setProperty('MS_PENDING_CONNECTION', JSON.stringify({
      identity: settings.identity, deviceCode: body.device_code,
      expiresAt: Date.now() + Number(body.expires_in) * 1000,
      nextPollAt: Date.now() + interval * 1000, interval: interval
    }));
    // Alleen de korte invoercode en Microsoft-aanmeldlocatie, geen device-/OAuth-token.
    console.log('Open https://microsoft.com/devicelogin en vul deze code in: ' + body.user_code +
      '. Meld aan als de beheerder van het Excel-bestand. Voer daarna completeMicrosoftConnection_ uit.');
    return 'Aanmelding gestart. Gebruik alleen de code uit je eigen editoruitvoering.';
  });
}

/** Eén poll per editoruitvoering; respecteert het door Microsoft opgegeven interval. */
function completeMicrosoftConnection_() {
  requireMicrosoftAdmin_();
  return microsoftLocked_(function() {
    const settings = microsoftSettings_();
    const pending = JSON.parse(settings.props.getProperty('MS_PENDING_CONNECTION') || 'null');
    if (!pending || pending.identity !== settings.identity || pending.expiresAt <= Date.now()) {
      settings.props.deleteProperty('MS_PENDING_CONNECTION');
      throw new Error('MICROSOFT_CONNECT_EXPIRED');
    }
    if (pending.nextPollAt > Date.now()) return 'Wacht even en voer completeMicrosoftConnection_ opnieuw uit.';
    const response = microsoftIdentityRequest_(settings, 'token', {
      client_id: settings.client, grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: pending.deviceCode
    });
    if (response.body.error === 'authorization_pending' || response.body.error === 'slow_down') {
      if (response.body.error === 'slow_down') pending.interval += 5;
      pending.nextPollAt = Date.now() + pending.interval * 1000;
      settings.props.setProperty('MS_PENDING_CONNECTION', JSON.stringify(pending));
      return 'Microsoft-aanmelding nog niet afgerond. Wacht en probeer opnieuw.';
    }
    settings.props.deleteProperty('MS_PENDING_CONNECTION');
    if (response.status !== 200) throw new Error('MICROSOFT_CONNECT_FAILED');
    microsoftSaveTokens_(settings, response.body, '');
    console.log('Microsoft gekoppeld. Kies Brongegevens vernieuwen in het dashboard.');
    return 'Microsoft gekoppeld.';
  });
}

function disconnectMicrosoft_() {
  requireMicrosoftAdmin_();
  const snapshotLock = LockService.getScriptLock();
  if (!snapshotLock.tryLock(30000)) throw new Error('MICROSOFT_BUSY');
  try {
    return microsoftLocked_(function() {
      const props = PropertiesService.getScriptProperties();
      props.deleteProperty('MS_TOKENS');
      props.deleteProperty('MS_PENDING_CONNECTION');
      const cache = scriptCache_();
      if (cache) cache.remove(SNAPSHOT_CACHE_MANIFEST_KEY_);
      return 'Microsoft-koppeling en dashboardsnapshot verwijderd.';
    });
  } finally { snapshotLock.releaseLock(); }
}

/** UserLock is gescheiden van de ScriptLock van de snapshot. Deploy als eigenaar. */
function microsoftLocked_(callback) {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(10000)) throw new Error('MICROSOFT_BUSY');
  try {
    return callback();
  } catch (error) {
    const code = error && error.message;
    throw new Error(/^MICROSOFT_[A-Z0-9_]+$/.test(code || '') ? code : 'MICROSOFT_INTERNAL_FAILED');
  } finally { lock.releaseLock(); }
}

function microsoftIdentityRequest_(settings, endpoint, payload) {
  return microsoftFetchJson_('https://login.microsoftonline.com/' + encodeURIComponent(settings.tenant) +
    '/oauth2/v2.0/' + endpoint, { method: 'post', payload: payload });
}

/** Geen providerbody, URL of tokens opnemen in exceptions/logs. Geen redirects met Bearer. */
function microsoftFetchJson_(url, options) {
  let response;
  try {
    response = UrlFetchApp.fetch(url, Object.assign({
      muteHttpExceptions: true, followRedirects: false
    }, options));
  } catch (ignored) { throw new Error('MICROSOFT_NETWORK_FAILED'); }
  let body;
  try { body = JSON.parse(response.getContentText()); }
  catch (ignored) { throw new Error('MICROSOFT_INVALID_RESPONSE'); }
  return { status: response.getResponseCode(), body: body || {} };
}

function microsoftSaveTokens_(settings, body, previousRefreshToken) {
  const refresh = body.refresh_token || previousRefreshToken;
  if (typeof body.access_token !== 'string' || !body.access_token ||
      typeof refresh !== 'string' || !refresh || !(Number(body.expires_in) > 60)) {
    throw new Error('MICROSOFT_INVALID_TOKEN');
  }
  settings.props.setProperty('MS_TOKENS', JSON.stringify({
    identity: settings.identity, accessToken: body.access_token, refreshToken: refresh,
    expiresAt: Date.now() + Number(body.expires_in) * 1000
  }));
  return body.access_token;
}

function microsoftAccessToken_(rejectedToken) {
  return microsoftLocked_(function() {
    const settings = microsoftSettings_();
    const tokens = JSON.parse(settings.props.getProperty('MS_TOKENS') || 'null');
    if (!tokens || tokens.identity !== settings.identity) throw new Error('MICROSOFT_RECONNECT_REQUIRED');
    if (tokens.expiresAt > Date.now() + 60000 && tokens.accessToken !== rejectedToken) return tokens.accessToken;
    const response = microsoftIdentityRequest_(settings, 'token', {
      client_id: settings.client, grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken, scope: MICROSOFT_SCOPE_
    });
    if (response.status !== 200) {
      if (response.body.error === 'invalid_grant') settings.props.deleteProperty('MS_TOKENS');
      throw new Error('MICROSOFT_RECONNECT_REQUIRED');
    }
    return microsoftSaveTokens_(settings, response.body, tokens.refreshToken);
  });
}

function microsoftGraphGet_(path) {
  // Paginering wordt lokaal opgebouwd; externe nextLink-URL's worden nooit gevolgd.
  if (!/^\/drives\/[^/?#]+\/items\/[^/?#]+\/workbook\/tables\/[^/?#]+\/(?:headerRowRange|rows)(?:\?\$top=\d+&\$skip=\d+)?$/.test(path)) {
    throw new Error('MICROSOFT_INVALID_PATH');
  }
  let token = microsoftAccessToken_();
  let response = microsoftFetchJson_('https://graph.microsoft.com/v1.0' + path, {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (response.status === 401) {
    token = microsoftAccessToken_(token);
    response = microsoftFetchJson_('https://graph.microsoft.com/v1.0' + path, {
      headers: { Authorization: 'Bearer ' + token }
    });
  }
  if (response.status !== 200) {
    if (response.status === 429 || response.status === 503) throw new Error('MICROSOFT_TEMPORARILY_UNAVAILABLE');
    throw new Error('MICROSOFT_GRAPH_HTTP_' + response.status);
  }
  return response.body;
}

function microsoftSourceConfigured_(source) {
  return !!(source.driveId && source.itemId && source.tableName);
}

function readMicrosoftTable_(source) {
  const base = '/drives/' + encodeURIComponent(source.driveId) + '/items/' + encodeURIComponent(source.itemId) +
    '/workbook/tables/' + encodeURIComponent(source.tableName);
  const headerResponse = microsoftGraphGet_(base + '/headerRowRange');
  if (!Array.isArray(headerResponse.values) || !Array.isArray(headerResponse.values[0])) {
    throw new Error('MICROSOFT_INVALID_HEADER');
  }
  const headerValues = headerResponse.values[0];
  const header = headerMap_(headerValues, source.name);
  const rows = [];
  const limit = sourceRowLimit_();
  let truncated = false;
  let ended = false;
  // Begrens ook tabellen met duizenden lege/formulerijen (maximaal 20.000 fysieke rijen).
  for (let skip = 0; skip < 20000; skip += 500) {
    const page = microsoftGraphGet_(base + '/rows?$top=500&$skip=' + skip);
    if (!Array.isArray(page.value) || page.value.length > 500) throw new Error('MICROSOFT_INVALID_ROWS');
    for (const entry of page.value) {
      if (!entry || !Array.isArray(entry.values) || entry.values.length !== 1 || !Array.isArray(entry.values[0])) {
        throw new Error('MICROSOFT_INVALID_ROWS');
      }
      const row = entry.values[0];
      if (isEmptyWorkshopRow_(row, header)) continue;
      if (rows.length === limit) { truncated = true; break; }
      rows.push(row);
    }
    if (truncated) break;
    if (page.value.length < 500) { ended = true; break; }
  }
  const result = normalizeSheet_([headerValues].concat(rows), source.name);
  // Ondergrens, niet het onbekende totaal: we lezen bewust niet onbeperkt door.
  result.warnings.rowsTruncated = truncated || !ended ? 1 : 0;
  return result;
}
