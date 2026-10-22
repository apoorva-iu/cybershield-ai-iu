'use strict';
const cp = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');

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
  let child;
  try {
    const port = await findFreePort();
    
    const env = Object.assign({}, process.env);
    env.PORT = port;
    delete env.LEDGER_FILE;
    
    child = cp.spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env,
      stdio: 'pipe'
    });
    
    let booted = false;
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
      if (out.includes('Cyber Shield on http://localhost:')) {
        booted = true;
      }
    });
    
    child.stderr.on('data', (d) => {
      console.error('SERVER ERROR:', d.toString());
    });

    const start = Date.now();
    while (!booted && Date.now() - start < 10000) {
      await new Promise(r => setTimeout(r, 100));
    }
    
    if (!booted) {
      throw new Error('Server did not boot in 10 seconds');
    }
    
    const health = await new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      });
      req.on('error', reject);
    });
    
    const healthData = JSON.parse(health.body);
    if (
      health.statusCode !== 200 ||
      healthData.ok !== true ||
      !('db' in healthData) ||
      'ledger' in healthData ||
      'blockCount' in healthData
    ) {
      throw new Error(`Health check failed: ${health.statusCode} ${health.body}`);
    }
    
    console.log('PASS - Server booted and /api/health answered {ok:true, db}');
    process.exitCode = 0;
  } catch (err) {
    console.error('FAIL -', err.message);
    process.exitCode = 1;
  } finally {
    if (child && child.exitCode === null) {
      await new Promise(resolve => {
        child.on('exit', resolve);
        child.kill('SIGTERM');
      });
    }
  }
}

run();
