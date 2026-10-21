/** Controleert de ondersteunde Google- en e-maildeployment zonder één model af te dwingen. */
function validateManifest(manifest, filename, { guestOnly = false } = {}) {
  const fail = message => { throw new Error(filename + ': ' + message); };
  if (manifest?.runtimeVersion !== 'V8') fail('Apps Script V8-runtime ontbreekt.');
  const scopes = Array.isArray(manifest.oauthScopes) ? manifest.oauthScopes : [];
  if (!scopes.includes('https://www.googleapis.com/auth/userinfo.email')) {
    fail('De userinfo.email-scope ontbreekt voor de accountcontrole.');
  }
  if (!scopes.some(scope => ['https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/spreadsheets'].includes(scope))) {
    fail('De scope voor het lezen van Google Sheets ontbreekt.');
  }
  if (manifest.webapp?.executeAs === 'USER_DEPLOYING') {
    if (manifest.webapp.access !== 'ANYONE_ANONYMOUS') {
      fail('De e-maildeployment vereist ANYONE_ANONYMOUS voor bezoekers zonder Google-account.');
    }
    if (!scopes.includes('https://www.googleapis.com/auth/script.send_mail')) {
      fail('De e-maildeployment vereist de script.send_mail-scope.');
    }
    return 'email';
  }
  if (manifest.webapp?.executeAs === 'USER_ACCESSING' && !guestOnly) {
    if (!['ANYONE', 'DOMAIN', 'MYSELF'].includes(manifest.webapp.access)) {
      fail('De Google-deployment vereist aangemelde gebruikers; ANYONE_ANONYMOUS past hier niet bij.');
    }
    return 'google';
  }
  fail(guestOnly ? 'Het gastmanifest moet USER_DEPLOYING gebruiken.' :
    'Onbekend uitvoeringsmodel: gebruik USER_DEPLOYING of USER_ACCESSING.');
}

module.exports = { validateManifest };
