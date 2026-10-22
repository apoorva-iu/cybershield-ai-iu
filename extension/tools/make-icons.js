const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ICONS_DIR = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

const SVG = `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3B8FE0" />
      <stop offset="100%" stop-color="#0A66C2" />
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="25" fill="url(#g)" />
  <path d="M 50 20 L 76 28 C 76 54 64 69 50 80 C 36 69 24 54 24 28 Z" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.4" />
  <path d="M 50 28 L 68 34 C 68 53 59 63 50 72 C 41 63 32 53 32 34 Z" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.75" />
  <path d="M 50 37 L 60 41 C 60 52 55 58 50 63 C 45 58 40 52 40 41 Z" fill="#FFFFFF" />
</svg>`;

const SIZES = [16, 32, 48, 128];

async function generate() {
  const svgBuf = Buffer.from(SVG);
  for (const size of SIZES) {
    const outPath = path.join(ICONS_DIR, `icon-${size}.png`);
    await sharp(svgBuf)
      .resize(size, size)
      .png()
      .toFile(outPath);
    console.log(`Generated icon-${size}.png`);
  }
}

generate().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});

