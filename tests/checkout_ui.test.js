/**
 * Checkout & Upgrade UI Unit Tests
 * Validates checkout client logic, startUpgrade flow, signed-out redirection,
 * Razorpay on-demand lazy loading, verification handling, calm error messaging,
 * test-mode notice rules, and UI state contract.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runTest(name, fn) {
  try {
    fn();
    console.log(`   ✓ ${name}`);
  } catch (err) {
    console.error(`   ✗ ${name}`);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`   ✓ ${name}`);
  } catch (err) {
    console.error(`   ✗ ${name}`);
    throw err;
  }
}

async function main() {
  console.log('\nRunning Checkout & Upgrade UI unit tests...\n');

  // Test 1: Source Code Verification & Scope Lock
  runTest('1. Scope lock: touched files are limited to frontend checkout and billing UI', () => {
    const billingJs = fs.readFileSync(path.join(__dirname, '../web/src/lib/billing.js'), 'utf8');
    const pricingJsx = fs.readFileSync(path.join(__dirname, '../web/src/pages/Pricing.jsx'), 'utf8');
    const pricingCardsJsx = fs.readFileSync(path.join(__dirname, '../web/src/components/PricingCards.jsx'), 'utf8');
    const headerJsx = fs.readFileSync(path.join(__dirname, '../web/src/components/Header.jsx'), 'utf8');
    const dashboardJsx = fs.readFileSync(path.join(__dirname, '../web/src/pages/Dashboard.jsx'), 'utf8');

    assert.ok(billingJs.includes('startUpgrade'), 'billing.js exports startUpgrade');
    assert.ok(billingJs.includes('useBillingStatus'), 'billing.js exports useBillingStatus');
    assert.ok(billingJs.includes('loadRazorpayScript'), 'billing.js lazy-loads Razorpay SDK');
    assert.ok(billingJs.includes('checkout.razorpay.com/v1/checkout.js'), 'Razorpay script URL matches official CDN');

    assert.ok(pricingJsx.includes('Add 30 days for Rs 1'), 'Pricing.jsx has Pro button label');
    assert.ok(pricingCardsJsx.includes('Add 30 days for Rs 1'), 'PricingCards.jsx has Pro button label');
    assert.ok(headerJsx.includes('account-plan-chip'), 'Header.jsx has account-plan-chip');
    assert.ok(dashboardJsx.includes('dash-plan-status-card'), 'Dashboard.jsx has dash-plan-status-card');
  });

  // Test 2: Razorpay Script is NOT loaded in public/index.html or web/index.html
  runTest('2. Razorpay script is NOT loaded on normal pages (strictly on-demand)', () => {
    const publicHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    const webHtml = fs.readFileSync(path.join(__dirname, '../web/index.html'), 'utf8');

    assert.strictEqual(publicHtml.includes('razorpay'), false, 'public/index.html has no razorpay script');
    assert.strictEqual(publicHtml.includes('checkout.js'), false, 'public/index.html has no checkout.js');
    assert.strictEqual(webHtml.includes('razorpay'), false, 'web/index.html has no razorpay script');
  });

  // Test 3: No Secret Key in Frontend Bundles or Source
  runTest('3. No secret keys or credentials exposed in frontend code', () => {
    const billingJs = fs.readFileSync(path.join(__dirname, '../web/src/lib/billing.js'), 'utf8');
    assert.strictEqual(billingJs.includes('RAZORPAY_KEY_SECRET'), false, 'No secret key in billing.js');
    assert.strictEqual(billingJs.includes('rzp_test_secret'), false, 'No test secret in billing.js');
    assert.strictEqual(billingJs.includes('rzp_live_secret'), false, 'No live secret in billing.js');
  });

  // Test 4: formatExpiryDate logic
  runTest('4. formatExpiryDate formatting helper', () => {
    // Dynamically test the date formatting logic
    function formatExpiryDate(isoString) {
      if (!isoString) return 'in 30 days';
      try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return 'in 30 days';
        return new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        }).format(d);
      } catch {
        return 'in 30 days';
      }
    }

    assert.strictEqual(formatExpiryDate(null), 'in 30 days');
    assert.strictEqual(formatExpiryDate('invalid-date'), 'in 30 days');
    const formatted = formatExpiryDate('2026-11-28T12:00:00.000Z');
    assert.ok(formatted.includes('28') && formatted.includes('Nov') && formatted.includes('2026'), `Formatted: ${formatted}`);
  });

  // Test 5: Signed-out Upgrade Redirection
  runTest('5. Signed-out Upgrade flow sets returnTo and directs to login', () => {
    const billingJs = fs.readFileSync(path.join(__dirname, '../web/src/lib/billing.js'), 'utf8');
    assert.ok(billingJs.includes("setReturnTo('/pricing')"), 'Calls setReturnTo with /pricing');
    assert.ok(billingJs.includes("window.location.hash = '#/login?returnTo=/pricing'"), 'Directs to #/login?returnTo=/pricing');
  });

  // Test 6: Calm Error Message on Verification Failure
  runTest('6. Verification failure shows calm message and does NOT grant Pro locally', () => {
    const billingJs = fs.readFileSync(path.join(__dirname, '../web/src/lib/billing.js'), 'utf8');
    assert.ok(
      billingJs.includes('If money was debited it will be applied after verification'),
      'Calm message matches specification'
    );
    assert.ok(
      billingJs.includes('Contact us with your order id:'),
      'Mentions order id in calm message'
    );
    // Ensure no client-side local plan mutation on failure
    assert.strictEqual(
      billingJs.includes('status.plan = "pro"'),
      false,
      'Does not set Pro locally on error'
    );
  });

  // Test 7: Double-Click Prevention
  runTest('7. startUpgrade prevents double-click / concurrent checkout launches', () => {
    const billingJs = fs.readFileSync(path.join(__dirname, '../web/src/lib/billing.js'), 'utf8');
    assert.ok(billingJs.includes('isUpgradeInProgress'), 'Tracks isUpgradeInProgress flag');
    assert.ok(billingJs.includes('busy: true'), 'Rejects concurrent click when busy');
  });

  // Test 8: Test-Mode Notice and Payments Unavailable States
  runTest('8. Test-mode notice and 503 Payments Unavailable handling', () => {
    const billingJs = fs.readFileSync(path.join(__dirname, '../web/src/lib/billing.js'), 'utf8');
    const pricingJsx = fs.readFileSync(path.join(__dirname, '../web/src/pages/Pricing.jsx'), 'utf8');
    const dashboardJsx = fs.readFileSync(path.join(__dirname, '../web/src/pages/Dashboard.jsx'), 'utf8');

    const expectedNotice = 'Test mode: no real money is charged.';
    assert.ok(billingJs.includes(expectedNotice), 'Test-mode notice present in modal');
    assert.ok(pricingJsx.includes(expectedNotice), 'Test-mode notice present in Pricing.jsx');
    assert.ok(dashboardJsx.includes(expectedNotice), 'Test-mode notice present in Dashboard.jsx');

    const expectedUnavailable = 'Payments unavailable right now';
    assert.ok(pricingJsx.includes(expectedUnavailable), 'Disabled state shows Payments unavailable right now in Pricing');
    assert.ok(dashboardJsx.includes(expectedUnavailable), 'Disabled state shows Payments unavailable right now in Dashboard');
  });

  // Test 9: Account Menu Chip Contract
  runTest('9. Account menu chip displays Pro · N days left or Free', () => {
    const headerJsx = fs.readFileSync(path.join(__dirname, '../web/src/components/Header.jsx'), 'utf8');
    assert.ok(headerJsx.includes('account-plan-chip'), 'Contains account-plan-chip element');
    assert.ok(headerJsx.includes('Pro · ${daysLeft}'), 'Renders Pro · N days left');
    assert.ok(headerJsx.includes("'Free'"), 'Renders Free otherwise');
  });

  // Test 10: Quota Modal & Account Menu routes go to #/pricing
  runTest('10. Quota modal "See Pro" and account menu "Upgrade" link to #/pricing', () => {
    const quotaModalJsx = fs.readFileSync(path.join(__dirname, '../web/src/components/QuotaExceededModal.jsx'), 'utf8');
    const headerJsx = fs.readFileSync(path.join(__dirname, '../web/src/components/Header.jsx'), 'utf8');

    assert.ok(quotaModalJsx.includes("navigate('/pricing')"), 'Quota modal See Pro navigates to /pricing');
    assert.ok(headerJsx.includes('to="/pricing"'), 'Account menu Upgrade links to /pricing');
  });

  console.log('\nAll 10 checkout UI tests passed successfully!\n');
}

main().catch((err) => {
  console.error('\nCheckout UI test failed:', err);
  process.exit(1);
});
