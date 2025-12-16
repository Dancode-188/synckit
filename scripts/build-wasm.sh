#!/bin/bash
# Build script for SyncKit WASM variants
# Usage: ./scripts/build-wasm.sh <variant>
# Variants: lite, default

set -e  # Exit on error

VARIANT=$1

# Validate variant argument
if [ -z "$VARIANT" ]; then
    echo "Usage: $0 <variant>"
    echo "Variants: lite, default"
    exit 1
fi

# Map user-friendly names to feature flags
case $VARIANT in
    lite)
        FEATURES="wasm,core-lite"
        ;;
    default)
        FEATURES="wasm,full"
        ;;
    *)
        echo "Invalid variant: $VARIANT"
        echo "Valid variants: lite, default"
        exit 1
        ;;
esac

echo "========================================="
echo "Building SyncKit WASM - $VARIANT variant"
echo "========================================="

# Step 1: Build Rust to WASM
echo ""
echo "Step 1: Compiling Rust to WASM..."
cd core
cargo build \
    --target wasm32-unknown-unknown \
    --profile wasm-release \
    --features $FEATURES \
    --no-default-features

if [ $? -ne 0 ]; then
    echo "❌ Cargo build failed"
    exit 1
fi
echo "✅ Compilation successful"

cd ..

# Step 2: Process with wasm-bindgen
echo ""
echo "Step 2: Generating JavaScript bindings..."
wasm-bindgen \
    core/target/wasm32-unknown-unknown/wasm-release/synckit_core.wasm \
    --out-dir pkg-$VARIANT \
    --target web

if [ $? -ne 0 ]; then
    echo "❌ wasm-bindgen failed"
    exit 1
fi
echo "✅ Bindings generated"

# Step 3: Optimize with wasm-opt
echo ""
echo "Step 3: Optimizing WASM binary..."
wasm-opt -Oz \
    --strip-debug \
    --strip-producers \
    pkg-$VARIANT/synckit_core_bg.wasm \
    -o pkg-$VARIANT/synckit_core_bg.wasm

if [ $? -ne 0 ]; then
    echo "❌ wasm-opt failed"
    exit 1
fi
echo "✅ Optimization complete"

# Step 4: Measure sizes
echo ""
echo "========================================="
echo "📊 Build Results - $VARIANT variant"
echo "========================================="

RAW_SIZE=$(ls -lh pkg-$VARIANT/synckit_core_bg.wasm | awk '{print $5}')
RAW_BYTES=$(stat -c%s pkg-$VARIANT/synckit_core_bg.wasm 2>/dev/null || stat -f%z pkg-$VARIANT/synckit_core_bg.wasm)
GZIPPED_BYTES=$(gzip -c pkg-$VARIANT/synckit_core_bg.wasm | wc -c | tr -d ' ')
GZIPPED_KB=$(awk "BEGIN {printf \"%.1f\", $GZIPPED_BYTES/1024}")

echo "Raw size:     $RAW_SIZE ($RAW_BYTES bytes)"
echo "Gzipped size: ${GZIPPED_KB} KB ($GZIPPED_BYTES bytes)"
echo ""
echo "✅ Build complete: pkg-$VARIANT/"
echo "========================================="
