//! FugueBlock: Text block with CRDT metadata
//!
//! FugueBlock is the core data structure that combines text content with
//! Fugue CRDT metadata. Each block represents a contiguous sequence of
//! characters inserted in a single operation (Run-Length Encoding).

use super::node::NodeId;
use serde::{Deserialize, Serialize};

#[cfg(feature = "text-crdt")]
use unicode_segmentation::UnicodeSegmentation;

/// A block of text with Fugue CRDT metadata
///
/// FugueBlock implements Run-Length Encoding (RLE) by storing multiple
/// characters from the same insert operation in a single block. This provides
/// a 5-10x memory reduction compared to storing each character separately.
///
/// # Architecture
///
/// Each block contains:
/// - **text**: The actual characters (multiple chars via RLE)
/// - **id**: Unique identifier for this block
/// - **left_origin/right_origin**: Fugue's two-phase conflict resolution
/// - **deleted**: Tombstone flag (blocks are never removed, only marked deleted)
/// - **rope_start**: Cached position in rope (invalidated on edits)
///
/// # Memory Layout
///
/// With RLE (10 chars/block typical):
/// - NodeId: ~24 bytes
/// - String: ~30 bytes (10 chars + overhead)
/// - Origins: ~48 bytes (2 × Option<NodeId>)
/// - Flags + cache: ~9 bytes
/// - **Total: ~135 bytes/block = ~13.5 bytes/char**
///
/// Without RLE (1 char/block):
/// - **Total: ~61 bytes/char** (4.5x worse!)
///
/// # Example
///
/// ```rust
/// use synckit_core::crdt::text_fugue::{FugueBlock, NodeId};
///
/// let id = NodeId::new("client1".to_string(), 1, 0);
/// let block = FugueBlock::new(
///     id,
///     "Hello".to_string(),
///     None,  // No left origin (insert at start)
///     None,  // No right origin
/// );
///
/// assert_eq!(block.len(), 5);  // 5 graphemes
/// assert_eq!(block.is_deleted(), false);
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct FugueBlock {
    /// Unique identifier for this block
    pub id: NodeId,

    /// Text content (RLE: multiple characters, NOT single char!)
    ///
    /// This is the core of Run-Length Encoding. Instead of storing each
    /// character in a separate block, we store all characters from the same
    /// insert operation in one block.
    pub text: String,

    /// Left origin (Fugue's left parent pointer)
    ///
    /// Points to the block that this was inserted after. None means insert
    /// at the beginning of the document.
    pub left_origin: Option<NodeId>,

    /// Right origin (Fugue's right parent pointer)
    ///
    /// This is the key difference from YATA/RGA! The right origin enables
    /// Fugue's maximal non-interleaving property.
    pub right_origin: Option<NodeId>,

    /// Tombstone flag - deleted blocks are marked, not removed
    ///
    /// This is critical for correct merging. If we removed deleted blocks,
    /// replicas couldn't properly merge concurrent operations.
    pub deleted: bool,

    /// Cached rope position (private, invalidated on any edit)
    ///
    /// This cache helps avoid recomputing rope position on every access.
    /// Set to usize::MAX when invalid.
    #[serde(skip)]
    rope_start: usize,

    /// Cached grapheme start position (Phase 1.5 optimization)
    ///
    /// This stores the cumulative grapheme position where this block starts
    /// in the document. Enables O(log n) binary search in find_origins().
    /// Set to usize::MAX when invalid (cache invalidated on any edit).
    ///
    /// **Performance Impact:**
    /// - Without cache: O(n) linear scan → O(n²) for n sequential ops
    /// - With cache: O(log n) binary search → O(n log n) for n sequential ops
    /// - Expected: 260K ops from ~40 min → <500ms (4,800x faster!)
    #[serde(skip)]
    cached_start_pos: usize,
}

impl Default for FugueBlock {
    fn default() -> Self {
        Self {
            id: NodeId::new(String::new(), 0, 0),
            text: String::new(),
            left_origin: None,
            right_origin: None,
            deleted: false,
            rope_start: usize::MAX,       // Invalid until computed
            cached_start_pos: usize::MAX, // Invalid until computed
        }
    }
}

