//! SyncKit Core - High-performance sync engine
//!
//! This is the Rust core of SyncKit, compiled to both native and WASM.
//! It implements:
//! - Document structure with field-level LWW
//! - Vector clocks for causality tracking
//! - CRDT data structures (OR-Set, PN-Counter, Text)
//! - Binary protocol encoding/decoding
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

pub mod document;
pub mod sync;
pub mod crdt;
pub mod protocol;
pub mod storage;
pub mod error;

// Re-exports for convenience
pub use document::Document;
pub use sync::{VectorClock, Timestamp};
pub use error::{SyncError, Result};

/// Client identifier type
pub type ClientID = String;

/// Document identifier type  
pub type DocumentID = String;

/// Field path within a document
pub type FieldPath = String;

#[cfg(feature = "wasm")]
pub mod wasm;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_import() {
        // Smoke test that modules compile
        let _client_id: ClientID = "test-client".to_string();
    }
}
