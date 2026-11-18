const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else if (file.endsWith('.jsx') || file.endsWith('.css')) {
      results.push(fullPath);
    }
  });
  return results;
}

const files = walk('web/src');
console.log('Scanning ' + files.length + ' files in web/src for greys and dark gradients...');

const greyPattern = /#(?:94A3B8|64748B|475569|334155|1E293B|0F172A|9CA3AF|6B7280|4B5563|374151|1F2937|A1A1AA|71717A|52525B|3F3F46|27272A|18181B|A3A3A3|737373|525252|404040|262626|171717|C9D3E3|E2E8F0|F1F5F9|5F6F6C)\b|rgba\s*\(\s*(?:15\s*,\s*23\s*,\s*42|10\s*,\s*15\s*,\s*29|16\s*,\s*26\s*,\s*48|9\s*,\s*15\s*,\s*29)\b/i;

let totalHits = 0;
files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const hits = [];
  lines.forEach((line, idx) => {
    // ignore @media print in layout.css
    if (file.endsWith('layout.css') && idx >= 5080) return;
    if (greyPattern.test(line)) {
      hits.push({ line: idx + 1, text: line.trim() });
    }
  });
  if (hits.length > 0) {
    console.log(`\n=== ${file} (${hits.length} hits) ===`);
    hits.forEach(h => console.log(`  L${h.line}: ${h.text}`));
    totalHits += hits.length;
  }
});

console.log(`\nTotal grey hits found: ${totalHits}`);
