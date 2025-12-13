#!/bin/bash
# Build WASM package with optimizations
# Usage: ./build-wasm.sh [lite|default]

set -e

# Determine variant (default: both)
VARIANT="${1:-all}"

build_variant() {
    local variant=$1
    local features=$2
    local out_dir="pkg-$variant"

    echo "🔨 Building WASM package ($variant variant)..."

    # Build for wasm32 target with release optimizations
    cargo build \
        --target wasm32-unknown-unknown \
        --release \
        --features "$features"

    echo "✅ WASM binary built"

    # Generate JavaScript bindings
    wasm-bindgen \
        target/wasm32-unknown-unknown/release/synckit_core.wasm \
        --out-dir "$out_dir" \
        --target web

    echo "✅ JavaScript bindings generated"

    # Get file sizes
    WASM_SIZE=$(stat -f%z "$out_dir/synckit_core_bg.wasm" 2>/dev/null || stat -c%s "$out_dir/synckit_core_bg.wasm" 2>/dev/null || echo "unknown")
    echo "📦 WASM size: $WASM_SIZE bytes (~$((WASM_SIZE / 1024))KB)"

    # Gzip and measure
    gzip -c "$out_dir/synckit_core_bg.wasm" > "$out_dir/synckit_core_bg.wasm.gz"
    GZIP_SIZE=$(stat -f%z "$out_dir/synckit_core_bg.wasm.gz" 2>/dev/null || stat -c%s "$out_dir/synckit_core_bg.wasm.gz" 2>/dev/null || echo "unknown")
    echo "📦 Gzipped size: $GZIP_SIZE bytes (~$((GZIP_SIZE / 1024))KB)"

    echo "✅ Build complete! Output in $out_dir/"
    echo ""
}

# Build requested variant(s)
case "$VARIANT" in
    lite)
        # Lite variant: minimal features (core-lite + wasm)
        build_variant "lite" "wasm"
        ;;
    default)
        # Default variant: common features (core + wasm + text + sets + counters)
        build_variant "default" "wasm,text-crdt,sets,counters"
        ;;
    all)
        # Build both variants
        build_variant "lite" "wasm"
        build_variant "default" "wasm,text-crdt,sets,counters"
        ;;
    *)
        echo "❌ Error: Invalid variant '$VARIANT'"
        echo "Usage: $0 [lite|default|all]"
        exit 1
        ;;
esac

echo "✅ All builds complete!"
