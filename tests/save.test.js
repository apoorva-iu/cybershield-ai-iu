'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');

// Ensure test mode
process.env.npm_lifecycle_event = 'test:save';

// Avoid any external network calls during this test
const dotenv = require('dotenv');
dotenv.config = () => {};

delete process.env.VT_API_KEY;
delete process.env.URLHAUS_AUTH_KEY;
delete process.env.GOOGLE_PLACES_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.LLM_PROVIDER;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    srv.on('error', reject);
  });
}

async function run() {
  const port = await findFreePort();
  process.env.PORT = String(port);
  process.env.LEDGER_FILE = path.join(__dirname, 'temp_ledger_save.json');
  if (fs.existsSync(process.env.LEDGER_FILE)) {
    try { fs.unlinkSync(process.env.LEDGER_FILE); } catch (e) {}
  }

  // Clone config so we can modify runtime flags for testing
  const originalCfg = require('../config');
  const clone = JSON.parse(JSON.stringify(originalCfg));
  // Relax rate limit for fast test execution
  clone.runtime.security.verifyRateLimit.perMinute = 100;
  clone.runtime.security.verifyRateLimit.perDay = 1000;
  require.cache[require.resolve('../config')].exports = clone;

  // Fake Supabase client with no network
  let insertedRows = [];
  let insertError = null;

  const fakeClient = {
    from() {
      return {
        insert(row) {
          if (insertError) {
            return Promise.resolve({ data: null, error: insertError });
          }
          const rows = Array.isArray(row) ? row : [row];
          insertedRows.push(...rows);
          return Promise.resolve({ data: rows, error: null });
        }
      };
    }
  };

  const DB = require('../db');
  DB.setClient(fakeClient);

  // Start the server
  const server = require('../server.js');
  await new Promise(resolve => {
    if (server.listening) return resolve();
    server.once('listening', resolve);
  });

  const verifyScan = async (body) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  };

  let allPassed = true;
  const test = (name, cond) => {
    if (cond) {
      console.log(`PASS - ${name}`);
    } else {
      console.log(`FAIL - ${name}`);
      allPassed = false;
    }
  };

  try {
    // (a) a scan inserts exactly one row, and the row contains no access code and no description text
    insertedRows = [];
    insertError = null;
    clone.runtime.database.saveScans = true;

    const rawDescA = 'Exclusive job offer: Looking for Senior Developer with 10 years experience in React and Node.';
    const resA = await verifyScan({ desc: rawDescA });

    const rowA = insertedRows[0];
    const rowAStr = JSON.stringify(rowA);

    const condA = (
      insertedRows.length === 1 &&
      resA.saved === true &&
      rowA &&
      rowA.proof_id === resA.proofId &&
      !rowAStr.includes(resA.accessCode) &&
      !rowAStr.includes(rawDescA) &&
      !rowA.accessCode &&
      !rowA.desc
    );
    test('a scan inserts exactly one row, and the row contains no access code and no description text', condA);

    // (b) a failing insert still returns the scan result with saved false
    insertedRows = [];
    insertError = new Error('simulated database failure');
    clone.runtime.database.saveScans = true;

    const resB = await verifyScan({ desc: 'Another job description for testing error handling.' });

    const condB = (
      resB &&
      resB.saved === false &&
      typeof resB.proofId === 'string' &&
      resB.report &&
      resB.receipt &&
      insertedRows.length === 0
    );
    test('a failing insert still returns the scan result with saved false', condB);

    // (c) the retention date is set for anonymous scans
    insertedRows = [];
    insertError = null;
    clone.runtime.database.saveScans = true;

    await verifyScan({ desc: 'Job description for retention test.' });
    const rowC = insertedRows[0];

    const retentionDays = clone.runtime.database.retention.anonymousScanDays;
    const expectedExpiryMs = Date.now() + retentionDays * 86400000;
    const actualExpiryMs = rowC && rowC.expires_at ? new Date(rowC.expires_at).getTime() : 0;
    const isRetentionValid = Math.abs(actualExpiryMs - expectedExpiryMs) < 10000;

    const condC = (
      rowC &&
      rowC.user_id === null &&
      rowC.expires_at != null &&
      isRetentionValid
    );
    test('the retention date is set for anonymous scans', condC);

    // (d) with saveScans false nothing is inserted
    insertedRows = [];
    insertError = null;
    clone.runtime.database.saveScans = false;

    const resD = await verifyScan({ desc: 'Job description with saveScans disabled.' });

    const condD = (
      resD &&
      resD.saved === false &&
      insertedRows.length === 0
    );
    test('with saveScans false nothing is inserted', condD);

  } finally {
    server.close(() => {
      if (fs.existsSync(process.env.LEDGER_FILE)) {
        try { fs.unlinkSync(process.env.LEDGER_FILE); } catch (e) {}
      }
      process.exitCode = allPassed ? 0 : 1;
    });
  }
}

run().catch(err => {
  console.error('FAIL -', err);
  process.exitCode = 1;
});
