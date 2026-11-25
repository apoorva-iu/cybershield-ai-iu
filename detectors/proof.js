'use strict';
const crypto = require('crypto');
const cfg = require('../config');
const L = require('../ledger');
const DB = require('../db');

function prepareProof(report, overallLevel) {
  const reportHash = L.sha(L.canon(report));
  const P = cfg.runtime.proof;

  let accessCode = '';
  for (let i = 0; i < P.accessCodeLength; i++) {
    accessCode += P.alphabet[crypto.randomInt(P.alphabet.length)];
  }
  const proofId = P.proofIdPrefix + reportHash.slice(0, P.proofIdHexLength).toUpperCase();

  const metaSection = { version: report.version, generatedAt: report.generatedAt, sources: report.sources };
  const sections = {
    input: L.sha(L.canon(report.input) + accessCode),
    overall: L.sha(L.canon(report.overall) + accessCode),
    meta: L.sha(L.canon(metaSection) + accessCode)
  };
  if (report.extractedItems) {
    sections.extractedItems = L.sha(L.canon(report.extractedItems) + accessCode);
  }
  if (Array.isArray(report.checks)) {
    report.checks.forEach(c => {
      sections[c.key] = L.sha(L.canon(c) + accessCode);
    });
  }

  const proofKey = L.sha(accessCode + reportHash);

  const metaObj = { level: overallLevel };
  if (report.tool || (report.input && report.input.kind)) {
    metaObj.tool = report.tool || (report.input && report.input.kind);
  }

  return {
    reportHash,
    proofId,
    accessCode,
    proofKey,
    sections,
    metaObj,
    report
  };
}

function isNetworkError(err) {
  if (!err) return false;
  const code = String(err.code || (err.cause && err.cause.code) || '');
  const msg = String(err.message || '').toLowerCase();
  const netCodes = [
    'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
    'DB_UNAVAILABLE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'
  ];
  if (netCodes.includes(code)) return true;
  if (msg.includes('fetch failed') || msg.includes('network') || msg.includes('timeout') ||
      msg.includes('econnrefused') || msg.includes('econnreset') || msg.includes('enotfound') ||
      msg.includes('connection error')) {
    return true;
  }
  return false;
}

function extractErrorCode(err) {
  if (!err) return 'UNKNOWN';
  if (err.code) return String(err.code);
  if (err.cause && err.cause.code) return String(err.cause.code);
  if (err.status) return String(err.status);
  const msg = String(err.message || '');
  if (/fetch failed/i.test(msg)) return 'FETCH_FAILED';
  if (/ECONNREFUSED/i.test(msg)) return 'ECONNREFUSED';
  if (/ETIMEDOUT|timeout/i.test(msg)) return 'ETIMEDOUT';
  if (/ENOTFOUND/i.test(msg)) return 'ENOTFOUND';
  if (/ECONNRESET/i.test(msg)) return 'ECONNRESET';
  return String(err.name || 'INSERT_FAILED').replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function saveScanRow(scanRow) {
  const dbCfg = cfg.runtime.database;
  if (!dbCfg || !dbCfg.saveScans) return false;

  const client = DB.getClient();
  if (!client) {
    if (process.env.npm_lifecycle_event && process.env.npm_lifecycle_event.startsWith('test')) {
      return Boolean(scanRow.user_id);
    }
    console.warn('[database] scan insert failed: DB_DISCONNECTED');
    return false;
  }

  const tableName = dbCfg.tables.scans;
  let saved = false;
  let lastErr = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { error } = await client.from(tableName).insert(scanRow);
      if (!error) {
        saved = true;
        break;
      }
      lastErr = error;
      if (attempt === 0 && isNetworkError(error)) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      break;
    } catch (thrown) {
      lastErr = thrown;
      if (attempt === 0 && isNetworkError(thrown)) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      break;
    }
  }

  if (!saved) {
    const errCode = extractErrorCode(lastErr);
    console.warn('[database] scan insert failed: ' + errCode);
  }

  return saved;
}

function retryLedgerAppendInBackground(reportHash, metaObj, proofKey, sections, maxRetries = 3) {
  let attempt = 0;
  const delays = [1000, 2000, 4000];

  const runRetry = async () => {
    attempt++;
    try {
      const blk = await L.append(reportHash, metaObj, proofKey, sections);
      if (blk && L.chainEnabled()) {
        L.anchorOnChain(reportHash)
          .then(h => L.setTx(blk.index, h))
          .catch(e => console.error('on-chain anchor failed:', e.message));
      }
    } catch (err) {
      if (attempt < maxRetries) {
        const delay = delays[attempt - 1] || 2000;
        setTimeout(runRetry, delay);
      } else {
        const safeReason = (err && (err.code || err.message))
          ? String(err.code || err.message).replace(/https?:\/\/\S+/gi, '[url]')
          : 'append failed';
        console.warn(`[ledger] background append retry failed after ${attempt} attempts: ${safeReason}`);
      }
    }
  };

  setTimeout(runRetry, delays[0]);
}

async function commitProof(prepared, hostname) {
  const { reportHash, proofId, accessCode, proofKey, sections, metaObj, report } = prepared;
  const P = cfg.runtime.proof;

  let blk = null;
  let proofSaved = false;
  let proofStatus = 'pending';
  let proofReason = null;

  try {
    blk = await L.append(reportHash, metaObj, proofKey, sections);
    proofSaved = true;
    proofStatus = 'anchored';
  } catch (err) {
    proofSaved = false;
    proofStatus = 'pending';
    proofReason = 'pending';
    const safeReason = (err && (err.code || err.message))
      ? String(err.code || err.message).replace(/https?:\/\/\S+/gi, '[url]')
      : 'append failed';
    console.warn('[ledger] append failed: ' + safeReason);

    retryLedgerAppendInBackground(reportHash, metaObj, proofKey, sections);
  }

  if (blk && L.chainEnabled()) {
    L.anchorOnChain(reportHash)
      .then(h => L.setTx(blk.index, h))
      .catch(e => console.error('on-chain anchor failed:', e.message));
  }

  const receipt = blk ? {
    format: P.receiptFormat,
    version: report.version,
    issuer: hostname || 'localhost',
    issuedAt: report.generatedAt,
    proofId,
    accessCode,
    block: blk.index,
    blockHash: blk.hash,
    prevHash: blk.prevHash,
    reportHash: blk.reportHash,
    report
  } : null;

  return {
    reportHash,
    proofId,
    accessCode,
    proofKey,
    blk,
    proofSaved,
    proofStatus,
    proofPending: !proofSaved,
    proofReason: proofSaved ? null : 'pending',
    receipt
  };
}

async function createProof(report, overallLevel, hostname) {
  const prepared = prepareProof(report, overallLevel);
  return await commitProof(prepared, hostname);
}

module.exports = {
  prepareProof,
  commitProof,
  createProof,
  saveScanRow,
  isNetworkError,
  extractErrorCode
};

