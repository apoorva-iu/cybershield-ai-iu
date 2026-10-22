'use strict';
require('dotenv').config();
const DB = require('../db');
const cfg = require('../config');

async function purgeExpired(client, tableName, nowIso) {
  const table = tableName || cfg.runtime.database.tables.scans;
  const now = nowIso || new Date().toISOString();

  let q = client
    .from(table)
    .delete({ count: 'exact' });

  if (typeof q.not === 'function') {
    q = q.not('expires_at', 'is', null);
  }

  const { data, count, error } = await q.lt('expires_at', now);
  if (error) {
    throw error;
  }

  const removed = (count !== null && count !== undefined) ? count : (Array.isArray(data) ? data.length : 0);
  return { removed, data };
}

async function purge() {
  try {
    await DB.init();
  } catch (err) {
    const reason = (err && (err.code || err.message)) ? String(err.code || err.message).replace(/https?:\/\/\S+/gi, '[url]') : 'unknown error';
    console.error('FAIL - ' + reason);
    process.exit(1);
  }

  const client = DB.getClient();
  if (!client) {
    console.error('FAIL - Database client not initialized');
    process.exit(1);
  }

  try {
    const { removed } = await purgeExpired(client);
    console.log(`Purged ${removed} expired scan(s).`);
    process.exit(0);
  } catch (err) {
    const reason = (err && (err.code || (err.message && err.message.replace(/https?:\/\/\S+/gi, '[url]')))) || 'purge failed';
    console.error('FAIL - ' + reason);
    process.exit(1);
  }
}

if (require.main === module) {
  purge();
}

module.exports = { purgeExpired, purge };
