# Build WASM package with optimizations
# PowerShell script for Windows

$ErrorActionPreference = "Stop"

Write-Host "Building WASM package..." -ForegroundColor Cyan

# Build for wasm32 target with release optimizations
cargo build `
    --target wasm32-unknown-unknown `
    --release `
    --features wasm

Write-Host "WASM binary built successfully" -ForegroundColor Green

# Generate JavaScript bindings
wasm-bindgen `
    target\wasm32-unknown-unknown\release\synckit_core.wasm `
    --out-dir pkg `
    --target web

Write-Host "JavaScript bindings generated successfully" -ForegroundColor Green

# Get file sizes
$wasmFile = "pkg\synckit_core_bg.wasm"
$wasmSize = (Get-Item $wasmFile).Length
$wasmKB = [math]::Round($wasmSize/1024, 2)
Write-Host "WASM size: $wasmSize bytes (~${wasmKB}KB)" -ForegroundColor Yellow

# Gzip and measure
$wasmBytes = [System.IO.File]::ReadAllBytes($wasmFile)
$gzipFile = "pkg\synckit_core_bg.wasm.gz"
$gzipStream = [System.IO.File]::Create($gzipFile)
$gzip = New-Object System.IO.Compression.GZipStream($gzipStream, [System.IO.Compression.CompressionMode]::Compress)
$gzip.Write($wasmBytes, 0, $wasmBytes.Length)
$gzip.Close()
$gzipStream.Close()

$gzipSize = (Get-Item $gzipFile).Length
$gzipKB = [math]::Round($gzipSize/1024, 2)
Write-Host "Gzipped size: $gzipSize bytes (~${gzipKB}KB)" -ForegroundColor Yellow

Write-Host "Build complete! Output in pkg/" -ForegroundColor Green
