/**
 * Snelle, gedeelde dashboardsnapshot voor livegegevens.
 *
 * Alleen de expliciet toegestane browservelden worden opgeslagen. De snapshot
 * wordt gecomprimeerd en over meerdere cache-items verdeeld, omdat Apps Script
 * per cache-item maximaal 100 KB accepteert.
 */
const SNAPSHOT_CACHE_SCHEMA_ = 'workshopkompas-v1';
const SNAPSHOT_CACHE_PREFIX_ = 'dashboard-snapshot:' + SNAPSHOT_CACHE_SCHEMA_ + ':';
const SNAPSHOT_CACHE_MANIFEST_KEY_ = SNAPSHOT_CACHE_PREFIX_ + 'manifest';
const SNAPSHOT_CACHE_CHUNK_SIZE_ = 90000;
const SNAPSHOT_CACHE_MAX_CHUNKS_ = 250;

/** Levert een bestaande snapshot of bouwt één nieuwe vanuit de Google Sheets. */
function liveDashboardSnapshot_(forceRefresh) {
  if (!snapshotCacheEnabled_()) {
    return { snapshot: buildDashboardSnapshot_(), source: 'live' };
  }

  const beforeRefresh = readDashboardSnapshot_();
  if (!forceRefresh && beforeRefresh) {
    return { snapshot: beforeRefresh, source: 'cache' };
  }

  const lock = scriptLock_();
  let hasLock = false;

  try {
    hasLock = !lock || lock.tryLock(30000);
    if (!hasLock) {
      const available = readDashboardSnapshot_();
      if (available) return { snapshot: available, source: 'cache' };
      return { snapshot: buildDashboardSnapshot_(), source: 'live' };
    }

    const afterLock = readDashboardSnapshot_();
    if (!forceRefresh && afterLock) {
      return { snapshot: afterLock, source: 'cache' };
    }
    if (forceRefresh && afterLock && snapshotChanged_(beforeRefresh, afterLock)) {
      return { snapshot: afterLock, source: 'cache' };
    }

    const snapshot = buildDashboardSnapshot_();
    const preserveCompleteSnapshot = beforeRefresh &&
      beforeRefresh.complete === true &&
      snapshot.complete !== true;
    if (!preserveCompleteSnapshot) writeDashboardSnapshot_(snapshot);
    return { snapshot: snapshot, source: 'live' };
  } finally {
    if (lock && hasLock) lock.releaseLock();
  }
}

/** Bouwt bewust een privacyveilige superset voor beide toegangsrollen. */
function buildDashboardSnapshot_() {
  const result = readConfiguredSheets_();
  assertDashboardResult_(result);

  return {
    schema: SNAPSHOT_CACHE_SCHEMA_,
    configVersion: snapshotConfigVersion_(),
    revision: cacheUuid_(),
    updatedAt: new Date().toISOString(),
    complete: result.complete,
    records: result.records.map(function(record) {
      return publicRecord_(record, true);
    }),
    sources: result.sources.map(publicSourceStatus_)
  };
}

function readDashboardSnapshot_() {
  const cache = scriptCache_();
  if (!cache) return null;

  try {
    const manifestText = cache.get(SNAPSHOT_CACHE_MANIFEST_KEY_);
    if (!manifestText) return null;
    const manifest = JSON.parse(manifestText);

    if (manifest.schema !== SNAPSHOT_CACHE_SCHEMA_ ||
        manifest.configVersion !== snapshotConfigVersion_() ||
        typeof manifest.revision !== 'string' ||
        !Number.isInteger(manifest.chunkCount) ||
        manifest.chunkCount < 1 ||
        manifest.chunkCount > SNAPSHOT_CACHE_MAX_CHUNKS_) {
      cache.remove(SNAPSHOT_CACHE_MANIFEST_KEY_);
      return null;
    }

    const keys = snapshotChunkKeys_(manifest.revision, manifest.chunkCount);
    const values = cache.getAll(keys);
    if (keys.some(function(key) { return !Object.prototype.hasOwnProperty.call(values, key); })) {
      cache.remove(SNAPSHOT_CACHE_MANIFEST_KEY_);
      return null;
    }

    const snapshot = decodeDashboardSnapshot_(keys.map(function(key) {
      return values[key];
    }).join(''));
    return validDashboardSnapshot_(snapshot) ? snapshot : null;
  } catch (error) {
    cacheError_('read', error);
    try { cache.remove(SNAPSHOT_CACHE_MANIFEST_KEY_); } catch (ignored) {}
    return null;
  }
}

