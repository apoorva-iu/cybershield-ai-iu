'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const DB = require('../db');
const cfg = require('../config');
const ledger = require('../ledger');

async function migrate() {
  const filePath = process.env.LEDGER_FILE || path.join(__dirname, '..', cfg.runtime.ledger.file);
  let blocks = [];

  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      blocks = JSON.parse(raw);
    } catch (err) {
      console.error('FAIL - Could not parse ledger file: ' + err.message);
      process.exit(1);
    }
  } else {
    console.log(`No ledger file found at ${filePath}. 0 blocks added.`);
    process.exit(0);
  }

  if (!Array.isArray(blocks) || blocks.length === 0) {
    console.log('Ledger file is empty. 0 blocks added.');
    process.exit(0);
  }

  // Check integrity
  const verification = ledger.verify(blocks);
  if (!verification.ok) {
    console.error(`FAIL - Ledger integrity check failed at block index ${verification.at}`);
    process.exit(1);
  }

  // Connect to database
  try {
    await DB.init();
  } catch (err) {
    const reason = (err && (err.code || err.message)) ? String(err.code || err.message).replace(/https?:\/\/\S+/gi, '[url]') : 'unknown error';
    console.error('FAIL - Database init error: ' + reason);
    process.exit(1);
  }

  const client = DB.getClient();
  if (!client) {
    console.error('FAIL - Database client not initialized');
    process.exit(1);
  }

  const table = (cfg.runtime.database && cfg.runtime.database.tables && cfg.runtime.database.tables.ledgerBlocks) || 'ledger_blocks';

  try {
    // Check existing blocks
    const { data: existingRows, error: fetchErr } = await client
      .from(table)
      .select('idx');

    if (fetchErr) {
      console.error(`FAIL - Error querying ${table}: ` + fetchErr.message);
      process.exit(1);
    }

    const existingIndices = new Set((existingRows || []).map(r => Number(r.idx)));

    // Sort blocks in order
    const sorted = [...blocks].sort((a, b) => a.index - b.index);
    let added = 0;

    for (const b of sorted) {
      if (existingIndices.has(b.index)) {
        continue;
      }

      const row = ledger.blockToRow(b);
      const { error: insErr } = await client
        .from(table)
        .insert(row);

      if (insErr) {
        console.error(`FAIL - Error inserting block ${b.index} into ${table}: ` + insErr.message);
        process.exit(1);
      }
      existingIndices.add(b.index);
      added++;
    }

    console.log(`Added ${added} block(s) to ${table}.`);
    process.exit(0);
  } catch (err) {
    console.error('FAIL - Migration error: ' + err.message);
    process.exit(1);
  }
}

migrate();

