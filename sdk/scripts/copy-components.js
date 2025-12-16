/**
 * Copy Vue and Svelte component files to dist folder
 * These files are shipped as source and compiled by the consuming application
 */

const fs = require('fs');
const path = require('path');

function copyRecursive(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursive(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Copy Vue components
const vueComponentsSrc = path.join(__dirname, '../src/adapters/vue/components');
const vueComponentsDest = path.join(__dirname, '../dist/adapters/vue/components');

if (fs.existsSync(vueComponentsSrc)) {
  console.log('Copying Vue components...');
  copyRecursive(vueComponentsSrc, vueComponentsDest);
  console.log('✓ Vue components copied');
}

// Copy Svelte components
const svelteComponentsSrc = path.join(__dirname, '../src/adapters/svelte/components');
const svelteComponentsDest = path.join(__dirname, '../dist/adapters/svelte/components');

if (fs.existsSync(svelteComponentsSrc)) {
  console.log('Copying Svelte components...');
  copyRecursive(svelteComponentsSrc, svelteComponentsDest);
  console.log('✓ Svelte components copied');
}

console.log('Component files copied successfully!');
