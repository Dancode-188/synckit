//! SyncKit Core - High-performance sync engine
//!
//! This is the Rust core of SyncKit, compiled to both native and WASM.
//! It implements:
//! - Document structure with field-level LWW
//! - Vector clocks for causality tracking
//! - CRDT data structures (OR-Set, PN-Counter, Text)
//! - Binary protocol encoding/decoding (when prost feature enabled)
//!
//! # Examples
//!
//! ```rust
//! use synckit_core::{Document, ClientID, VectorClock};
//!
//! let mut doc = Document::new("doc-123".to_string());
//! doc.set_field(
//!     "title".to_string(),
//!     serde_json::json!("Hello World"),
//!     1,
//!     "client-1".to_string()
//! );
//! ```

// Use wee_alloc when building for WASM with core-lite feature (size optimization)
#[cfg(all(target_arch = "wasm32", feature = "wee_alloc"))]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

pub mod awareness;
pub mod document;
pub mod error;
pub mod storage;
pub mod sync;

// Protocol module only included if prost feature is enabled
#[cfg(feature = "prost")]
pub mod protocol;

// CRDTs are feature-gated (only compile if needed)
#[cfg(any(
    feature = "text-crdt",
    feature = "counters",
    feature = "sets",
    feature = "fractional-index"
))]
pub mod crdt;

#[cfg(feature = "wasm")]
pub mod wasm;

// Re-exports for convenience
pub use awareness::{Awareness, AwarenessState, AwarenessUpdate};
pub use document::Document;
pub use error::{Result, SyncError};
pub use sync::{Timestamp, VectorClock};

/// Client identifier type
pub type ClientID = String;

/// Document identifier type  
pub type DocumentID = String;

/// Field path within a document
pub type FieldPath = String;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_import() {
        // Smoke test that modules compile
        let _client_id: ClientID = "test-client".to_string();
    }
}
