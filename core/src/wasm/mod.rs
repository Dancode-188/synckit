//! WASM bindings for SyncKit
//!
//! This module provides JavaScript-friendly bindings for the SyncKit sync engine.

#[cfg(feature = "wasm")]
pub mod bindings;

#[cfg(feature = "wasm")]
pub mod utils;

// Re-export main types
#[cfg(feature = "wasm")]
pub use bindings::{WasmAwareness, WasmDocument, WasmVectorClock};

// WasmDelta only available with protocol support
#[cfg(all(feature = "wasm", feature = "prost"))]
pub use bindings::WasmDelta;
