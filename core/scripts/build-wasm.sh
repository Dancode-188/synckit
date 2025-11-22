#!/bin/bash
# Build WASM package with optimizations

set -e

echo "🔨 Building WASM package..."

# Build for wasm32 target with release optimizations
cargo build \
    --target wasm32-unknown-unknown \
    --release \
    --features wasm

echo "✅ WASM binary built"

# Generate JavaScript bindings
wasm-bindgen \
    target/wasm32-unknown-unknown/release/synckit_core.wasm \
    --out-dir pkg \
    --target web

echo "✅ JavaScript bindings generated"

# Get file sizes
WASM_SIZE=$(stat -f%z "pkg/synckit_core_bg.wasm" 2>/dev/null || stat -c%s "pkg/synckit_core_bg.wasm" 2>/dev/null || echo "unknown")
echo "📦 WASM size: $WASM_SIZE bytes (~$((WASM_SIZE / 1024))KB)"

# Gzip and measure
gzip -c pkg/synckit_core_bg.wasm > pkg/synckit_core_bg.wasm.gz
GZIP_SIZE=$(stat -f%z "pkg/synckit_core_bg.wasm.gz" 2>/dev/null || stat -c%s "pkg/synckit_core_bg.wasm.gz" 2>/dev/null || echo "unknown")
echo "📦 Gzipped size: $GZIP_SIZE bytes (~$((GZIP_SIZE / 1024))KB)"

echo "✅ Build complete! Output in pkg/"
