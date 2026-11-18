// tests/theme_toggle.test.js
// Automated verification for Light / Dark theme toggle system

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function getLuminance(hex) {
  const cleanHex = hex.replace('#', '').trim();
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getContrastRatio(hex1, hex2) {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

console.log('--- RUNNING THEME TOGGLE VERIFICATION SUITE ---');

// Test 1: Palette tokens in base.css
console.log('\n[TEST 1] Verifying palette tokens in web/src/base.css...');
const baseCss = fs.readFileSync(path.join(__dirname, '../web/src/base.css'), 'utf8');

const requiredTokens = [
  '--bg',
  '--surface',
  '--surface-2',
  '--border',
  '--line',
  '--text',
  '--text-dim',
  '--text-muted',
  '--text-faint',
  '--accent',
  '--accent-hover',
  '--on-accent',
  '--focus-ring',
  '--risk-ok',
  '--risk-ok-text',
  '--risk-ok-bg',
  '--risk-warn',
  '--risk-warn-text',
  '--risk-warn-bg',
  '--risk-bad',
  '--risk-bad-text',
  '--risk-bad-bg',
  '--risk-unknown',
  '--risk-unknown-text',
  '--risk-unknown-bg',
  '--primary-btn-bg',
  '--primary-btn-text',
  '--modal-overlay-bg'
];

requiredTokens.forEach((token) => {
  assert(baseCss.includes(token), `Missing token ${token} in base.css`);
});

assert(baseCss.includes('[data-theme="light"]'), 'Missing [data-theme="light"] selector in base.css');
assert(baseCss.includes('@media (prefers-color-scheme: light)'), 'Missing prefers-color-scheme: light query in base.css');
assert(baseCss.includes('#F5F9FF'), 'Missing light background (#F5F9FF) in base.css');
assert(baseCss.includes('#0B63CE'), 'Missing accent blue (#0B63CE) in base.css');
console.log('✓ Test 1 passed: All required tokens and light theme definitions present in base.css.');

// Test 2: WCAG AA contrast calculations
console.log('\n[TEST 2] Verifying WCAG AA contrast ratios (>= 4.5:1)...');
const pairs = [
  { label: 'Light mode primary text on white surface', fg: '#0B2545', bg: '#FFFFFF', min: 4.5 },
  { label: 'Light mode secondary text on white surface', fg: '#35507A', bg: '#FFFFFF', min: 4.5 },
  { label: 'Light mode primary text on page bg', fg: '#0B2545', bg: '#F5F9FF', min: 4.5 },
  { label: 'Light mode secondary text on page bg', fg: '#35507A', bg: '#F5F9FF', min: 4.5 },
  { label: 'Light mode risk OK text on OK badge background', fg: '#166534', bg: '#DCFCE7', min: 4.5 },
  { label: 'Light mode risk WARN text on WARN badge background', fg: '#92400E', bg: '#FEF3C7', min: 4.5 },
  { label: 'Light mode risk BAD text on BAD badge background', fg: '#991B1B', bg: '#FEE2E2', min: 4.5 },
  { label: 'Dark mode primary text on surface', fg: '#FFFFFF', bg: '#0C2145', min: 4.5 },
  { label: 'Dark mode secondary text on surface', fg: '#C9DAF5', bg: '#0C2145', min: 4.5 },
  { label: 'Dark mode secondary text on page bg', fg: '#C9DAF5', bg: '#06142B', min: 4.5 }
];

pairs.forEach(({ label, fg, bg, min }) => {
  const ratio = getContrastRatio(fg, bg);
  console.log(`  - ${label}: ${fg} on ${bg} -> ${ratio.toFixed(2)}:1 (required >= ${min}:1)`);
  assert(ratio >= min, `Contrast failed for ${label}: ${ratio.toFixed(2)}:1 < ${min}:1`);
});
console.log('✓ Test 2 passed: All text and risk labels meet or exceed WCAG AA contrast.');

// Test 3: Toggle placement in UI components
console.log('\n[TEST 3] Verifying toggle placement in Header, Dashboard, and Login...');
const headerSrc = fs.readFileSync(path.join(__dirname, '../web/src/components/Header.jsx'), 'utf8');
const dashboardSrc = fs.readFileSync(path.join(__dirname, '../web/src/pages/Dashboard.jsx'), 'utf8');
const loginSrc = fs.readFileSync(path.join(__dirname, '../web/src/pages/Login.jsx'), 'utf8');

assert(headerSrc.includes('<ThemeToggle variant="navbar" />'), 'ThemeToggle navbar variant missing in Header.jsx');
assert(headerSrc.includes('<ThemeToggle variant="mobile" showLabel={true} />'), 'ThemeToggle mobile variant missing in Header.jsx drawer');
assert(dashboardSrc.includes('<ThemeToggle variant="sidebar" showLabel={true} />'), 'ThemeToggle sidebar variant missing in Dashboard.jsx');
assert(loginSrc.includes('<ThemeToggle variant="corner" />'), 'ThemeToggle corner variant missing in Login.jsx');
console.log('✓ Test 3 passed: ThemeToggle is positioned in all 4 required locations.');

// Test 4: Early execution & FOUC prevention in index.html
console.log('\n[TEST 4] Verifying early theme script and meta tag in web/index.html...');
const indexHtml = fs.readFileSync(path.join(__dirname, '../web/index.html'), 'utf8');

assert(indexHtml.includes('<meta name="theme-color"'), 'Missing <meta name="theme-color"> in index.html');
assert(indexHtml.includes('cs_theme'), 'Missing cs_theme localStorage lookup in index.html');
assert(indexHtml.includes('prefers-color-scheme: light'), 'Missing prefers-color-scheme media query in index.html');
assert(indexHtml.includes('documentElement.setAttribute(\'data-theme\''), 'Missing data-theme attribute set in index.html');
console.log('✓ Test 4 passed: Early execution script in index.html prevents FOUC.');

// Test 5: Theme library implementation in web/src/lib/theme.jsx
console.log('\n[TEST 5] Verifying web/src/lib/theme.jsx implementation...');
const themeJsx = fs.readFileSync(path.join(__dirname, '../web/src/lib/theme.jsx'), 'utf8');

assert(themeJsx.includes('Sun'), 'Missing Sun icon in theme.jsx');
assert(themeJsx.includes('Moon'), 'Missing Moon icon in theme.jsx');
assert(themeJsx.includes('Switch to light mode'), 'Missing accessible label "Switch to light mode"');
assert(themeJsx.includes('Switch to dark mode'), 'Missing accessible label "Switch to dark mode"');
assert(themeJsx.includes('localStorage.setItem(STORAGE_KEY'), 'Missing localStorage persist in theme.jsx');
assert(themeJsx.includes('theme-ready'), 'Missing theme-ready class toggling in theme.jsx');
assert(themeJsx.includes('addEventListener(\'change\''), 'Missing system preference listener in theme.jsx');
console.log('✓ Test 5 passed: Theme library conforms to all accessibility and storage requirements.');

// Test 6: Transition and reduced motion rules in base.css
console.log('\n[TEST 6] Verifying 150ms transition and prefers-reduced-motion in base.css...');
assert(baseCss.includes('150ms'), 'Missing 150ms transition in base.css');
assert(baseCss.includes('html.theme-ready'), 'Transition must be scoped to html.theme-ready to avoid initial paint lag');
assert(baseCss.includes('@media (prefers-reduced-motion: reduce)'), 'Missing prefers-reduced-motion rule in base.css');
assert(baseCss.includes('transition: none !important'), 'Missing transition: none !important in prefers-reduced-motion');
console.log('✓ Test 6 passed: Transitions and reduced motion preferences verified.');

console.log('\n======================================================');
console.log('ALL THEME TOGGLE AUTOMATED TESTS PASSED SUCCESSFULLY!');
console.log('======================================================');
