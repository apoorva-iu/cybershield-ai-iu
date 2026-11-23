const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const esbuild = require('esbuild');

async function build() {
  console.log('[extension:build] Generating icons...');
  execSync(`node "${path.join(__dirname, '../extension/tools/make-icons.js')}"`, {
    stdio: 'inherit'
  });

  const extDir = path.join(__dirname, '../extension');
  const distDir = path.join(extDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });

  console.log('[extension:build] Bundling extension scripts with esbuild...');
  await esbuild.build({
    entryPoints: [
      path.join(extDir, 'src/content.js'),
      path.join(extDir, 'src/background.js')
    ],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['chrome100'],
    sourcemap: false,
    outdir: distDir
  });

  // Prepare manifest and assets inside extension/dist for unpacked loading directly from extension/dist
  const manifestPath = path.join(extDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const distManifest = {
      ...manifest,
      background: {
        service_worker: 'background.js'
      },
      content_scripts: (manifest.content_scripts || []).map(cs => ({
        ...cs,
        js: (cs.js || []).map(f => f.replace(/^dist\//, ''))
      }))
    };
    fs.writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify(distManifest, null, 2), 'utf8');
  }

  // Copy popup files and config into extension/dist
  for (const f of ['popup.html', 'popup.js', 'popup.css', 'config.js']) {
    const srcF = path.join(extDir, f);
    if (fs.existsSync(srcF)) {
      fs.copyFileSync(srcF, path.join(distDir, f));
    }
  }

  // Copy icons into extension/dist/icons
  const iconsSrc = path.join(extDir, 'icons');
  const iconsDist = path.join(distDir, 'icons');
  if (fs.existsSync(iconsSrc)) {
    fs.mkdirSync(iconsDist, { recursive: true });
    for (const icon of fs.readdirSync(iconsSrc)) {
      fs.copyFileSync(path.join(iconsSrc, icon), path.join(iconsDist, icon));
    }
  }

  // Provide nested dist fallback if dist/content.js is referenced
  const nestedDist = path.join(distDir, 'dist');
  fs.mkdirSync(nestedDist, { recursive: true });
  fs.copyFileSync(path.join(distDir, 'content.js'), path.join(nestedDist, 'content.js'));
  fs.copyFileSync(path.join(distDir, 'background.js'), path.join(nestedDist, 'background.js'));

  console.log('[extension:build] Successfully built extension into extension/dist/');
}

build().catch(err => {
  console.error('[extension:build] Build failed:', err);
  process.exit(1);
});

