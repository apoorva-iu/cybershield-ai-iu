'use strict';
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const ledger = require('../ledger');

function createFakeSupabase(initialRows = []) {
  const rows = [...initialRows];
  let insertHook = null;

  const client = {
    _rows: rows,
    setInsertHook(fn) { insertHook = fn; },
    from(tableName) {
      return {
        _table: tableName,
        _cols: null,
        _countOpt: null,
        _orderCol: null,
        _ascending: true,
        _eqCol: null,
        _eqVal: null,
        _ilikeCol: null,
        _ilikeVal: null,
        _limitVal: null,

        select(cols, opts) {
          this._cols = cols;
          this._countOpt = opts;
          return this;
        },
        order(col, { ascending = true } = {}) {
          this._orderCol = col;
          this._ascending = ascending;
          return this;
        },
        eq(col, val) {
          this._eqCol = col;
          this._eqVal = val;
          return this;
        },
        ilike(col, val) {
          this._ilikeCol = col;
          this._ilikeVal = val;
          return this;
        },
        limit(n) {
          this._limitVal = n;
          return this;
        },
        async then(resolve, reject) {
          await new Promise(r => setImmediate(r));
          if (this._updateFields) {
            let count = 0;
            for (const r of rows) {
              if (!this._eqCol || r[this._eqCol] == this._eqVal) {
                Object.assign(r, this._updateFields);
                count++;
              }
            }
            return resolve({ data: count, error: null });
          }
          let filtered = [...rows];
          if (this._eqCol) {
            filtered = filtered.filter(r => r[this._eqCol] == this._eqVal);
          }
          if (this._ilikeCol && this._ilikeVal) {
            const pattern = this._ilikeVal.replace(/%/g, '').toLowerCase();
            filtered = filtered.filter(r => String(r[this._ilikeCol] || '').toLowerCase().startsWith(pattern));
          }
          if (this._orderCol) {
            const c = this._orderCol;
            const asc = this._ascending;
            filtered.sort((a, b) => asc ? (a[c] > b[c] ? 1 : -1) : (a[c] < b[c] ? 1 : -1));
          }
          const totalCount = filtered.length;
          if (this._limitVal != null) {
            filtered = filtered.slice(0, this._limitVal);
          }
          if (this._countOpt && this._countOpt.head) {
            return resolve({ data: null, count: totalCount, error: null });
          }
          return resolve({ data: filtered, count: totalCount, error: null });
        },
        async insert(newRow) {
          await new Promise(r => setImmediate(r));
          if (insertHook) {
            const hookErr = insertHook(newRow);
            if (hookErr) return { data: null, error: hookErr };
          }
          const toInsert = Array.isArray(newRow) ? newRow : [newRow];
          for (const r of toInsert) {
            const conflict = rows.find(existing =>
              existing.idx === r.idx ||
              existing.prev_hash === r.prev_hash ||
              existing.hash === r.hash
            );
            if (conflict) {
              return {
                data: null,
                error: {
                  code: '23505',
                  message: 'duplicate key value violates unique constraint "ledger_blocks_pkey"'
                }
              };
            }
            rows.push({ ...r });
          }
          return { data: toInsert, error: null };
        },
        update(fields) {
          this._updateFields = fields;
          return this;
        }
      };
    }
  };
  return client;
}

let allPassed = true;
function test(name, cond) {
  if (cond) {
    console.log(`PASS - ${name}`);
  } else {
    console.log(`FAIL - ${name}`);
    allPassed = false;
  }
}

