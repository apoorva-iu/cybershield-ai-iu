'use strict';

const crypto = require('crypto');
const cfg = require('../config');
const DB = require('../db');

const KEY_PREFIX = 'cs_ext_';
// Memory store used only when running offline unit tests without a DB client
const memoryExtensionKeys = [];

function getTableName() {
  return (cfg.runtime && cfg.runtime.database && cfg.runtime.database.tables && cfg.runtime.database.tables.extensionKeys) || 'extension_keys';
}

function hashExtensionKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey || '')).digest('hex');
}

function generatePlainExtensionKey() {
  return KEY_PREFIX + crypto.randomBytes(24).toString('hex');
}

function hasExtensionKeyPrefix(token) {
  return typeof token === 'string' && token.startsWith(KEY_PREFIX);
}

function isOfflineTestMode() {
  return Boolean(process.env.npm_lifecycle_event && process.env.npm_lifecycle_event.startsWith('test')) && (!DB.getClient() || DB.getStatus() !== 'connected');
}

function resetExtensionKeysMemory() {
  memoryExtensionKeys.length = 0;
}

/**
 * Revokes all active extension keys for a user, then creates and stores a new hashed key.
 * Plain key is returned once and never stored.
 */
async function createExtensionKey(userId) {
  if (!userId) throw new Error('User ID is required');
  const nowIso = new Date().toISOString();
  const plainKey = generatePlainExtensionKey();
  const last4 = plainKey.slice(-4);
  const keyHash = hashExtensionKey(plainKey);
  // Embed last4 into UUID so last 4 chars can be retrieved without storing plain key or hash
  const newId = `${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(2).toString('hex')}-4${crypto.randomBytes(2).toString('hex').slice(1)}-a${crypto.randomBytes(2).toString('hex').slice(1)}-${crypto.randomBytes(4).toString('hex')}${last4}`;

  if (isOfflineTestMode()) {
    for (const row of memoryExtensionKeys) {
      if (row.user_id === userId && row.revoked_at === null) {
        row.revoked_at = nowIso;
      }
    }
    memoryExtensionKeys.push({
      id: newId,
      user_id: userId,
      key_hash: keyHash,
      created_at: nowIso,
      revoked_at: null,
      last4
    });
    return { id: newId, key: plainKey, last4, createdAt: nowIso };
  }

  const client = DB.getClient();
  if (!client || DB.getStatus() !== 'connected') {
    const err = new Error('Database unavailable');
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }

  const table = getTableName();
  // One active key per user: revoke any prior active key first
  const { error: revokeErr } = await client
    .from(table)
    .update({ revoked_at: nowIso })
    .eq('user_id', userId)
    .is('revoked_at', null);

  if (revokeErr) {
    throw new Error(revokeErr.message || 'Could not revoke previous extension key');
  }

  const { error: insertErr } = await client
    .from(table)
    .insert({
      id: newId,
      user_id: userId,
      key_hash: keyHash,
      created_at: nowIso,
      revoked_at: null
    });

  if (insertErr) {
    throw new Error(insertErr.message || 'Could not create extension key');
  }

  return { id: newId, key: plainKey, last4, createdAt: nowIso };
}

/**
 * Returns active key metadata for a user without exposing hashes or keys.
 */
async function getExtensionKeyStatus(userId) {
  if (!userId) return { hasKey: false, last4: null, createdAt: null, id: null };

  if (isOfflineTestMode()) {
    const active = memoryExtensionKeys
      .filter(r => r.user_id === userId && r.revoked_at === null)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const row = active[0] || null;
    return {
      hasKey: Boolean(row),
      last4: row ? (row.last4 || (row.id ? row.id.slice(-4) : null)) : null,
      createdAt: row ? row.created_at : null,
      id: row ? row.id : null
    };
  }

  const client = DB.getClient();
  if (!client || DB.getStatus() !== 'connected') {
    const err = new Error('Database unavailable');
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }

  const table = getTableName();
  const { data, error } = await client
    .from(table)
    .select('id, created_at')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message || 'Could not load extension key status');
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    hasKey: Boolean(row),
    last4: row && row.id ? row.id.slice(-4) : null,
    createdAt: row ? row.created_at : null,
    id: row ? row.id : null
  };
}

/**
 * Revokes all active extension keys for a user.
 */
async function revokeExtensionKeys(userId) {
  if (!userId) return { revoked: false };
  const nowIso = new Date().toISOString();

  if (isOfflineTestMode()) {
    for (const row of memoryExtensionKeys) {
      if (row.user_id === userId && row.revoked_at === null) {
        row.revoked_at = nowIso;
      }
    }
    return { revoked: true };
  }

  const client = DB.getClient();
  if (!client || DB.getStatus() !== 'connected') {
    const err = new Error('Database unavailable');
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }

  const table = getTableName();
  const { error } = await client
    .from(table)
    .update({ revoked_at: nowIso })
    .eq('user_id', userId)
    .is('revoked_at', null);

  if (error) {
    throw new Error(error.message || 'Could not revoke extension key');
  }

  return { revoked: true };
}

/**
 * Looks up a presented plain key by SHA-256 hash.
 */
async function findActiveExtensionKey(rawKey) {
  if (!hasExtensionKeyPrefix(rawKey) || rawKey.length > 256) {
    return { found: false, active: false, revoked: false, userId: null };
  }

  const keyHash = hashExtensionKey(rawKey);

  if (isOfflineTestMode()) {
    const row = memoryExtensionKeys.find(r => r.key_hash === keyHash) || null;
    if (!row) return { found: false, active: false, revoked: false, userId: null };
    if (row.revoked_at !== null) return { found: true, active: false, revoked: true, userId: row.user_id };
    return { found: true, active: true, revoked: false, userId: row.user_id };
  }

  const client = DB.getClient();
  if (!client || DB.getStatus() !== 'connected') {
    const err = new Error('Database unavailable');
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }

  const table = getTableName();
  const { data, error } = await client
    .from(table)
    .select('id, user_id, revoked_at')
    .eq('key_hash', keyHash)
    .limit(1);

  if (error) {
    throw new Error(error.message || 'Extension key lookup failed');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { found: false, active: false, revoked: false, userId: null };
  if (row.revoked_at !== null) return { found: true, active: false, revoked: true, userId: row.user_id };
  return { found: true, active: true, revoked: false, userId: row.user_id };
}

async function deleteUserExtensionKeys(userId) {
  if (!userId) return;
  for (let i = memoryExtensionKeys.length - 1; i >= 0; i--) {
    if (memoryExtensionKeys[i].user_id === userId) {
      memoryExtensionKeys.splice(i, 1);
    }
  }

  const client = DB.getClient();
  if (client && DB.getStatus() === 'connected') {
    try {
      await client.from(getTableName()).delete().eq('user_id', userId);
    } catch (err) {
      console.warn('[extensionKeys] deleteUserExtensionKeys DB error:', err.message);
    }
  }
}

module.exports = {
  KEY_PREFIX,
  hashExtensionKey,
  generatePlainExtensionKey,
  hasExtensionKeyPrefix,
  createExtensionKey,
  getExtensionKeyStatus,
  revokeExtensionKeys,
  findActiveExtensionKey,
  deleteUserExtensionKeys,
  resetExtensionKeysMemory,
  memoryExtensionKeys
};
