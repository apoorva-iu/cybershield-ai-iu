const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

function validateApiUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') {
    throw new Error('EXTENSION_API_URL must be a non-empty string');
  }
  const trimmed = urlStr.trim().replace(/\/+$/, '');
  const isLocalhost = /^http:\/\/localhost(:\d+)?$/i.test(trimmed);
  const isHttps = /^https:\/\/[a-zA-Z0-9.-]+(:\d+)?(\/.*)?$/i.test(trimmed);
  if (!isLocalhost && !isHttps) {
    throw new Error(`Invalid EXTENSION_API_URL: "${urlStr}". Must be http://localhost:<port> or https://...`);
  }
  return trimmed;
}

function copyDirRecursive(src, dest, ignoreList = []) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoreList.includes(entry.name) || entry.name.endsWith('.map')) {
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, ignoreList);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function zipExtension() {
  const rawApiUrl = process.env.EXTENSION_API_URL || 'http://localhost:3000';
  const apiUrl = validateApiUrl(rawApiUrl);
  console.log(`[extension:zip] Packaging extension with API_BASE="${apiUrl}"`);

  // Ensure extension/config.js has the target API_BASE before bundling
  const rootDir = path.join(__dirname, '..');
  const sourceConfigPath = path.join(rootDir, 'extension', 'config.js');
  fs.writeFileSync(sourceConfigPath, `// Auto-generated configuration for Cyber Shield extension package.\nexport const API_BASE = "${apiUrl}";\n`, 'utf8');

  console.log('[extension:zip] Running extension:build...');
  execSync(`node "${path.join(__dirname, 'build-extension.js')}"`, { stdio: 'inherit' });
  const extDir = path.join(rootDir, 'extension');
  const tempBase = path.join(rootDir, '.temp-ext-pack');
  const tempExtDir = path.join(tempBase, 'cyber-shield-extension');

  if (fs.existsSync(tempBase)) {
    fs.rmSync(tempBase, { recursive: true, force: true });
  }
  fs.mkdirSync(tempExtDir, { recursive: true });

  // Copy extension files excluding src, tools, node_modules, sourcemaps
  copyDirRecursive(extDir, tempExtDir, ['src', 'tools', 'node_modules', 'shared']);

  // Rewrite config.js in temp folder
  const tempConfigPath = path.join(tempExtDir, 'config.js');
  const configContent = `// Auto-generated configuration for Cyber Shield extension package.\nexport const API_BASE = "${apiUrl}";\n`;
  fs.writeFileSync(tempConfigPath, configContent, 'utf8');

  // Rewrite manifest.json in temp folder
  const tempManifestPath = path.join(tempExtDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(tempManifestPath, 'utf8'));
  manifest.host_permissions = [`${apiUrl}/*`];
  fs.writeFileSync(tempManifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  // Destination directories
  const webDownloadsDir = path.join(rootDir, 'web', 'public', 'downloads');
  const pubDownloadsDir = path.join(rootDir, 'public', 'downloads');
  fs.mkdirSync(webDownloadsDir, { recursive: true });
  fs.mkdirSync(pubDownloadsDir, { recursive: true });

  const zipFileName = 'cyber-shield-extension.zip';
  const zipFilePath = path.join(webDownloadsDir, zipFileName);
  const outStream = fs.createWriteStream(zipFilePath);
  
  const archive = typeof archiver === 'function'
    ? archiver('zip', { zlib: { level: 9 } })
    : new (archiver.ZipArchive || archiver.Archiver)({ zlib: { level: 9 } });

  await new Promise((resolve, reject) => {
    outStream.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(outStream);

    // Archive cyber-shield-extension as top-level folder
    archive.directory(tempExtDir, 'cyber-shield-extension');
    archive.finalize();
  });

  const zipStat = fs.statSync(zipFilePath);
  const infoData = {
    version: manifest.version || '0.1.0',
    sizeBytes: zipStat.size,
    apiBase: apiUrl
  };

  const infoFileName = 'extension-info.json';
  const infoFilePath = path.join(webDownloadsDir, infoFileName);
  fs.writeFileSync(infoFilePath, JSON.stringify(infoData, null, 2), 'utf8');

  // Also mirror to public/downloads/ for immediate serving
  fs.copyFileSync(zipFilePath, path.join(pubDownloadsDir, zipFileName));
  fs.copyFileSync(infoFilePath, path.join(pubDownloadsDir, infoFileName));

  // Clean up temp folder
  try {
    fs.rmSync(tempBase, { recursive: true, force: true });
  } catch (e) {}

  console.log(`[extension:zip] Successfully created ${zipFileName} (${zipStat.size} bytes)`);
  console.log(`[extension:zip] Wrote ${infoFileName}`);
}

zipExtension().catch(err => {
  console.error('[extension:zip] Error:', err.message);
  process.exit(1);
});
