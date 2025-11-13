// Protocol module - Binary protocol using Protocol Buffers
//!
//! This module provides:
//! - Protocol Buffer message definitions (generated)
//! - Serialization/deserialization for CRDTs
//! - Delta computation and sync primitives
//! - WebSocket message handling

// Include generated protocol buffer code
#[allow(clippy::all)]
#[allow(warnings)]
mod gen {
    include!("gen/synckit.protocol.rs");
}

// Re-export protocol types for convenience
pub use gen::*;

// Custom serialization implementations
pub mod serialize;

// Delta computation
pub mod delta;

// Sync coordinator
pub mod sync;
