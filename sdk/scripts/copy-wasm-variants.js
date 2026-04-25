#!/usr/bin/env node
/**
 * Copy WASM files from pkg-* directories to sdk/wasm/
 * This script copies all variant WASM files for SDK distribution
 */

const fs = require('fs');
const path = require('path');

const variants = ['lite', 'default'];
const rootDir = path.join(__dirname, '../..');
const wasmDir = path.join(__dirname, '../wasm');

// Ensure wasm directory exists
if (!fs.existsSync(wasmDir)) {
  fs.mkdirSync(wasmDir, { recursive: true });
}

console.log('Copying WASM files for all variants...\n');

variants.forEach(variant => {
  const variantDir = path.join(wasmDir, variant);

  // Create variant subdirectory
  if (!fs.existsSync(variantDir)) {
    fs.mkdirSync(variantDir, { recursive: true });
  }

  // Source directory (from build)
  const pkgDir = path.join(rootDir, `pkg-${variant}`);

  if (!fs.existsSync(pkgDir)) {
    console.warn(`⚠️  Warning: ${pkgDir} not found. Run ./scripts/build-wasm.sh ${variant} first.`);
    return;
  }

  // Files to copy
  const files = [
    'synckit_core_bg.wasm',
    'synckit_core_bg.wasm.d.ts',
    'synckit_core.js',
    'synckit_core.d.ts'
  ];

  let copied = 0;
  files.forEach(file => {
    const src = path.join(pkgDir, file);
    const dest = path.join(variantDir, file);

    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      copied++;
    } else {
      console.warn(`  ⚠️  ${file} not found in ${pkgDir}`);
    }
  });

  if (copied === files.length) {
    // Get file size
    const wasmPath = path.join(variantDir, 'synckit_core_bg.wasm');
    const stats = fs.statSync(wasmPath);
    const sizeKB = (stats.size / 1024).toFixed(1);
    console.log(`✅ ${variant}: ${copied} files copied (${sizeKB} KB)`);
  } else {
    console.log(`⚠️  ${variant}: ${copied}/${files.length} files copied`);
  }
});

console.log('\n✅ WASM files copied to sdk/wasm/');
console.log('\nDirectory structure:');
console.log('sdk/wasm/');
variants.forEach(variant => {
  console.log(`  ${variant}/`);
  console.log(`    synckit_core_bg.wasm`);
  console.log(`    synckit_core.js`);
  console.log(`    synckit_core.d.ts`);
});
