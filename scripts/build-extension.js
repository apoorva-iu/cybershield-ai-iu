const path = require('path');
const { execSync } = require('child_process');
const esbuild = require('esbuild');

async function build() {
  console.log('[extension:build] Generating icons...');
  execSync(`node "${path.join(__dirname, '../extension/tools/make-icons.js')}"`, {
    stdio: 'inherit'
  });

  console.log('[extension:build] Bundling extension scripts with esbuild...');
  await esbuild.build({
    entryPoints: [
      path.join(__dirname, '../extension/src/content.js'),
      path.join(__dirname, '../extension/src/background.js')
    ],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['chrome100'],
    sourcemap: false,
    outdir: path.join(__dirname, '../extension/dist')
  });

  console.log('[extension:build] Successfully built extension into extension/dist/');
}

build().catch(err => {
  console.error('[extension:build] Build failed:', err);
  process.exit(1);
});

