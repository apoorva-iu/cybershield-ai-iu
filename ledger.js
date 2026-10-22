'use strict';
// Proof-of-work hash chain persisted to file or Supabase, with optional anchoring on Ethereum Sepolia.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const DIFF = cfg.runtime.ledger.difficulty;

const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function canon(o) {
  if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
  if (o && typeof o === 'object') return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
  return JSON.stringify(o);
}

const blockHash = b => sha([b.index, b.timestamp, b.reportHash, b.prevHash, b.nonce].join('|'));

function mine(index, reportHash, prevHash, meta) {
  const timestamp = new Date().toISOString();
  let nonce = 0, hash;
  for (;;) {
    hash = blockHash({ index, timestamp, reportHash, prevHash, nonce });
    if (hash.startsWith(DIFF)) break;
    nonce++;
  }
  return { index, timestamp, reportHash, prevHash, nonce, hash, meta: meta || null, txHash: null };
}

function blockToRow(b) {
  if (!b) return null;
  return {
    idx: b.index,
    created_at: b.timestamp,
    report_hash: b.reportHash,
    prev_hash: b.prevHash,
    nonce: b.nonce,
    hash: b.hash,
    proof_key: b.proofKey || null,
    sections: b.sections || null,
    meta: b.meta || null,
    tx_hash: b.txHash || null
  };
}

function rowToBlock(r) {
  if (!r) return null;
  const b = {
    index: Number(r.idx),
    timestamp: r.created_at ? new Date(r.created_at).toISOString() : r.created_at,
    reportHash: r.report_hash,
    prevHash: r.prev_hash,
    nonce: Number(r.nonce),
    hash: r.hash,
    meta: r.meta || null,
    txHash: r.tx_hash || null
  };
  if (r.proof_key) b.proofKey = r.proof_key;
  if (r.sections) b.sections = r.sections;
  return b;
}

function isConflictError(err) {
  if (!err) return false;
  if (err.code === '23505' || err.code === 'CONFLICT') return true;
  const msg = String(err.message || '').toLowerCase();
  const details = String(err.details || '').toLowerCase();
  return msg.includes('duplicate key') || msg.includes('unique constraint') ||
         msg.includes('already taken') || msg.includes('already exists') ||
         details.includes('already exists');
}

// ----------------- File Storage Backend -----------------
class FileStorage {
  constructor(filePath) {
    this.type = 'file';
    this.filePath = filePath || process.env.LEDGER_FILE || path.join(__dirname, cfg.runtime.ledger.file);
  }

  _load() {
    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  _save(c) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath + '.tmp', JSON.stringify(c, null, 2));
    fs.renameSync(this.filePath + '.tmp', this.filePath);
  }

  async getLast() {
    const c = this._load();
    if (!c.length) return null;
    return c[c.length - 1];
  }

  async getByIndex(i) {
    const c = this._load();
    return c.find(b => b.index === i) || null;
  }

  async getByProofId(proofId) {
    if (!proofId || typeof proofId !== 'string') return null;
    const c = this._load();
    const P = cfg.runtime.proof;
    return c.find(b => {
      const pid = P.proofIdPrefix + b.reportHash.slice(0, P.proofIdHexLength).toUpperCase();
      return pid === proofId;
    }) || null;
  }

  async getAll() {
    const c = this._load();
    return [...c].sort((a, b) => a.index - b.index);
  }

  async append(block) {
    const c = this._load();
    if (c.length > 0) {
      const last = c[c.length - 1];
      if (block.index !== last.index + 1 || block.prevHash !== last.hash) {
        const err = new Error(`Block index ${block.index} or prevHash ${block.prevHash} conflict`);
        err.code = '23505';
        throw err;
      }
    } else if (block.index !== 0) {
      const err = new Error('Genesis block must have index 0');
      err.code = '23505';
      throw err;
    }
    c.push(block);
    this._save(c);
    return block;
  }

  async setTxHash(idx, txHash) {
    const c = this._load();
    const b = c.find(item => item.index === idx);
    if (b) {
      b.txHash = txHash;
      this._save(c);
    }
  }

  async count() {
    const c = this._load();
    return c.length;
  }
}

// ----------------- Supabase Storage Backend -----------------
class SupabaseStorage {
  constructor(client, tableName) {
    this.type = 'supabase';
    this.client = client || null;
    this.table = tableName || (cfg.runtime.database && cfg.runtime.database.tables && cfg.runtime.database.tables.ledgerBlocks) || 'ledger_blocks';
  }

  _getClient() {
    if (this.client) return this.client;
    const DB = require('./db');
    const c = DB.getClient();
    if (!c) throw new Error('Supabase client not connected');
    return c;
  }

  async getLast() {
    const client = this._getClient();
    const { data, error } = await client
      .from(this.table)
      .select('*')
      .order('idx', { ascending: false })
      .limit(1);
    if (error) throw error;
    if (!data || !data.length) return null;
    return rowToBlock(data[0]);
  }

  async getByIndex(i) {
    const client = this._getClient();
    const { data, error } = await client
      .from(this.table)
      .select('*')
      .eq('idx', i)
      .limit(1);
    if (error) throw error;
    if (!data || !data.length) return null;
    return rowToBlock(data[0]);
  }

