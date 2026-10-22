'use strict';

const net = require('net');
const path = require('path');
const fs = require('fs');

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

let allPassed = true;
function test(name, ok) {
  if (ok) {
    console.log('PASS - ' + name);
  } else {
    console.error('FAIL - ' + name);
    allPassed = false;
  }
}

async function run() {
  const port = await findFreePort();
  process.env.PORT = String(port);
  process.env.LEDGER_FILE = path.join(__dirname, 'temp_ledger_cors.json');
  if (fs.existsSync(process.env.LEDGER_FILE)) {
    try { fs.unlinkSync(process.env.LEDGER_FILE); } catch (e) {}
  }

  // Set test environment flags
  const server = require('../server');
  const baseUrl = `http://127.0.0.1:${port}`;
  const extOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
  const evilOrigin = 'https://malicious-site.example.com';

  try {
    // =========================================================================
    // 1. ALLOWED ON THE THREE EXTENSION ROUTES
    // =========================================================================

    // Route 1: POST /api/verify
    const extVerifyPost = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: {
        Origin: extOrigin,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ desc: 'Example customer support specialist role with competitive compensation' })
    });
    test(
      'Extension allowed on POST /api/verify with no credentials',
      extVerifyPost.headers.get('access-control-allow-origin') === extOrigin &&
      extVerifyPost.headers.get('access-control-allow-credentials') !== 'true'
    );

    const extVerifyOptions = await fetch(`${baseUrl}/api/verify`, {
      method: 'OPTIONS',
      headers: {
        Origin: extOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      }
    });
    test(
      'Extension preflight allowed on OPTIONS /api/verify',
      extVerifyOptions.status === 204 &&
      extVerifyOptions.headers.get('access-control-allow-origin') === extOrigin
    );

    // Route 2: POST /api/upi/check
    const extUpiPost = await fetch(`${baseUrl}/api/upi/check`, {
      method: 'POST',
      headers: {
        Origin: extOrigin,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input: 'Approved refund of Rs 2500 pending. Open app and enter PIN to claim' })
    });
    test(
      'Extension allowed on POST /api/upi/check with no credentials',
      extUpiPost.headers.get('access-control-allow-origin') === extOrigin &&
      extUpiPost.headers.get('access-control-allow-credentials') !== 'true'
    );

    const extUpiOptions = await fetch(`${baseUrl}/api/upi/check`, {
      method: 'OPTIONS',
      headers: {
        Origin: extOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      }
    });
    test(
      'Extension preflight allowed on OPTIONS /api/upi/check',
      extUpiOptions.status === 204 &&
      extUpiOptions.headers.get('access-control-allow-origin') === extOrigin
    );

    // Route 3: POST /api/message/check
    const extMsgPost = await fetch(`${baseUrl}/api/message/check`, {
      method: 'POST',
      headers: {
        Origin: extOrigin,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input: 'Urgent notice: Account blocked due to incomplete KYC verification' })
    });
    test(
      'Extension allowed on POST /api/message/check with no credentials',
      extMsgPost.headers.get('access-control-allow-origin') === extOrigin &&
      extMsgPost.headers.get('access-control-allow-credentials') !== 'true'
    );

    const extMsgOptions = await fetch(`${baseUrl}/api/message/check`, {
      method: 'OPTIONS',
      headers: {
        Origin: extOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      }
    });
    test(
      'Extension preflight allowed on OPTIONS /api/message/check',
      extMsgOptions.status === 204 &&
      extMsgOptions.headers.get('access-control-allow-origin') === extOrigin
    );

    // =========================================================================
    // 2. DENIED ON OTHER ROUTES & METHODS
    // =========================================================================

    // Denied on /api/upi/read-screenshot
    const extUpiScreenshot = await fetch(`${baseUrl}/api/upi/read-screenshot`, {
      method: 'POST',
      headers: { Origin: extOrigin }
    });
    const extUpiScreenshotOpt = await fetch(`${baseUrl}/api/upi/read-screenshot`, {
      method: 'OPTIONS',
      headers: { Origin: extOrigin, 'Access-Control-Request-Method': 'POST' }
    });
    test(
      'Extension denied on /api/upi/read-screenshot',
      extUpiScreenshot.headers.get('access-control-allow-origin') === null &&
      extUpiScreenshotOpt.headers.get('access-control-allow-origin') === null
    );

    // Denied on /api/message/read-screenshot
    const extMsgScreenshot = await fetch(`${baseUrl}/api/message/read-screenshot`, {
      method: 'POST',
      headers: { Origin: extOrigin }
    });
    const extMsgScreenshotOpt = await fetch(`${baseUrl}/api/message/read-screenshot`, {
      method: 'OPTIONS',
      headers: { Origin: extOrigin, 'Access-Control-Request-Method': 'POST' }
    });
    test(
      'Extension denied on /api/message/read-screenshot',
      extMsgScreenshot.headers.get('access-control-allow-origin') === null &&
      extMsgScreenshotOpt.headers.get('access-control-allow-origin') === null
    );

    // Denied on /api/proof/verify
    const extProofVerify = await fetch(`${baseUrl}/api/proof/verify`, {
      method: 'POST',
      headers: { Origin: extOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash: 'abc' })
    });
    const extProofVerifyOpt = await fetch(`${baseUrl}/api/proof/verify`, {
      method: 'OPTIONS',
      headers: { Origin: extOrigin, 'Access-Control-Request-Method': 'POST' }
    });
    test(
      'Extension denied on /api/proof/verify',
      extProofVerify.headers.get('access-control-allow-origin') === null &&
      extProofVerifyOpt.headers.get('access-control-allow-origin') === null
    );

    // Denied on /api/me and /api/scans
    const extMe = await fetch(`${baseUrl}/api/me`, {
      headers: { Origin: extOrigin }
    });
    const extMeOpt = await fetch(`${baseUrl}/api/me`, {
      method: 'OPTIONS',
      headers: { Origin: extOrigin, 'Access-Control-Request-Method': 'GET' }
    });
    const extScans = await fetch(`${baseUrl}/api/scans`, {
      headers: { Origin: extOrigin }
    });
    test(
      'Extension denied on /api/me and /api/scans',
      extMe.headers.get('access-control-allow-origin') === null &&
      extMeOpt.headers.get('access-control-allow-origin') === null &&
      extScans.headers.get('access-control-allow-origin') === null
    );

    // Denied on non-POST methods for allowed paths
    const extGetVerify = await fetch(`${baseUrl}/api/verify`, {
      headers: { Origin: extOrigin }
    });
    const extGetUpi = await fetch(`${baseUrl}/api/upi/check`, {
      headers: { Origin: extOrigin }
    });
    const extGetMsg = await fetch(`${baseUrl}/api/message/check`, {
      headers: { Origin: extOrigin }
    });
    test(
      'Extension denied on non-POST methods on allowed paths',
      extGetVerify.headers.get('access-control-allow-origin') === null &&
      extGetUpi.headers.get('access-control-allow-origin') === null &&
      extGetMsg.headers.get('access-control-allow-origin') === null
    );

    // Denied on arbitrary paths
    const extHealth = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: extOrigin }
    });
    test('Extension denied on /api/health', extHealth.headers.get('access-control-allow-origin') === null);

    // =========================================================================
    // 3. SAME-ORIGIN & UNLISTED ORIGIN BEHAVIOR UNCHANGED
    // =========================================================================

    const sameOriginVerify = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: {
        Origin: baseUrl,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ desc: 'Legitimate corporate software engineer opening' })
    });
    const sameOriginHealth = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: baseUrl }
    });
    test(
      'Same-origin requests receive Access-Control-Allow-Origin matching host',
      sameOriginVerify.headers.get('access-control-allow-origin') === baseUrl &&
      sameOriginHealth.headers.get('access-control-allow-origin') === baseUrl
    );

    const evilVerify = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: {
        Origin: evilOrigin,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ desc: 'Test description text' })
    });
    const evilUpi = await fetch(`${baseUrl}/api/upi/check`, {
      method: 'POST',
      headers: {
        Origin: evilOrigin,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input: 'Sample payment text' })
    });
    test(
      'Unlisted web origins are blocked with no Access-Control-Allow-Origin header',
      evilVerify.headers.get('access-control-allow-origin') === null &&
      evilUpi.headers.get('access-control-allow-origin') === null
    );

    // =========================================================================
    // 4. CONFIRM OPTIONALAUTH TREATS EXTENSION AS ANONYMOUS
    // =========================================================================

    // Even if Authorization header is sent with extension Origin, req.user remains null
    const extWithAuth = await fetch(`${baseUrl}/api/upi/check`, {
      method: 'POST',
      headers: {
        Origin: extOrigin,
        'Content-Type': 'application/json',
        Authorization: 'Bearer any-token-value'
      },
      body: JSON.stringify({ input: 'Refund of Rs 5000 is pending. Approve collect request to claim' })
    });
    const extWithAuthData = await extWithAuth.json().catch(() => null);
    test(
      'optionalAuth forces anonymous user (saved=false) for extension origin',
      extWithAuthData && extWithAuthData.saved === false
    );

  } finally {
    server.close(() => {
      if (fs.existsSync(process.env.LEDGER_FILE)) {
        try { fs.unlinkSync(process.env.LEDGER_FILE); } catch (e) {}
      }
      process.exitCode = allPassed ? 0 : 1;
    });
  }
}

run().catch((err) => {
  console.error('FAIL - Test execution error:', err);
  process.exitCode = 1;
});

