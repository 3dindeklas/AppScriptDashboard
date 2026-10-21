const test = require('node:test');
const assert = require('node:assert/strict');
const { validateManifest } = require('../scripts/validate-manifest.cjs');

function manifest(mode = 'USER_DEPLOYING') {
  return {
    runtimeVersion: 'V8',
    oauthScopes: ['https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      ...(mode === 'USER_DEPLOYING' ? ['https://www.googleapis.com/auth/script.send_mail'] : [])],
    webapp: { executeAs: mode, access: mode === 'USER_DEPLOYING' ? 'ANYONE_ANONYMOUS' : 'ANYONE' }
  };
}

test('manifestcontrole accepteert gasttoegang namens de beheerder en bestaande Google-toegang', () => {
  assert.equal(validateManifest(manifest(), 'manifest'), 'email');
  assert.equal(validateManifest(manifest('USER_ACCESSING'), 'manifest'), 'google');
  const readWrite = manifest();
  readWrite.oauthScopes[1] = 'https://www.googleapis.com/auth/spreadsheets';
  assert.equal(validateManifest(readWrite, 'manifest'), 'email');
});

test('gasttoegang vereist mailrecht en bereikbaarheid zonder Google-account', () => {
  const noMail = manifest();
  noMail.oauthScopes.pop();
  assert.throws(() => validateManifest(noMail, 'gast.json'), /gast.json:.*script.send_mail/);
  const signedInOnly = manifest();
  signedInOnly.webapp.access = 'ANYONE';
  assert.throws(() => validateManifest(signedInOnly, 'gast.json'), /ANYONE_ANONYMOUS/);
});

test('alle uitvoeringsmodellen vereisen V8, identiteit en een Sheet-scope', () => {
  for (const mode of ['USER_DEPLOYING', 'USER_ACCESSING']) {
    const oldRuntime = manifest(mode);
    oldRuntime.runtimeVersion = 'DEPRECATED_ES5';
    assert.throws(() => validateManifest(oldRuntime, 'manifest'), /V8/);
    const noIdentity = manifest(mode);
    noIdentity.oauthScopes.shift();
    assert.throws(() => validateManifest(noIdentity, 'manifest'), /userinfo.email/);
    const noSheets = manifest(mode);
    noSheets.oauthScopes.splice(1, 1);
    assert.throws(() => validateManifest(noSheets, 'manifest'), /Google Sheets/);
  }
});

test('onbekende uitvoeringsmodellen en anonieme Google-deployments blijven ongeldig', () => {
  const unknown = manifest();
  unknown.webapp.executeAs = 'ONBEKEND';
  assert.throws(() => validateManifest(unknown, 'manifest'), /Onbekend uitvoeringsmodel/);
  const anonymous = manifest('USER_ACCESSING');
  anonymous.webapp.access = 'ANYONE_ANONYMOUS';
  assert.throws(() => validateManifest(anonymous, 'manifest'), /Google-deployment/);
});

test('apart gastmanifest blijft verplicht in gastmodus', () => {
  assert.equal(validateManifest(manifest(), 'gast', { guestOnly: true }), 'email');
  assert.throws(() => validateManifest(manifest('USER_ACCESSING'), 'gast', { guestOnly: true }), /gastmanifest.*USER_DEPLOYING/);
});