  async getByProofId(proofId) {
    if (!proofId || typeof proofId !== 'string') return null;
    const P = cfg.runtime.proof;
    const hexPart = proofId.startsWith(P.proofIdPrefix)
      ? proofId.slice(P.proofIdPrefix.length).toLowerCase()
      : proofId.toLowerCase();
    const client = this._getClient();
    const { data, error } = await client
      .from(this.table)
      .select('*')
      .ilike('report_hash', `${hexPart}%`)
      .limit(1);
    if (error) throw error;
    if (!data || !data.length) return null;
    const b = rowToBlock(data[0]);
    const pid = P.proofIdPrefix + b.reportHash.slice(0, P.proofIdHexLength).toUpperCase();
    return pid === proofId ? b : null;
  }

  async getAll() {
    const client = this._getClient();
    const { data, error } = await client
      .from(this.table)
      .select('*')
      .order('idx', { ascending: true });
    if (error) throw error;
    return (data || []).map(rowToBlock);
  }

  async append(block) {
    const client = this._getClient();
    const row = blockToRow(block);
    const { data, error } = await client
      .from(this.table)
      .insert(row);
    if (error) throw error;
    return block;
  }

  async setTxHash(idx, txHash) {
    const client = this._getClient();
    const { error } = await client
      .from(this.table)
      .update({ tx_hash: txHash })
      .eq('idx', idx);
    if (error) throw error;
  }

  async count() {
    const client = this._getClient();
    const { count, error } = await client
      .from(this.table)
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count != null ? count : 0;
  }
}

let defaultFileStorage = null;
let defaultSupabaseStorage = null;

function getStorage(typeOverride) {
  let type = typeOverride || (cfg.runtime.ledger && cfg.runtime.ledger.storage) || 'file';
  if (process.env.LEDGER_FILE && !typeOverride) {
    type = 'file';
  }
  if (type === 'supabase') {
    if (!defaultSupabaseStorage) defaultSupabaseStorage = new SupabaseStorage();
    return defaultSupabaseStorage;
  }
  if (!defaultFileStorage) defaultFileStorage = new FileStorage();
  return defaultFileStorage;
}

function chain() {
  const store = getStorage();
  if (store.type === 'file') {
    let c = store._load();
    if (!c.length) {
      c = [mine(0, 'genesis', '0'.repeat(64), null)];
      store._save(c);
    }
    return c;
  }
  throw new Error('chain() synchronous call is only supported for file storage');
}

function verify(blocks) {
  let c = blocks;
  if (!c) {
    const store = getStorage();
    if (store.type === 'file') {
      c = chain();
    } else {
      throw new Error('verify() without arguments is only supported for file storage');
    }
  }
  for (let i = 0; i < c.length; i++) {
    const b = c[i];
    if (blockHash(b) !== b.hash || !b.hash.startsWith(DIFF)) return { ok: false, at: i, blocks: c.length };
    if (i > 0 && b.prevHash !== c[i - 1].hash) return { ok: false, at: i, blocks: c.length };
  }
  return { ok: true, blocks: c.length };
}

let queue = Promise.resolve();

async function append(reportHash, meta, proofKey, sections, storageOverride) {
  const store = storageOverride || getStorage();
  const maxRetries = (cfg.runtime.ledger && cfg.runtime.ledger.appendRetries) != null
    ? cfg.runtime.ledger.appendRetries
    : 3;

  const runAppend = async () => {
    let attempt = 0;
    while (true) {
      let prev = await store.getLast();
      if (!prev) {
        const genesis = mine(0, 'genesis', '0'.repeat(64), null);
        try {
          await store.append(genesis);
          prev = genesis;
        } catch (err) {
          if (isConflictError(err) && attempt < maxRetries) {
            attempt++;
            continue;
          }
          throw err;
        }
      }

      const blk = mine(prev.index + 1, reportHash, prev.hash, meta);
      if (proofKey) blk.proofKey = proofKey;
      if (sections) blk.sections = sections;

      try {
        await store.append(blk);
        return blk;
      } catch (err) {
        if (isConflictError(err) && attempt < maxRetries) {
          attempt++;
          continue;
        }
        throw err;
      }
    }
  };

  if (store.type === 'file') {
    const job = queue.then(() => runAppend());
    queue = job.catch(() => {});
    return job;
  }

  return runAppend();
}

function setTx(index, txHash) {
  const store = getStorage();
  const job = queue.then(async () => {
    await store.setTxHash(index, txHash);
  });
  queue = job.catch(() => {});
  return job;
}

function find(reportHash) {
  return chain().find(b => b.reportHash === reportHash) || null;
}

// ---- optional on-chain anchor (Sepolia or any EVM chain) ----
let wallet = null;
function chainEnabled() {
  return !!(process.env.ANCHOR_PRIVATE_KEY && process.env.ANCHOR_RPC_URL);
}

async function anchorOnChain(reportHash) {
  if (!chainEnabled()) return null;
  const { ethers } = require('ethers');
  if (!wallet) {
    wallet = new ethers.Wallet(process.env.ANCHOR_PRIVATE_KEY, new ethers.JsonRpcProvider(process.env.ANCHOR_RPC_URL));
  }
  const tx = await wallet.sendTransaction({ to: wallet.address, value: 0, data: '0x' + reportHash });
  return tx.hash;
}

module.exports = {
  sha,
  canon,
  mine,
  blockHash,
  blockToRow,
  rowToBlock,
  append,
  find,
  verify,
  chain,
  setTx,
  setTxHash: (idx, txHash) => getStorage().setTxHash(idx, txHash),
  anchorOnChain,
  chainEnabled,
  FileStorage,
  SupabaseStorage,
  getStorage,
  isConflictError
};
