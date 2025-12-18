# SyncKit WASM Core

> **Note:** This document is for contributors building the WASM core from source.
> End users should use the TypeScript SDK (`@synckit-js/sdk`) instead.
> See [Getting Started](../docs/guides/getting-started.md) for user documentation.

WebAssembly core for SyncKit's sync engine, providing high-performance CRDT implementations and conflict resolution algorithms.

## 🎯 What's Included

The WASM core implements SyncKit's performance-critical components:

- **Fugue Text CRDT** - Collaborative text editing with maximal non-interleaving
- **Peritext Rich Text CRDT** - Text formatting that handles conflicts correctly
- **PN-Counter** - Distributed increment/decrement operations
- **OR-Set** - Conflict-free add/remove operations
- **Vector Clocks** - Causal consistency tracking
- **LWW Resolution** - Last-Write-Wins conflict resolution
- **Protocol Buffers** - Efficient network serialization

## 📦 Build Prerequisites

- Rust 1.83+ with `wasm32-unknown-unknown` target
- `wasm-bindgen-cli` version 0.2.105
- `wasm-opt` from Binaryen toolkit (for optimization)

```bash
# Install wasm32 target
rustup target add wasm32-unknown-unknown

# Install wasm-bindgen-cli
cargo install wasm-bindgen-cli --version 0.2.105

# Install wasm-opt (optional but recommended)
# macOS: brew install binaryen
# Ubuntu: apt install binaryen
# Windows: Download from https://github.com/WebAssembly/binaryen/releases
```

## 🔨 Building

### Quick Build (Recommended)

Use the root-level build script:

```bash
# Build default variant (full features)
./scripts/build-wasm.sh default

# Build lite variant (minimal features)
./scripts/build-wasm.sh lite
```

The script handles compilation, wasm-bindgen, and wasm-opt optimization automatically.

### Manual Build

If you need fine-grained control:

```bash
# Step 1: Build Rust to WASM
cd core
cargo build \
  --target wasm32-unknown-unknown \
  --profile wasm-release \
  --features wasm,full \
  --no-default-features

# Step 2: Generate JavaScript bindings
wasm-bindgen \
  target/wasm32-unknown-unknown/wasm-release/synckit_core.wasm \
  --out-dir ../pkg-default \
  --target web

# Step 3: Optimize with wasm-opt
wasm-opt -Oz \
  --strip-debug \
  --strip-producers \
  ../pkg-default/synckit_core_bg.wasm \
  -o ../pkg-default/synckit_core_bg.wasm
```

## 📊 Bundle Sizes (v0.2.0)

Production sizes with all optimizations applied:

### Default Variant (Full Features)

```
Raw WASM:      330.6 KB
Gzipped:       141.1 KB
```

**Includes:** Fugue Text CRDT, Peritext Rich Text, PN-Counter, OR-Set, Vector Clocks, Protocol Buffers, Network sync

### Lite Variant (Minimal)

```
Raw WASM:       79.2 KB
Gzipped:        43.8 KB
```

**Includes:** LWW resolution, Vector Clocks, Local sync only (no network, no CRDTs)

### Complete SDK Sizes

These WASM binaries are part of the full SDK package:

- **Default SDK**: 154 KB gzipped (141 KB WASM + 13 KB JS)
- **Lite SDK**: 46 KB gzipped (44 KB WASM + 2 KB JS)

See [BUNDLE_SIZE.md](../analysis/BUNDLE_SIZE.md) for detailed breakdown.

## 🧪 Testing

### Browser Test

```bash
# Build first
./scripts/build-wasm.sh default

# The build output includes test files
cd pkg-default
node server.js

# Open http://localhost:8000/test.html
```

### Node.js Test

```bash
# Build with Node.js target
cd core
cargo build --target wasm32-unknown-unknown --release --features wasm,full
wasm-bindgen \
  target/wasm32-unknown-unknown/release/synckit_core.wasm \
  --out-dir ../pkg-nodejs \
  --target nodejs

# Run test
cd ..
node tests/wasm_test.mjs
```

## 📚 Low-Level API Usage

> **Note:** Most developers should use the high-level TypeScript SDK instead of calling WASM directly.

### Document Operations

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

// Merge documents
doc.merge(otherDoc);

// Export to JSON
const json = doc.toJSON();
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

## 🔧 Cargo Features

Control what gets included in the WASM binary:

- `wasm` - Enable WASM bindings (required)
- `full` - Include all CRDTs and network protocol
- `core-lite` - Minimal build (LWW + Vector Clock only)
- `text-crdt` - Include Fugue Text CRDT
- `rich-text` - Include Peritext Rich Text CRDT
- `counters` - Include PN-Counter
- `sets` - Include OR-Set

### Build Variants

```bash
# Default: All features
cargo build --features wasm,full

# Lite: Minimal features
cargo build --features wasm,core-lite

# Custom: Only what you need
cargo build --features wasm,text-crdt,counters
```

## 🎛️ Build Profiles

The `Cargo.toml` includes optimized profiles:

### `wasm-release` (Recommended)

```toml
[profile.wasm-release]
inherits = "release"
opt-level = "z"           # Optimize for size
lto = "fat"               # Aggressive link-time optimization
codegen-units = 1         # Better optimization (slower build)
panic = "abort"           # Smaller binary
strip = "symbols"         # Remove debug symbols
```

### `release` (Standard)

```toml
[profile.release]
opt-level = 3             # Optimize for speed
lto = "thin"
```

## 🔍 Optimization Pipeline

Our build uses a 3-stage optimization pipeline:

1. **Rust compiler** - `opt-level = "z"` for size optimization
2. **Link-time optimization (LTO)** - `lto = "fat"` for cross-crate optimization
3. **wasm-opt** - `-Oz` for aggressive post-processing

This achieves **~57% size reduction** from unoptimized builds.

## 🐛 Troubleshooting

### "Module not found" errors

Ensure you've built the WASM module and are importing from the correct path:

```javascript
// ✅ Correct: Import from build output
import init from './pkg-default/synckit_core.js'

// ❌ Wrong: Import from source
import init from './core/src/wasm/mod.rs'
```

### Version mismatch errors

The `wasm-bindgen-cli` version must match the `wasm-bindgen` crate version in `Cargo.toml` (currently 0.2.105):

```bash
cargo install wasm-bindgen-cli --version 0.2.105 --force
```

### CORS errors in browser

WASM files must be served via HTTP(S), not `file://`:

```bash
# Use the provided server
cd pkg-default
node server.js

# Or use any HTTP server
npx http-server pkg-default
python -m http.server 8000
```

### Build is slow

WASM builds are slower than regular Rust builds due to optimization:

- **Development:** Use `--release` profile (~30s build)
- **Production:** Use `--profile wasm-release` (~2-3 min build)

Optimization time is worth it - you get 57% smaller binaries.

## 📝 Technical Notes

- Clock values use `BigInt` in JavaScript (use `1n` syntax)
- Field values must be serialized as JSON strings
- Memory management is automatic via wasm-bindgen
- Use `init_panic_hook()` for better error messages in development
- WASM binaries are deterministic (same input = same output)

## 🔗 See Also

- [Bundle Size Analysis](../analysis/BUNDLE_SIZE.md) - Detailed size breakdown
- [SDK Documentation](../docs/guides/getting-started.md) - High-level TypeScript API
- [Architecture](../docs/architecture/ARCHITECTURE.md) - How WASM fits into SyncKit
- [Contributing Guide](../CONTRIBUTING.md) - How to contribute to the core
