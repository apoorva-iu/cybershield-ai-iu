/**
 * WCAG AA Contrast Audit Script for Cyber Shield Design System
 * Validates all foreground / background pairings for Light Mode and Dark Mode across:
 * Tools page, Home, Dashboard Overview, Plan, History detail, Pricing, and Account menu.
 */

function hexToRgb(hex) {
  let cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map(c => c + c).join('');
  }
  const num = parseInt(cleaned, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function luminance({ r, g, b }) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrastRatio(fgHex, bgHex) {
  const l1 = luminance(hexToRgb(fgHex));
  const l2 = luminance(hexToRgb(bgHex));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const lightTokens = {
  bg: '#F5F9FF',
  surface: '#FFFFFF',
  surface2: '#E8F0FC',
  text: '#0B2545',
  textDim: '#35507A',
  primary: '#0B63CE',
  primaryHover: '#084FA6',
  btnText: '#FFFFFF',
  secondaryBtnBg: '#D3E2F7',
  secondaryBtnText: '#0B2545',
  pillBg: '#0B63CE',
  pillText: '#FFFFFF',
  errorBg: '#FEE2E2',
  errorText: '#991B1B',
  warnBg: '#FEF3C7',
  warnText: '#92400E',
  successBg: '#DCFCE7',
  successText: '#15803D'
};

const darkTokens = {
  bg: '#06142B',
  surface: '#0C2145',
  surface2: '#12305F',
  text: '#FFFFFF',
  textDim: '#C9DAF5',
  primary: '#4DA3FF',
  primaryHover: '#7BBBFF',
  btnText: '#06142B',
  secondaryBtnBg: '#D3E2F7',
  secondaryBtnText: '#0B2545',
  pillBg: '#0B63CE',
  pillText: '#FFFFFF',
  errorBg: '#450A0A',
  errorText: '#FFFFFF',
  warnBg: '#78350F',
  warnText: '#FDE68A',
  successBg: '#064E3B',
  successText: '#A7F3D0'
};

const testPairs = [
  // 1. Tools Page Cards
  { theme: 'Light', element: 'Tools card title on card surface', fg: lightTokens.text, bg: lightTokens.surface, min: 4.5 },
  { theme: 'Light', element: 'Tools card line/description on card surface', fg: lightTokens.textDim, bg: lightTokens.surface, min: 4.5 },
  { theme: 'Light', element: 'Tools card "Start screening" text on card surface', fg: lightTokens.primary, bg: lightTokens.surface, min: 4.5 },
  { theme: 'Light', element: 'Tools card action pill icon on surface-2', fg: lightTokens.primary, bg: lightTokens.surface2, min: 4.5 },
  { theme: 'Light', element: 'Tools card action pill on hover (white on blue)', fg: '#FFFFFF', bg: lightTokens.primary, min: 4.5 },
  { theme: 'Dark', element: 'Tools card title on card surface', fg: darkTokens.text, bg: darkTokens.surface, min: 4.5 },
  { theme: 'Dark', element: 'Tools card line/description on card surface', fg: darkTokens.textDim, bg: darkTokens.surface, min: 4.5 },
  { theme: 'Dark', element: 'Tools card "Start screening" text on card surface', fg: darkTokens.primary, bg: darkTokens.surface, min: 4.5 },

  // 2. Oval Badges & Pills ("89 of 100 checks left", Pro, Free, Active, Current plan)
  { theme: 'Light', element: 'Tools header quota pill ("N checks left")', fg: lightTokens.pillText, bg: lightTokens.pillBg, min: 4.5 },
  { theme: 'Light', element: 'Account menu usage pill ("N checks left")', fg: lightTokens.pillText, bg: lightTokens.pillBg, min: 4.5 },
  { theme: 'Light', element: 'Account menu plan chip (Pro / Free)', fg: lightTokens.pillText, bg: lightTokens.pillBg, min: 4.5 },
  { theme: 'Light', element: 'Dashboard tier badge (Free / Pro Pass)', fg: lightTokens.pillText, bg: lightTokens.pillBg, min: 4.5 },
  { theme: 'Light', element: 'Dashboard current plan pill', fg: lightTokens.pillText, bg: lightTokens.pillBg, min: 4.5 },
  { theme: 'Dark', element: 'Tools header quota pill ("N checks left")', fg: darkTokens.pillText, bg: darkTokens.pillBg, min: 4.5 },
  { theme: 'Dark', element: 'Account menu usage pill ("N checks left")', fg: darkTokens.pillText, bg: darkTokens.pillBg, min: 4.5 },
  { theme: 'Dark', element: 'Account menu plan chip (Pro / Free)', fg: darkTokens.pillText, bg: darkTokens.pillBg, min: 4.5 },
  { theme: 'Dark', element: 'Dashboard tier badge (Free / Pro Pass)', fg: darkTokens.pillText, bg: darkTokens.pillBg, min: 4.5 },
  { theme: 'Dark', element: 'Dashboard current plan pill', fg: darkTokens.pillText, bg: darkTokens.pillBg, min: 4.5 },

  // 3. "Run a check" Button & Secondary Buttons
  { theme: 'Light', element: 'Secondary button ("Run a check") normal state', fg: lightTokens.secondaryBtnText, bg: lightTokens.secondaryBtnBg, min: 4.5 },
  { theme: 'Light', element: 'Secondary button ("Run a check") hover/focus state', fg: '#FFFFFF', bg: lightTokens.primary, min: 4.5 },
  { theme: 'Light', element: 'Secondary button ("Run a check") active pressed state', fg: '#FFFFFF', bg: lightTokens.primaryHover, min: 4.5 },
  { theme: 'Dark', element: 'Secondary button ("Run a check") normal state', fg: darkTokens.secondaryBtnText, bg: darkTokens.secondaryBtnBg, min: 4.5 },
  { theme: 'Dark', element: 'Secondary button ("Run a check") hover/focus state', fg: '#FFFFFF', bg: '#0B63CE', min: 4.5 },
  { theme: 'Dark', element: 'Secondary button ("Run a check") active pressed state', fg: '#FFFFFF', bg: '#084FA6', min: 4.5 },

  // 4. Dashboard "Plan & Quota" Box
  { theme: 'Light', element: 'Plan & Quota box title on card surface', fg: lightTokens.text, bg: lightTokens.surface, min: 4.5 },
  { theme: 'Light', element: 'Plan & Quota box label ("Active Tier", "Usage")', fg: lightTokens.textDim, bg: lightTokens.surface, min: 4.5 },
  { theme: 'Light', element: 'Plan & Quota box usage count ("11 of 100 checks")', fg: lightTokens.text, bg: lightTokens.surface, min: 4.5 },
  { theme: 'Light', element: 'Plan & Quota box days left pill (white on blue)', fg: lightTokens.pillText, bg: lightTokens.pillBg, min: 4.5 },
  { theme: 'Dark', element: 'Plan & Quota box title on card surface', fg: darkTokens.text, bg: darkTokens.surface, min: 4.5 },
  { theme: 'Dark', element: 'Plan & Quota box label ("Active Tier", "Usage")', fg: darkTokens.textDim, bg: darkTokens.surface, min: 4.5 },
  { theme: 'Dark', element: 'Plan & Quota box usage count ("11 of 100 checks")', fg: darkTokens.text, bg: darkTokens.surface, min: 4.5 },
  { theme: 'Dark', element: 'Plan & Quota box days left pill (white on blue)', fg: darkTokens.pillText, bg: darkTokens.pillBg, min: 4.5 },

  // 5. General Surfaces & Tokens across Home, History, Pricing, Account menu
  { theme: 'Light', element: 'Primary body text on page bg', fg: lightTokens.text, bg: lightTokens.bg, min: 4.5 },
  { theme: 'Light', element: 'Secondary/dim text on page bg', fg: lightTokens.textDim, bg: lightTokens.bg, min: 4.5 },
  { theme: 'Light', element: 'Account menu item title on popover surface', fg: lightTokens.text, bg: lightTokens.surface, min: 4.5 },
  { theme: 'Light', element: 'Account menu item desc on popover surface', fg: lightTokens.textDim, bg: lightTokens.surface, min: 4.5 },
  { theme: 'Light', element: 'Pricing card title on surface', fg: lightTokens.text, bg: lightTokens.surface, min: 4.5 },
  { theme: 'Light', element: 'Pricing card description on surface', fg: lightTokens.textDim, bg: lightTokens.surface, min: 4.5 },
  { theme: 'Dark', element: 'Primary body text on page bg', fg: darkTokens.text, bg: darkTokens.bg, min: 4.5 },
  { theme: 'Dark', element: 'Secondary/dim text on page bg', fg: darkTokens.textDim, bg: darkTokens.bg, min: 4.5 },
  { theme: 'Dark', element: 'Account menu item title on popover surface', fg: darkTokens.text, bg: darkTokens.surface, min: 4.5 },
  { theme: 'Dark', element: 'Account menu item desc on popover surface', fg: darkTokens.textDim, bg: darkTokens.surface, min: 4.5 },
  { theme: 'Dark', element: 'Pricing card title on surface', fg: darkTokens.text, bg: darkTokens.surface, min: 4.5 },
  { theme: 'Dark', element: 'Pricing card description on surface', fg: darkTokens.textDim, bg: darkTokens.surface, min: 4.5 }
];

console.log('='.repeat(80));
console.log('CYBER SHIELD WCAG AA TARGETED CONTRAST AUDIT');
console.log('Tools, Home, Dashboard Overview, Plan, History Detail, Pricing & Account Menu');
console.log('='.repeat(80));

let failures = 0;
let passes = 0;

testPairs.forEach(t => {
  const ratio = contrastRatio(t.fg, t.bg);
  const passed = ratio >= t.min;
  if (!passed) failures++;
  else passes++;
  const mark = passed ? 'PASS' : 'FAIL';
  console.log(`[${t.theme}] ${mark} | ${ratio.toFixed(2)}:1 (min ${t.min}:1) | ${t.element} (${t.fg} on ${t.bg})`);
});

console.log('='.repeat(80));
console.log(`Total checks: ${testPairs.length} | Passed: ${passes} | Failed: ${failures}`);
console.log('='.repeat(80));

if (failures > 0) {
  process.exit(1);
} else {
  console.log('ALL CHECKED PAGES & SURFACES COMPLIANT WITH WCAG AA (0 FAILURES)');
  process.exit(0);
}