impl FugueBlock {
    /// Create a new FugueBlock
    ///
    /// # Arguments
    ///
    /// * `id` - Unique NodeId for this block
    /// * `text` - Text content (can be multiple characters via RLE)
    /// * `left_origin` - Block inserted after (None = start of document)
    /// * `right_origin` - Block inserted before (None = end of document)
    ///
    /// # Example
    ///
    /// ```rust
    /// use synckit_core::crdt::text_fugue::{FugueBlock, NodeId};
    ///
    /// let id = NodeId::new("client1".to_string(), 1, 0);
    /// let block = FugueBlock::new(id, "Hi".to_string(), None, None);
    /// ```
    pub fn new(
        id: NodeId,
        text: String,
        left_origin: Option<NodeId>,
        right_origin: Option<NodeId>,
    ) -> Self {
        Self {
            id,
            text,
            left_origin,
            right_origin,
            deleted: false,
            rope_start: usize::MAX,       // Invalid until computed
            cached_start_pos: usize::MAX, // Invalid until computed
        }
    }

    /// Check if this block is deleted (tombstone)
    ///
    /// Deleted blocks remain in the BTreeMap for correct merging but don't
    /// contribute to the visible text.
    pub fn is_deleted(&self) -> bool {
        self.deleted
    }

    /// Mark this block as deleted (tombstone)
    ///
    /// Blocks are never actually removed from the BTreeMap, only marked
    /// as deleted. This ensures correct merging of concurrent operations.
    pub fn mark_deleted(&mut self) {
        self.deleted = true;
    }

    /// Get the number of grapheme clusters in this block
    ///
    /// Uses Unicode segmentation to count user-perceived characters, not
    /// code points. For example, "👨‍👩‍👧‍👦" counts as 1 grapheme, not 7 code points.
    ///
    /// # Example
    ///
    /// ```rust
    /// use synckit_core::crdt::text_fugue::{FugueBlock, NodeId};
    ///
    /// let id = NodeId::new("client1".to_string(), 1, 0);
    /// let block = FugueBlock::new(id, "Hello 👋".to_string(), None, None);
    ///
    /// assert_eq!(block.len(), 7);  // "H" "e" "l" "l" "o" " " "👋"
    /// ```
    #[cfg(feature = "text-crdt")]
    pub fn len(&self) -> usize {
        self.text.graphemes(true).count()
    }

    /// Get the number of grapheme clusters (fallback without unicode-segmentation)
    #[cfg(not(feature = "text-crdt"))]
    pub fn len(&self) -> usize {
        self.text.chars().count()
    }

    /// Get the number of UTF-8 bytes in this block
    ///
    /// This is used for rope operations, which work with byte positions.
    ///
    /// # Example
    ///
    /// ```rust
    /// use synckit_core::crdt::text_fugue::{FugueBlock, NodeId};
    ///
    /// let id = NodeId::new("client1".to_string(), 1, 0);
    /// let block = FugueBlock::new(id, "Hello 👋".to_string(), None, None);
    ///
    /// assert_eq!(block.byte_len(), 10);  // "Hello " = 6 bytes, "👋" = 4 bytes
    /// ```
    pub fn byte_len(&self) -> usize {
        self.text.len()
    }

    /// Check if this block is empty
    pub fn is_empty(&self) -> bool {
        self.text.is_empty()
    }

    /// Get the cached rope position (private, for internal use)
    ///
    /// Returns None if cache is invalid (usize::MAX).
    #[inline]
    pub(crate) fn rope_position(&self) -> Option<usize> {
        if self.rope_start == usize::MAX {
            None
        } else {
            Some(self.rope_start)
        }
    }

    /// Set the cached rope position (private, for internal use)
    #[inline]
    #[allow(dead_code)]
    pub(crate) fn set_rope_position(&mut self, pos: usize) {
        self.rope_start = pos;
    }

    /// Invalidate the cached rope position (private, for internal use)
    #[inline]
    pub(crate) fn invalidate_rope_position(&mut self) {
        self.rope_start = usize::MAX;
    }

    /// Get the cached grapheme start position (Phase 1.5 optimization)
    ///
    /// Returns None if cache is invalid (usize::MAX).
    #[inline]
    pub(crate) fn cached_position(&self) -> Option<usize> {
        if self.cached_start_pos == usize::MAX {
            None
        } else {
            Some(self.cached_start_pos)
        }
    }

