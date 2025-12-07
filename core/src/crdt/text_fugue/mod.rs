//! Fugue Text CRDT: Collaborative text editing with maximal non-interleaving
//!
//! This module implements the Fugue algorithm for collaborative text editing,
//! which provides mathematically proven maximal non-interleaving properties.
//!
//! # Features
//! - **Maximal non-interleaving**: Superior to YATA/RGA algorithms
//! - **Run-length encoding (RLE)**: Efficient memory usage (5-10x reduction)
//! - **Rope-based storage**: O(log n) insertions/deletions via ropey crate
//! - **Grapheme-aware**: Proper Unicode handling (no mid-emoji splits)
//! - **Deterministic**: Concurrent operations always converge to same state
//!
//! # Algorithm
//!
//! Fugue uses a two-phase resolution system:
//! 1. **Left origin**: Resolves forward conflicts
//! 2. **Right origin**: Resolves backward conflicts
//!
//! This two-phase approach eliminates interleaving anomalies that plague
//! simpler algorithms like RGA and YATA.
//!
//! # Architecture
//!
//! The implementation uses a hybrid architecture:
//! - **Rope**: Efficient text storage (ropey crate)
//! - **BTreeMap**: CRDT metadata maintaining Fugue ordering
//! - **RLE**: Consecutive chars from same operation stored in single block
//!
//! # Example
//!
//! ```rust
//! use synckit_core::crdt::text_fugue::FugueText;
//!
//! let mut text1 = FugueText::new("client1".to_string());
//! let mut text2 = FugueText::new("client2".to_string());
//!
//! // Concurrent inserts at same position
//! text1.insert(0, "Hello").unwrap();
//! text2.insert(0, "World").unwrap();
//!
//! // Merge
//! text1.merge(&text2).unwrap();
//! text2.merge(&text1).unwrap();
//!
//! // Both replicas converge to same result
//! assert_eq!(text1.to_string(), text2.to_string());
//! ```
//!
//! # References
//!
//! - **Paper**: "Fugue: A CRDT for Collaborative Text Editing" (arXiv:2305.00583)
//! - **Loro CRDT**: Production implementation using Fugue

mod block;
mod node;
mod text;

pub use block::FugueBlock;
pub use node::NodeId;
pub use text::{FugueText, LamportClock, TextError};
