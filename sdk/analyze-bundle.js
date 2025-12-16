const fs = require('fs');
const meta = JSON.parse(fs.readFileSync('dist/metafile-esm.json', 'utf8'));

console.log('='.repeat(60));
console.log('JAVASCRIPT BUNDLE SIZE ANALYSIS');
console.log('='.repeat(60));
console.log('');

// Analyze each output
for (const [output, data] of Object.entries(meta.outputs)) {
  const fileName = output.split('/').pop();
  console.log(`\n📦 ${fileName} (${data.bytes} bytes, ${(data.bytes/1024).toFixed(1)} KB)`);
  console.log('-'.repeat(60));

  // Sort inputs by size
  const sorted = Object.entries(data.inputs)
    .map(([file, info]) => ({ file, bytes: info.bytesInOutput }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 15); // Top 15

  sorted.forEach(({ file, bytes }) => {
    const kb = (bytes/1024).toFixed(2);
    const pct = (bytes/data.bytes*100).toFixed(1);
    console.log(`  ${kb.padStart(7)} KB  (${pct.padStart(5)}%)  ${file}`);
  });

  const others = data.bytes - sorted.reduce((sum, item) => sum + item.bytes, 0);
  if (others > 0) {
    console.log(`  ${(others/1024).toFixed(2).padStart(7)} KB  (${(others/data.bytes*100).toFixed(1).padStart(5)}%)  ... ${Object.keys(data.inputs).length - sorted.length} more files`);
  }
}

console.log('\n' + '='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
console.log(`Total bundles: ${Object.keys(meta.outputs).length}`);
Object.entries(meta.outputs).forEach(([output, data]) => {
  console.log(`  ${output.split('/').pop().padEnd(30)} ${(data.bytes/1024).toFixed(1).padStart(7)} KB`);
});