function writeDashboardSnapshot_(snapshot) {
  const cache = scriptCache_();
  if (!cache) return false;

  try {
    const encoded = encodeDashboardSnapshot_(snapshot);
    const chunks = [];
    for (let offset = 0; offset < encoded.length; offset += SNAPSHOT_CACHE_CHUNK_SIZE_) {
      chunks.push(encoded.slice(offset, offset + SNAPSHOT_CACHE_CHUNK_SIZE_));
    }
    if (!chunks.length || chunks.length > SNAPSHOT_CACHE_MAX_CHUNKS_) return false;

    const keys = snapshotChunkKeys_(snapshot.revision, chunks.length);
    const values = keys.reduce(function(entries, key, index) {
      entries[key] = chunks[index];
      return entries;
    }, {});
    const ttl = snapshot.complete === true
      ? snapshotCacheTtlSeconds_()
      : Math.min(snapshotCacheTtlSeconds_(), 300);

    cache.putAll(values, ttl);
    cache.put(SNAPSHOT_CACHE_MANIFEST_KEY_, JSON.stringify({
      schema: SNAPSHOT_CACHE_SCHEMA_,
      configVersion: snapshot.configVersion,
      revision: snapshot.revision,
      chunkCount: chunks.length,
      updatedAt: snapshot.updatedAt
    }), ttl);
    return true;
  } catch (error) {
    cacheError_('write', error);
    return false;
  }
}

function encodeDashboardSnapshot_(snapshot) {
  const json = JSON.stringify(snapshot);
  const compressed = Utilities.gzip(Utilities.newBlob(json, 'application/json'));
  return Utilities.base64Encode(compressed.getBytes());
}

function decodeDashboardSnapshot_(encoded) {
  const compressed = Utilities.newBlob(Utilities.base64Decode(encoded));
  const json = Utilities.ungzip(compressed).getDataAsString('UTF-8');
  return JSON.parse(json);
}

function validDashboardSnapshot_(snapshot) {
  return Boolean(
    snapshot &&
    snapshot.schema === SNAPSHOT_CACHE_SCHEMA_ &&
    snapshot.configVersion === snapshotConfigVersion_() &&
    typeof snapshot.updatedAt === 'string' &&
    Array.isArray(snapshot.records) &&
    Array.isArray(snapshot.sources)
  );
}

function snapshotChanged_(beforeRefresh, afterLock) {
  if (!afterLock) return false;
  if (!beforeRefresh) return true;
  return afterLock.revision !== beforeRefresh.revision;
}

function snapshotChunkKeys_(revision, count) {
  return Array.from({ length: count }, function(unused, index) {
    return SNAPSHOT_CACHE_PREFIX_ + 'chunk:' + revision + ':' + index;
  });
}

function snapshotCacheEnabled_() {
  return Boolean(
    APP_CONFIG.snapshotCache &&
    APP_CONFIG.snapshotCache.enabled !== false &&
    typeof CacheService !== 'undefined'
  );
}

function snapshotCacheTtlSeconds_() {
  const configured = Number(APP_CONFIG.snapshotCache && APP_CONFIG.snapshotCache.ttlSeconds);
  if (!isFinite(configured)) return 21600;
  return Math.max(60, Math.min(21600, Math.floor(configured)));
}

/** Verandert de cache automatisch wanneer een relevante broninstelling wijzigt. */
function snapshotConfigVersion_() {
  const sourceConfig = (APP_CONFIG.sources || []).map(function(source) {
    return [source.name, source.type || 'google', source.spreadsheetId, source.sheetName, source.headerRow,
      source.driveId, source.itemId, source.tableName];
  });
  let microsoftIdentity = '';
  if ((APP_CONFIG.sources || []).some(function(source) { return source.type === 'microsoft'; })) {
    const props = PropertiesService.getScriptProperties();
    microsoftIdentity = [props.getProperty('MS_TENANT_ID'), props.getProperty('MS_CLIENT_ID'),
      props.getProperty('MS_GOOGLE_OWNER_EMAIL')];
  }
  const text = JSON.stringify([APP_CONFIG.maxRowsPerSource, sourceConfig, microsoftIdentity]);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function scriptCache_() {
  if (typeof CacheService === 'undefined') return null;
  try {
    return CacheService.getScriptCache();
  } catch (error) {
    cacheError_('service', error);
    return null;
  }
}

function scriptLock_() {
  if (typeof LockService === 'undefined') return null;
  try {
    return LockService.getScriptLock();
  } catch (error) {
    cacheError_('lock', error);
    return null;
  }
}

function cacheUuid_() {
  try {
    return Utilities.getUuid();
  } catch (error) {
    return String(new Date().getTime());
  }
}

function cacheError_(area, error) {
  try {
    const message = error && error.message ? error.message : String(error);
    console.error('[snapshot-cache:' + area + '] ' + message);
  } catch (ignored) {}
}

/** Handler voor een optionele tijdtrigger; controleert het account van de maker. */
function refreshDashboardSnapshot() {
  const email = effectiveUserEmail_();
  const allowedEmails = (APP_CONFIG.allowedEmails || []).map(normalizeEmail_);
  if (!email || allowedEmails.indexOf(email) === -1) throw new Error('Geen toegang.');
  if (!snapshotCacheEnabled_()) return '';
  return liveDashboardSnapshot_(true).snapshot.updatedAt;
}