    /// Set the cached grapheme start position (Phase 1.5 optimization)
    #[inline]
    pub(crate) fn set_cached_position(&mut self, pos: usize) {
        self.cached_start_pos = pos;
    }

    /// Invalidate the cached grapheme start position (Phase 1.5 optimization)
    #[inline]
    #[allow(dead_code)]
    pub(crate) fn invalidate_cached_position(&mut self) {
        self.cached_start_pos = usize::MAX;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_block() {
        let id = NodeId::new("client1".to_string(), 1, 0);
        let block = FugueBlock::new(id.clone(), "Hello".to_string(), None, None);

        assert_eq!(block.id, id);
        assert_eq!(block.text, "Hello");
        assert_eq!(block.left_origin, None);
        assert_eq!(block.right_origin, None);
        assert!(!block.is_deleted());
    }

    #[test]
    fn test_mark_deleted() {
        let id = NodeId::new("client1".to_string(), 1, 0);
        let mut block = FugueBlock::new(id, "test".to_string(), None, None);

        assert!(!block.is_deleted());

        block.mark_deleted();

        assert!(block.is_deleted());
    }

    #[test]
    #[cfg(feature = "text-crdt")]
    fn test_len_graphemes() {
        let id = NodeId::new("client1".to_string(), 1, 0);

        // ASCII text
        let block = FugueBlock::new(id.clone(), "Hello".to_string(), None, None);
        assert_eq!(block.len(), 5);

        // Emoji (single grapheme cluster)
        let block = FugueBlock::new(id.clone(), "👋".to_string(), None, None);
        assert_eq!(block.len(), 1);

        // Family emoji (single grapheme cluster made of multiple code points)
        let block = FugueBlock::new(id.clone(), "👨‍👩‍👧‍👦".to_string(), None, None);
        assert_eq!(block.len(), 1);

        // Mixed content
        let block = FugueBlock::new(id, "Hello 👋 World".to_string(), None, None);
        assert_eq!(block.len(), 13); // 5 + 1 (space) + 1 (emoji) + 1 (space) + 5
    }

    #[test]
    fn test_byte_len() {
        let id = NodeId::new("client1".to_string(), 1, 0);

        // ASCII: 1 byte per char
        let block = FugueBlock::new(id.clone(), "Hello".to_string(), None, None);
        assert_eq!(block.byte_len(), 5);

        // Emoji: 4 bytes
        let block = FugueBlock::new(id, "👋".to_string(), None, None);
        assert_eq!(block.byte_len(), 4);
    }

    #[test]
    fn test_is_empty() {
        let id = NodeId::new("client1".to_string(), 1, 0);

        let block = FugueBlock::new(id.clone(), "".to_string(), None, None);
        assert!(block.is_empty());

        let block = FugueBlock::new(id, "test".to_string(), None, None);
        assert!(!block.is_empty());
    }

    #[test]
    fn test_rope_position_cache() {
        let id = NodeId::new("client1".to_string(), 1, 0);
        let mut block = FugueBlock::new(id, "test".to_string(), None, None);

        // Initially invalid
        assert_eq!(block.rope_position(), None);

        // Set position
        block.set_rope_position(42);
        assert_eq!(block.rope_position(), Some(42));

        // Invalidate
        block.invalidate_rope_position();
        assert_eq!(block.rope_position(), None);
    }

    #[test]
    fn test_serialization() {
        let id = NodeId::new("client1".to_string(), 1, 0);
        let left = Some(NodeId::new("client1".to_string(), 0, 0));
        let mut block = FugueBlock::new(id, "test".to_string(), left, None);

        // Set rope position before serialization
        block.set_rope_position(42);

        let json = serde_json::to_string(&block).unwrap();
        let deserialized: FugueBlock = serde_json::from_str(&json).unwrap();

        assert_eq!(block.id, deserialized.id);
        assert_eq!(block.text, deserialized.text);
        assert_eq!(block.left_origin, deserialized.left_origin);
        assert_eq!(block.right_origin, deserialized.right_origin);
        assert_eq!(block.deleted, deserialized.deleted);

        // rope_start is skipped in serialization, so should be None after deserialize
        assert_eq!(deserialized.rope_position(), None);
    }
}
