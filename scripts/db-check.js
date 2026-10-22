require('dotenv').config();
const DB = require('../db');
const cfg = require('../config');

async function check() {
  try {
    await DB.init();
  } catch (err) {
    console.error('FAIL - ' + (err.message || 'unknown error'));
    process.exit(1);
  }

  const client = DB.getClient();
  if (!client) {
    console.error('FAIL - Database client not initialized');
    process.exit(1);
  }

  const tables = [
    cfg.runtime.database.tables.profiles,
    cfg.runtime.database.tables.scans,
    cfg.runtime.database.tables.ledgerBlocks
  ];
  let allPass = true;

  for (const table of tables) {
    if (!table) continue;
    const { error } = await client.from(table).select('*').limit(1);
    if (error) {
      if (error.code === '42P01' || (error.message && error.message.includes('schema cache'))) {
        console.log(`FAIL - Table ${table} is missing (missing table)`);
      } else if (error.code === '42501' || (error.message && error.message.toLowerCase().includes('permission denied'))) {
        console.log(`FAIL - Table ${table} error (permission denied)`);
      } else {
        console.log(`FAIL - Table ${table} error: ${error.message}`);
      }
      allPass = false;
    } else {
      console.log(`PASS - Table ${table} exists`);
    }
  }

  process.exit(allPass ? 0 : 1);
}

check();