async function run() {
  console.log('--- Running Ledger Storage Tests ---');

  // 1. Append and read back with Supabase storage
  {
    const fakeClient = createFakeSupabase();
    const store = new ledger.SupabaseStorage(fakeClient, 'ledger_blocks');

    // Initially count is 0, getLast is null
    const initialLast = await store.getLast();
    const initialCount = await store.count();
    test('SupabaseStorage initially empty', initialLast === null && initialCount === 0);

    // Append genesis block
    const genesis = ledger.mine(0, 'genesis', '0'.repeat(64), null);
    await store.append(genesis);

    // Append block 1 via ledger.append with storageOverride
    const repHash1 = ledger.sha('report-data-1');
    const pKey1 = 'proof-key-001';
    const sections1 = { input: 'hash-input-1', overall: 'hash-overall-1' };
    const meta1 = { level: 'high' };

    const blk1 = await ledger.append(repHash1, meta1, pKey1, sections1, store);

    // getLast
    const last = await store.getLast();
    test('getLast returns most recently appended block', last && last.index === 1 && last.hash === blk1.hash);

    // getByIndex
    const b0 = await store.getByIndex(0);
    const b1 = await store.getByIndex(1);
    const bNone = await store.getByIndex(99);
    test('getByIndex returns matching block or null', b0 && b0.index === 0 && b1 && b1.index === 1 && bNone === null);

    // getByProofId
    const P = cfg.runtime.proof;
    const proofId1 = P.proofIdPrefix + repHash1.slice(0, P.proofIdHexLength).toUpperCase();
    const bProof = await store.getByProofId(proofId1);
    const bProofBad = await store.getByProofId('CS-NOTFOUND99');
    test('getByProofId returns matching block', bProof && bProof.index === 1 && bProof.reportHash === repHash1 && bProofBad === null);

    // count
    const totalCount = await store.count();
    test('count returns exact number of blocks', totalCount === 2);

    // getAll
    const all = await store.getAll();
    test('getAll returns all blocks sorted by idx', all.length === 2 && all[0].index === 0 && all[1].index === 1);

    // setTxHash
    await store.setTxHash(1, '0xdeadbeef1234');
    const b1AfterTx = await store.getByIndex(1);
    test('setTxHash updates txHash column', b1AfterTx && b1AfterTx.txHash === '0xdeadbeef1234');

    // Column mapping check in the underlying database row
    const row1 = fakeClient._rows.find(r => r.idx === 1);
    const mappedProperly = (
      row1 &&
      row1.idx === 1 &&
      row1.created_at === blk1.timestamp &&
      row1.report_hash === repHash1 &&
      row1.prev_hash === genesis.hash &&
      row1.nonce === blk1.nonce &&
      row1.hash === blk1.hash &&
      row1.proof_key === pKey1 &&
      row1.sections && row1.sections.input === 'hash-input-1' &&
      row1.meta && row1.meta.level === 'high' &&
      row1.tx_hash === '0xdeadbeef1234'
    );
    test('Supabase storage maps block fields to exact table columns', mappedProperly);
  }

  // 2. Two simultaneous appends produce consecutive indexes and no fork
  {
    const fakeClient = createFakeSupabase();
    const store = new ledger.SupabaseStorage(fakeClient, 'ledger_blocks');

    // Pre-insert genesis
    const genesis = ledger.mine(0, 'genesis', '0'.repeat(64), null);
    await store.append(genesis);

    const repA = ledger.sha('report-simultaneous-A');
    const repB = ledger.sha('report-simultaneous-B');

    // Run two appends concurrently
    const [resA, resB] = await Promise.all([
      ledger.append(repA, { level: 'medium' }, 'keyA', null, store),
      ledger.append(repB, { level: 'low' }, 'keyB', null, store)
    ]);

    const all = await store.getAll();
    const indices = all.map(b => b.index);
    const hashes = all.map(b => b.hash);

    const consecutive = indices.length === 3 && indices[0] === 0 && indices[1] === 1 && indices[2] === 2;
    const validChain = (
      all[1].prevHash === all[0].hash &&
      all[2].prevHash === all[1].hash &&
      ledger.verify(all).ok === true
    );
    const bothAppended = (
      (resA.index === 1 && resB.index === 2) ||
      (resA.index === 2 && resB.index === 1)
    );

    test('Two simultaneous appends produce consecutive indexes and no fork', consecutive && validChain && bothAppended);
  }

  // 3. A failed insert is retried
  {
    const fakeClient = createFakeSupabase();
    const store = new ledger.SupabaseStorage(fakeClient, 'ledger_blocks');

    // Genesis
    const genesis = ledger.mine(0, 'genesis', '0'.repeat(64), null);
    await store.append(genesis);

    let attempts = 0;
    // Intercept insert and fail on attempt 1 with conflict
    fakeClient.setInsertHook((row) => {
      attempts++;
      if (attempts === 1) {
        return {
          code: '23505',
          message: 'duplicate key value violates unique constraint "ledger_blocks_pkey"'
        };
      }
      return null;
    });

    const repHash = ledger.sha('report-retry-test');
    const blk = await ledger.append(repHash, { level: 'low' }, 'keyRetry', null, store);

    test('A failed insert due to conflict is retried and succeeds', attempts >= 2 && blk && blk.index === 1);

    // Test that exceeding max retries throws
    let failAttempts = 0;
    fakeClient.setInsertHook(() => {
      failAttempts++;
      return {
        code: '23505',
        message: 'simulated persistent conflict'
      };
    });

    let threw = false;
    try {
      await ledger.append(ledger.sha('report-fail-test'), null, null, null, store);
    } catch (err) {
      threw = ledger.isConflictError(err);
    }
    test('Exceeding appendRetries throws conflict error', threw && failAttempts > cfg.runtime.ledger.appendRetries);
    fakeClient.setInsertHook(null);
  }

  // 4. File backend behaves as before
  {
    const tempFile = path.join(__dirname, 'temp_test_ledger.json');
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

    try {
      const fileStore = new ledger.FileStorage(tempFile);

      test('FileStorage initially returns null last and 0 count', (await fileStore.getLast()) === null && (await fileStore.count()) === 0);

      // Append genesis
      const genesis = ledger.mine(0, 'genesis', '0'.repeat(64), null);
      await fileStore.append(genesis);

      // Append block 1 via ledger.append with fileStore
      const repHash = ledger.sha('report-file-test');
      const blk1 = await ledger.append(repHash, { level: 'high' }, 'keyF1', { input: 'inF1' }, fileStore);

      test('FileStorage getLast returns block 1', (await fileStore.getLast()).index === 1);
      test('FileStorage getByIndex returns correct block', (await fileStore.getByIndex(1)).hash === blk1.hash);
      test('FileStorage count returns 2', (await fileStore.count()) === 2);

      const P = cfg.runtime.proof;
      const proofId = P.proofIdPrefix + repHash.slice(0, P.proofIdHexLength).toUpperCase();
      test('FileStorage getByProofId returns block 1', (await fileStore.getByProofId(proofId)).index === 1);

      await fileStore.setTxHash(1, '0xfiletx123');
      test('FileStorage setTxHash persists txHash', (await fileStore.getByIndex(1)).txHash === '0xfiletx123');

      const all = await fileStore.getAll();
      const verification = ledger.verify(all);
      test('FileStorage chain verifies successfully', verification.ok === true && verification.blocks === 2);

      // Simultaneous appends on file storage are queued and consecutive
      const [fA, fB] = await Promise.all([
        ledger.append(ledger.sha('repFA'), { level: 'low' }, 'kA', null, fileStore),
        ledger.append(ledger.sha('repFB'), { level: 'medium' }, 'kB', null, fileStore)
      ]);
      const allAfter = await fileStore.getAll();
      test('FileStorage simultaneous appends produce consecutive chain', allAfter.length === 4 && ledger.verify(allAfter).ok === true);

    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  }

  // 5. Database chain verification and tamper detection
  {
    const fakeClient = createFakeSupabase();
    const store = new ledger.SupabaseStorage(fakeClient, 'ledger_blocks');

    // Genesis
    const genesis = ledger.mine(0, 'genesis', '0'.repeat(64), null);
    await store.append(genesis);

    // Append 3 blocks
    for (let i = 1; i <= 3; i++) {
      await ledger.append(ledger.sha(`report-${i}`), { level: 'low' }, `key-${i}`, null, store);
    }

    const all = await store.getAll();
    test('SupabaseStorage chain verification succeeds for valid chain', ledger.verify(all).ok === true && all.length === 4);

    // Tamper with one block in fake database
    fakeClient._rows[1].nonce = 999999999;
    const allTampered = await store.getAll();
    const vTampered = ledger.verify(allTampered);
    test('SupabaseStorage detects tampered block in chain', vTampered.ok === false && vTampered.at === 1);
  }

  process.exitCode = allPassed ? 0 : 1;
}

run().catch(err => {
  console.error('Unexpected error in test:', err);
  process.exitCode = 1;
});
