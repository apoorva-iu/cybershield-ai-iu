'use strict';
const crypto = require('crypto');
const cfg = require('../config');
const L = require('../ledger');

async function createProof(report, overallLevel, hostname) {
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

  let blk = null;
  let proofSaved = false;
  let proofReason = null;

  try {
    const metaObj = { level: overallLevel };
    if (report.tool || (report.input && report.input.kind)) {
      metaObj.tool = report.tool || (report.input && report.input.kind);
    }
    blk = await L.append(reportHash, metaObj, proofKey, sections);
    proofSaved = true;

  } catch (err) {
    proofSaved = false;
    const safeReason = (err && (err.code || err.message))
      ? String(err.code || err.message).replace(/https?:\/\/\S+/gi, '[url]')
      : 'database unreachable';
    console.warn('[ledger] append failed: ' + safeReason);
    proofReason = safeReason;
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
    report
  } : null;

  return {
    reportHash,
    proofId,
    accessCode,
    proofKey,
    blk,
    proofSaved,
    proofReason,
    receipt
  };
}

module.exports = { createProof };

