'use strict';
const { createClient } = require('@supabase/supabase-js');
const cfg = require('./config');

const DB_CFG = cfg.runtime.database;
let supabase = null;
let status = 'disconnected';

async function init() {
  if (process.env.npm_lifecycle_event && process.env.npm_lifecycle_event.startsWith('test')) {
    console.log('[Database] Skipping Supabase init in test mode.');
    return;
  }
  
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SECRET_KEY || '').trim();
  
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be provided in .env');
  }
  
  try {
    supabase = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    const table = DB_CFG.tables.scans;
    const timeout = DB_CFG.timeoutMs;
    
    const p = supabase.from(table).select('*').limit(1);
    const timeoutP = new Promise((_, rej) => {
      const e = new Error('unreachable');
      e.name = 'TimeoutError';
      e.code = 'ETIMEDOUT';
      setTimeout(() => rej(e), timeout);
    });
    const res = await Promise.race([p, timeoutP]);
    
    if (res.error) {
      const e = new Error(res.error.message || 'unknown error');
      e.name = res.error.name || 'PostgrestError';
      e.code = res.error.code || (res.status ? String(res.status) : undefined);
      e.status = res.status;
      e.details = res.error.details;
      if (res.error.code === '42P01') e.message = 'table missing';
      else if (res.error.message && res.error.message.toLowerCase().includes('key')) e.message = 'bad key';
      throw e;
    }
    status = 'connected';
  } catch (err) {
    status = 'disconnected';

    let errorClass = err.name || err.constructor?.name || 'Error';
    const detailsStr = String(err.details || '');
    const messageStr = String(err.message || '');
    const causeStr = err.cause ? String(err.cause.code || err.cause.message || '') : '';
    const allText = (messageStr + ' ' + detailsStr + ' ' + causeStr).trim();

    let errorCode = err.code || (err.cause && err.cause.code);
    if (!errorCode) {
      if (/ENOTFOUND/i.test(allText)) errorCode = 'ENOTFOUND';
      else if (/ETIMEDOUT|timed?\s*out|unreachable/i.test(allText)) errorCode = 'ETIMEDOUT';
      else if (/ECONNREFUSED/i.test(allText)) errorCode = 'ECONNREFUSED';
      else if (/ECONNRESET/i.test(allText)) errorCode = 'ECONNRESET';
      else if (err.status) errorCode = String(err.status);
      else if (/401|unauthorized/i.test(allText)) errorCode = '401';
      else if (/403|forbidden/i.test(allText)) errorCode = '403';
      else if (/404|not\s*found/i.test(allText)) errorCode = '404';
      else if (/\b5\d{2}\b/.test(allText)) errorCode = allText.match(/\b5\d{2}\b/)[0];
      else errorCode = 'UNKNOWN';
    }

    if (errorCode === 'ETIMEDOUT' && errorClass === 'Error') {
      errorClass = 'TimeoutError';
    }

    let hint = 'network';
    if (errorCode === 'ENOTFOUND' || /getaddrinfo/i.test(allText)) {
      hint = 'DNS (verify SUPABASE_URL)';
    } else if (errorCode === '401' || errorCode === '403' || /invalid.*key|bad key|jwt/i.test(allText)) {
      hint = 'invalid key (verify SUPABASE_SECRET_KEY)';
    } else if (errorCode === '404' || /not\s*found/i.test(allText)) {
      hint = 'wrong URL (endpoint not found)';
    } else if (errorCode === 'ETIMEDOUT' || /timeout|unreachable/i.test(allText)) {
      hint = 'paused project or network (timed out)';
    } else if (String(errorCode).startsWith('5') || (err.status >= 500 && err.status < 600)) {
      hint = 'paused project (server returned ' + errorCode + ')';
    } else if (errorCode === 'ECONNREFUSED' || errorCode === 'ECONNRESET') {
      hint = 'network (connection refused/reset)';
    } else if (errorCode === '42P01' || /table missing/i.test(allText)) {
      hint = 'table missing (check database migrations)';
    }

    let cleanMsg = messageStr || 'unreachable';
    cleanMsg = cleanMsg.replace(/eyJ[a-zA-Z0-9_\-.]+/g, '[REDACTED_TOKEN]');
    cleanMsg = cleanMsg.replace(/sb_secret_[a-zA-Z0-9_\-]+/g, '[REDACTED_KEY]');

    const reason = `${errorClass} [${errorCode}] ${cleanMsg} - Hint: ${hint}`;
    if (DB_CFG.requiredAtStartup) {
      throw new Error(reason);
    } else {
      console.warn(`[Database] Supabase connection failed: ${reason}`);
    }
  }
}

function getStatus() {
  return status;
}

function getClient() {
  return supabase;
}

function setClient(client) {
  supabase = client;
  status = client ? 'connected' : 'disconnected';
}

module.exports = { init, getStatus, getClient, setClient };
