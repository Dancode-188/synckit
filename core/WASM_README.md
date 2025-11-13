# SyncKit WASM Module

WebAssembly bindings for the SyncKit sync engine, enabling high-performance local-first sync in JavaScript/TypeScript applications.

## 🎯 Features

- **Document Sync**: LWW (Last-Write-Wins) document synchronization
- **Vector Clocks**: Causal consistency tracking
- **Delta Computation**: Efficient change detection and sync
- **TypeScript Support**: Full TypeScript definitions included
- **Cross-Platform**: Works in browsers and Node.js

## 📦 Build

### Prerequisites

- Rust 1.83+ with `wasm32-unknown-unknown` target
- `wasm-bindgen-cli` version 0.2.105

```bash
# Install wasm32 target
rustup target add wasm32-unknown-unknown

# Install wasm-bindgen-cli
cargo install wasm-bindgen-cli --version 0.2.105
```

### Build for Web (Browser)

```bash
# Using PowerShell script (Windows)
powershell -ExecutionPolicy Bypass -File scripts/build-wasm.ps1

# Or manually:
cargo build --target wasm32-unknown-unknown --release --features wasm
wasm-bindgen target/wasm32-unknown-unknown/release/synckit_core.wasm \
  --out-dir pkg \
  --target web
```

### Build for Node.js

```bash
cargo build --target wasm32-unknown-unknown --release --features wasm
wasm-bindgen target/wasm32-unknown-unknown/release/synckit_core.wasm \
  --out-dir pkg-nodejs \
  --target nodejs
```

## 🧪 Testing

### Node.js Test

```bash
# Build first (nodejs target)
cargo build --target wasm32-unknown-unknown --release --features wasm
wasm-bindgen target/wasm32-unknown-unknown/release/synckit_core.wasm \
  --out-dir pkg-nodejs \
  --target nodejs

# Run test
node tests/wasm_test.mjs
```

### Browser Test

```bash
# Build first (web target)
powershell -ExecutionPolicy Bypass -File scripts/build-wasm.ps1

# Start a local server
cd pkg
node server.js

# Open http://localhost:8000/test.html
```

Or copy `tests/wasm_test.html` to the `pkg/` directory after building.

## 📊 Bundle Size

Production-ready sizes (as of Phase 5):

- **Raw WASM**: 114 KB
- **Gzipped**: 51 KB (competitive with Yjs: 50KB, Automerge: 80KB)

This includes a **complete feature set**:
- Full Document sync with LWW
- Vector Clock implementation
- Delta computation
- PN-Counter CRDT
- OR-Set CRDT
- Fractional Index
- Text CRDT (YATA) - typically 20-30KB alone
- Protocol serialization

**Design Philosophy**: Ship production-ready features over minimal size. 51KB is competitive with industry leaders while providing complete CRDT functionality.

### Future Optimization Path (v0.2.0+)

Optional optimization strategies for those who need smaller bundles:

1. **wasm-opt** (from binaryen): ~30% reduction → 36KB
   ```bash
   wasm-opt -Oz pkg/synckit_core_bg.wasm -o pkg/synckit_core_bg.wasm
   ```

2. **wasm-snip** (remove panic infrastructure): ~10KB reduction
   ```bash
   wasm-snip pkg/synckit_core_bg.wasm -o pkg/synckit_core_bg.wasm
   ```

3. **Tiered builds** (planned for v0.2.0):
   - `synckit-lite`: LWW + Vector Clock only (~18KB)
   - `synckit-core`: + Counter + Set (~30KB)
   - `synckit-full`: All CRDTs including Text (~51KB)

**Note**: Most users prefer full functionality over minimal size. We optimize for features first, then size.

## 📚 API Usage

### Basic Document Operations

```javascript
import init, { WasmDocument } from './synckit_core.js';

// Initialize WASM module
await init();

// Create a document
const doc = new WasmDocument('doc-1');

// Set fields (values must be JSON strings)
doc.setField('name', JSON.stringify('Alice'), 1n, 'client-1');
doc.setField('age', JSON.stringify(30), 2n, 'client-1');

// Get a field
const name = doc.getField('name');
console.log(JSON.parse(name)); // "Alice"

// Export to JSON
const json = doc.toJSON();
console.log(json);

// Merge documents
doc.merge(otherDoc);
```

### Vector Clock

```javascript
import { WasmVectorClock } from './synckit_core.js';

const vc = new WasmVectorClock();
vc.tick('client-1'); // Increment
const clock = vc.get('client-1'); // Get value

// Merge vector clocks
vc.merge(otherVectorClock);
```

### Delta Computation

```javascript
import { WasmDelta } from './synckit_core.js';

// Compute changes between two documents
const delta = WasmDelta.compute(doc1, doc2);
console.log(`Changes: ${delta.changeCount()}`);

// Apply delta to a document
delta.applyTo(doc1, 'client-1');
```

## 🔧 Development

### Project Structure

```
core/
├── src/
│   └── wasm/
│       ├── mod.rs          # Module entry point
│       ├── bindings.rs     # JavaScript bindings
│       └── utils.rs        # WASM utilities
├── scripts/
│   └── build-wasm.ps1      # Build script
├── tests/
│   ├── wasm_test.mjs       # Node.js test
│   └── wasm_test.html      # Browser test
├── pkg/                    # Web build output (gitignored)
└── pkg-nodejs/             # Node.js build output (gitignored)
```

### Cargo Features

- `wasm`: Enable WASM bindings (includes wasm-bindgen, web-sys, js-sys)

### Build Profiles

The `Cargo.toml` includes optimized build profiles:

- `release`: Standard optimizations
- `wasm-release`: Size-optimized for WASM (opt-level = "z")

## 🚀 Next Steps (Phase 6)

Phase 6 will build the TypeScript SDK on top of this WASM module, providing:

- High-level TypeScript API
- Storage adapters (IndexedDB, OPFS, SQLite)
- Offline queue
- Framework integrations (React, Vue, Svelte)

## 📝 Notes

- Clock values use `BigInt` in JavaScript (must use `1n` syntax)
- Field values must be serialized as JSON strings
- Memory management is automatic via wasm-bindgen
- Use `init_panic_hook()` for better error messages in development

## 🐛 Troubleshooting

### "Module not found" errors

Ensure you've built the WASM module first and are importing from the correct path.

### Version mismatch errors

Make sure `wasm-bindgen-cli` version matches the `wasm-bindgen` crate version in `Cargo.toml` (currently 0.2.105).

### CORS errors in browser

WASM files must be served via HTTP(S), not `file://`. Use the provided server.js or any HTTP server.
