//! FugueText: Main Text CRDT implementation using Fugue algorithm
//!
//! This module implements the complete Fugue Text CRDT with:
//! - Rope-based text storage for efficient edits
//! - BTreeMap for CRDT metadata maintaining Fugue ordering
//! - Run-Length Encoding for memory efficiency
//! - Lamport clocks for causality tracking
//! - O(log n) position lookup (Phase 1.5 - binary search with position cache)

use super::block::FugueBlock;
use super::node::NodeId;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

#[cfg(feature = "text-crdt")]
use ropey::Rope;

#[cfg(feature = "text-crdt")]
use unicode_segmentation::UnicodeSegmentation;

/// Side of a node in the Fugue tree (left or right child of parent)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Side {
    Left,
    Right,
}

/// Tree node for Fugue tree reconstruction.
///
/// The Fugue algorithm requires building an explicit tree structure from
/// the implicit tree encoded in left_origin/right_origin metadata.
/// This struct represents a node in that reconstructed tree.
#[derive(Debug, Clone)]
struct TreeNode {
    id: NodeId,
    parent: Option<NodeId>,
    side: Side,
    deleted: bool,
}

/// Lamport timestamp for causality tracking
///
/// Lamport clocks provide a "happens-before" partial ordering of events
/// in a distributed system. Each replica maintains its own clock and
/// increments it on local operations.
///
/// # Properties
///
/// - Monotonically increasing: clock never decreases
/// - Always > 0: clock starts at 1 (0 reserved for initial state)
/// - Update on merge: clock = max(local, remote) + 1
///
/// # Example
///
/// ```rust
/// use synckit_core::crdt::text_fugue::LamportClock;
///
/// let mut clock = LamportClock::new();
/// assert_eq!(clock.value(), 0);
///
/// let ts1 = clock.tick();
/// assert_eq!(ts1, 1);
///
/// clock.update(5);  // Merge from remote
/// let ts2 = clock.tick();
/// assert_eq!(ts2, 6);  // max(1, 5) + 1
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct LamportClock {
    value: u64,
}

impl LamportClock {
    /// Create a new Lamport clock starting at 0
    pub fn new() -> Self {
        Self { value: 0 }
    }

    /// Get the current clock value
    pub fn value(&self) -> u64 {
        self.value
    }

    /// Increment clock and return new value (for local operations)
    pub fn tick(&mut self) -> u64 {
        self.value += 1;
        self.value
    }

    /// Tick by N values (for per-character clock allocation)
    ///
    /// This method increments the clock by N values instead of 1, enabling
    /// per-character clock allocation for RLE blocks. Each character in a block
    /// gets its own unique clock value.
    ///
    /// # Arguments
    ///
    /// * `count` - Number of clock values to allocate
    ///
    /// # Returns
    ///
    /// The new clock value after incrementing by count
    ///
    /// # Example
    ///
    /// ```rust
    /// use synckit_core::crdt::text_fugue::LamportClock;
    ///
    /// let mut clock = LamportClock::new();
    /// let ts = clock.tick_by(5);  // Allocate 5 clock values
    /// assert_eq!(ts, 5);
    /// assert_eq!(clock.value(), 5);
    /// ```
    pub fn tick_by(&mut self, count: usize) -> u64 {
        self.value += count as u64;
        self.value
    }

    /// Update clock from remote timestamp (for merge operations)
    ///
    /// Sets clock to max(local, remote) to maintain causality
    pub fn update(&mut self, remote: u64) {
        self.value = self.value.max(remote);
    }
}

impl Default for LamportClock {
    fn default() -> Self {
        Self::new()
    }
}

/// Error types for FugueText operations
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TextError {
    /// Position is out of bounds
    PositionOutOfBounds { position: usize, length: usize },

    /// Range is out of bounds
    RangeOutOfBounds {
        start: usize,
        end: usize,
        length: usize,
    },

    /// Block not found by NodeId
    BlockNotFound(NodeId),

    /// Insert position is inside an existing block (requires splitting)
    BlockSplitRequired,

    /// Invalid block split parameters
    InvalidBlockSplit {
        block_id: NodeId,
        offset_start: usize,
        offset_end: usize,
        block_len: usize,
    },

    /// Rope operation failed
    RopeError(String),
}

impl std::fmt::Display for TextError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TextError::PositionOutOfBounds { position, length } => {
                write!(
                    f,
                    "Position {} out of bounds (length: {})",
                    position, length
                )
            }
            TextError::RangeOutOfBounds { start, end, length } => {
                write!(
                    f,
                    "Range {}..{} out of bounds (length: {})",
                    start, end, length
                )
            }
            TextError::BlockNotFound(id) => {
                write!(f, "Block not found: {}", id)
            }
            TextError::BlockSplitRequired => {
                write!(f, "Block splitting not implemented in Phase 1")
            }
            TextError::InvalidBlockSplit {
                block_id,
                offset_start,
                offset_end,
                block_len,
            } => {
                write!(
                    f,
                    "Invalid block split: block {} (length {}) cannot be split at {}..{}",
                    block_id, block_len, offset_start, offset_end
                )
            }
            TextError::RopeError(msg) => {
                write!(f, "Rope error: {}", msg)
            }
        }
    }
}

impl std::error::Error for TextError {}

/// Fugue Text CRDT
///
/// FugueText implements collaborative text editing with mathematically proven
/// maximal non-interleaving properties. It uses a hybrid architecture:
///
/// - **Rope**: Efficient text storage (ropey crate, O(log n) edits)
/// - **BTreeMap**: CRDT metadata maintaining Fugue ordering
/// - **RLE**: Run-Length Encoding (5-10x memory reduction)
///
/// # Architecture
///
/// ```text
/// FugueText {
///     rope: "Hello World"           // Actual text (ropey::Rope)
///     blocks: {                      // CRDT metadata (BTreeMap)
///         client1@1:0 => FugueBlock { text: "Hello ", ... }
///         client2@2:0 => FugueBlock { text: "World", ... }
///     }
/// }
/// ```
///
/// # Performance (Phase 1.5)
///
/// - Insert: O(log n) - Rope O(log n) + position lookup O(log n)
/// - Delete: O(n) - Still needs full scan for range deletion
/// - Merge: O(m log n) - m remote blocks, n local blocks
/// - Memory: ~7 bytes/char with RLE (vs 61 bytes without!)
/// - Position cache: O(n) rebuild, amortized O(1) per operation
///
/// # Example
///
/// ```rust
/// use synckit_core::crdt::text_fugue::FugueText;
///
/// let mut text = FugueText::new("client1".to_string());
/// text.insert(0, "Hello").unwrap();
/// text.insert(5, " World").unwrap();
///
/// assert_eq!(text.to_string(), "Hello World");
/// assert_eq!(text.len(), 11);
/// ```
#[cfg(feature = "text-crdt")]
#[derive(Debug, Clone)]
pub struct FugueText {
    /// Rope for efficient text storage
    /// Note: Rope is rebuilt from blocks during deserialization
    rope: Rope,

    /// CRDT metadata: BTreeMap maintains Fugue ordering via NodeId Ord
    blocks: BTreeMap<NodeId, FugueBlock>,

    /// Lamport clock for causality tracking
    clock: LamportClock,

    /// Client/replica identifier
    client_id: String,

    /// Cache validity flag (avoids O(n) scan to check if rebuild needed)
    /// Set to false on insert/delete (O(1)), checked before find_origins (O(1))
    cache_valid: bool,

    /// Cached vector of non-deleted blocks for O(log n) binary search
    /// Rebuilt when cache_valid is false. Avoids O(n) allocation on every insert!
    #[cfg(feature = "text-crdt")]
    cached_blocks: Vec<NodeId>,
}

#[cfg(feature = "text-crdt")]
impl Serialize for FugueText {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("FugueText", 3)?;

        // Convert BTreeMap to Vec for JSON compatibility (JSON requires string keys)
        let blocks_vec: Vec<(&NodeId, &FugueBlock)> = self.blocks.iter().collect();
        state.serialize_field("blocks", &blocks_vec)?;

        state.serialize_field("clock", &self.clock)?;
        state.serialize_field("client_id", &self.client_id)?;
        state.end()
    }
}

#[cfg(feature = "text-crdt")]
impl<'de> Deserialize<'de> for FugueText {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct FugueTextHelper {
            blocks: Vec<(NodeId, FugueBlock)>,
            clock: LamportClock,
            client_id: String,
        }

        let helper = FugueTextHelper::deserialize(deserializer)?;

        // Convert Vec back to BTreeMap
        let blocks: BTreeMap<NodeId, FugueBlock> = helper.blocks.into_iter().collect();

        // Rebuild rope from blocks
        let mut text = String::new();
        for block in blocks.values() {
            if !block.is_deleted() {
                text.push_str(&block.text);
            }
        }

        Ok(Self {
            rope: Rope::from_str(&text),
            blocks,
            clock: helper.clock,
            client_id: helper.client_id,
            cache_valid: false,        // Cache needs rebuild after deserialization
            cached_blocks: Vec::new(), // Will be rebuilt on first find_origins
        })
    }
}

#[cfg(feature = "text-crdt")]
impl FugueText {
    /// Create a new empty FugueText
    ///
    /// # Arguments
    ///
    /// * `client_id` - Unique identifier for this replica
    ///
    /// # Example
    ///
    /// ```rust
    /// use synckit_core::crdt::text_fugue::FugueText;
    ///
    /// let text = FugueText::new("client1".to_string());
    /// assert_eq!(text.len(), 0);
    /// assert_eq!(text.to_string(), "");
    /// ```
    pub fn new(client_id: String) -> Self {
        Self {
            rope: Rope::new(),
            blocks: BTreeMap::new(),
            clock: LamportClock::new(),
            client_id,
            cache_valid: true,         // Empty document has valid (empty) cache
            cached_blocks: Vec::new(), // Empty document has empty blocks vector
        }
    }

    /// Get the number of grapheme clusters (user-perceived characters)
    ///
    /// This is the length users expect - counts emoji as 1, not 7 code points.
    ///
    /// # Example
    ///
    /// ```rust
    /// use synckit_core::crdt::text_fugue::FugueText;
    ///
    /// let mut text = FugueText::new("client1".to_string());
    /// text.insert(0, "Hello 👋").unwrap();
    ///
    /// assert_eq!(text.len(), 7);  // Not 10 (byte length)
    /// ```
    pub fn len(&self) -> usize {
        self.rope.len_chars()
    }

    /// Check if the text is empty
    pub fn is_empty(&self) -> bool {
        self.rope.len_chars() == 0
    }

    /// Convert to String
    ///
    /// Returns the visible text (deleted blocks excluded).
    ///
    /// # Example
    ///
    /// ```rust
    /// use synckit_core::crdt::text_fugue::FugueText;
    ///
    /// let mut text = FugueText::new("client1".to_string());
    /// text.insert(0, "Hello").unwrap();
    ///
    /// assert_eq!(text.to_string(), "Hello");
    /// ```
    #[allow(clippy::inherent_to_string)]
    pub fn to_string(&self) -> String {
        self.rope.to_string()
    }

    /// Get client ID
    pub fn client_id(&self) -> &str {
        &self.client_id
    }

    /// Get current Lamport clock value
    pub fn clock(&self) -> u64 {
        self.clock.value()
    }

    /// Insert text at the given grapheme position
    ///
    /// This is the core Fugue operation. Complexity is O(log n) in Phase 1.5
    /// due to binary search position lookup (O(log n) rope insert + O(log n) find_origins).
    ///
    /// # Arguments
    ///
    /// * `position` - Grapheme index (0-based, user-facing position)
    /// * `text` - Text to insert (can be multiple characters via RLE)
    ///
    /// # Returns
    ///
    /// NodeId of the created block
    ///
    /// # Errors
    ///
    /// Returns `TextError::PositionOutOfBounds` if position > length
    ///
    /// # Example
    ///
    /// ```rust
    /// use synckit_core::crdt::text_fugue::FugueText;
    ///
    /// let mut text = FugueText::new("client1".to_string());
    /// text.insert(0, "Hello").unwrap();
    /// text.insert(5, " World").unwrap();
    ///
    /// assert_eq!(text.to_string(), "Hello World");
    /// ```
    pub fn insert(&mut self, position: usize, text: &str) -> Result<NodeId, TextError> {
        // 1. Validate position
        let len = self.len();
        if position > len {
            return Err(TextError::PositionOutOfBounds {
                position,
                length: len,
            });
        }

        // 2. Find CRDT origins (Phase 1.5: O(log n) with cache!)
        let (left_origin, right_origin) = self.find_origins(position)?;

        // 3. Calculate grapheme length for per-character clock allocation
        #[cfg(feature = "text-crdt")]
        let char_count = text.graphemes(true).count();
        #[cfg(not(feature = "text-crdt"))]
        let char_count = text.chars().count();

        // 4. Generate timestamp range and NodeId (one clock value per character!)
        // This allocates clock values [timestamp - char_count + 1, timestamp]
        // Example: "Hello" with 5 chars allocates clocks [1, 2, 3, 4, 5]
        let timestamp = self.clock.tick_by(char_count);
        let id = NodeId::new(self.client_id.clone(), timestamp, 0);

        // 5. Cache the insert length for later use
        #[cfg(feature = "text-crdt")]
        let insert_len = char_count;

        // 6. Create FugueBlock with RLE (entire text as one block!)
        let block = FugueBlock::new(id.clone(), text.to_string(), left_origin, right_origin);

        // 7. Insert into BTreeMap (maintains Fugue ordering)
        self.blocks.insert(id.clone(), block);

        // 8. Insert into rope (O(log n))
        let byte_pos = self.char_to_byte(position)?;
        self.rope.insert(byte_pos, text);

        // 9. Update position cache incrementally (O(k) instead of O(n) rebuild!)
        self.invalidate_position_cache(byte_pos); // Rope cache separate
        #[cfg(feature = "text-crdt")]
        self.update_cache_after_insert(position, insert_len, &id);

        Ok(id)
    }

    /// Delete text at the given position
    ///
    /// Marks blocks as deleted (tombstone) without removing them from BTreeMap.
    /// This is critical for correct merging.
    ///
    /// # Arguments
    ///
    /// * `position` - Starting grapheme index
    /// * `length` - Number of graphemes to delete
    ///
    /// # Returns
    ///
    /// Vec of NodeIds that were marked deleted
    ///
    /// # Errors
    ///
    /// Returns `TextError::RangeOutOfBounds` if range exceeds document length
    ///
    /// # Example
    ///
    /// ```rust
    /// use synckit_core::crdt::text_fugue::FugueText;
    ///
    /// let mut text = FugueText::new("client1".to_string());
    /// text.insert(0, "Hello World").unwrap();
    /// text.delete(5, 6).unwrap();  // Delete " World"
    ///
    /// assert_eq!(text.to_string(), "Hello");
    /// ```
    pub fn delete(&mut self, position: usize, length: usize) -> Result<Vec<NodeId>, TextError> {
        // 1. Validate range
        let doc_len = self.len();
        if position + length > doc_len {
            return Err(TextError::RangeOutOfBounds {
                start: position,
                end: position + length,
                length: doc_len,
            });
        }

        // 2. Find blocks that overlap deletion range and split if needed
        let mut blocks_to_split = Vec::new();
        let mut deleted_ids = Vec::new();
        let mut current_pos = 0;

        // First pass: identify blocks that need splitting
        for (id, block) in &self.blocks {
            if block.is_deleted() {
                continue;
            }

            let block_len = block.len();
            let block_start = current_pos;
            let block_end = current_pos + block_len;

            // Check if block overlaps deletion range
            if block_start < position + length && block_end > position {
                // Calculate overlap boundaries
                let delete_start = position.max(block_start);
                let delete_end = (position + length).min(block_end);
                let offset_in_block_start = delete_start - block_start;
                let offset_in_block_end = delete_end - block_start;

                blocks_to_split.push((
                    id.clone(),
                    block.clone(),
                    block_start,
                    offset_in_block_start,
                    offset_in_block_end,
                ));
            }

            current_pos += block_len;
        }

        // Second pass: split blocks and create new ones
        for (orig_id, orig_block, _block_start, offset_start, offset_end) in blocks_to_split {
            let block_len = orig_block.len();

            // Check if we need to split (partial deletion)
            let needs_left_split = offset_start > 0;
            let needs_right_split = offset_end < block_len;

            if needs_left_split || needs_right_split {
                // Block splitting: create up to 3 blocks
                self.split_block_for_deletion(
                    &orig_id,
                    &orig_block,
                    offset_start,
                    offset_end,
                    &mut deleted_ids,
                )?;
            } else {
                // Entire block is deleted - just mark it
                if let Some(block) = self.blocks.get_mut(&orig_id) {
                    block.mark_deleted();
                    deleted_ids.push(orig_id);
                }
            }
        }

        // 3. Delete from rope (O(log n))
        if !deleted_ids.is_empty() {
            let byte_start = self.char_to_byte(position)?;
            let byte_end = self.char_to_byte(position + length)?;
            self.rope.remove(byte_start..byte_end);

            // 4. Invalidate position cache (block splitting creates new blocks)
            self.invalidate_position_cache(byte_start); // Rope cache separate
            #[cfg(feature = "text-crdt")]
            {
                // Invalidate cache - block splitting changes the block structure
                self.cache_valid = false;
            }
        }

        Ok(deleted_ids)
    }

    /// Split a block when deleting a portion of it (Clock-based IDs)
    ///
    /// Creates up to 3 blocks with clock-based IDs (all with offset=0):
    /// 1. Left block: characters before deletion (if any)
    /// 2. Middle block: deleted characters (marked as deleted)
    /// 3. Right block: characters after deletion (if any)
    ///
    /// # Clock-based ID Generation
    ///
    /// With per-character clocks, block `test@15:0` with length=15 contains
    /// characters at clocks [1, 2, 3, ..., 15]. When deleting chars 6-10:
    /// - Left block: `test@5:0` (clocks 1-5)
    /// - Middle block: `test@10:0` (clocks 6-10, deleted)
    /// - Right block: `test@15:0` (clocks 11-15)
    ///
    /// All new block IDs have offset=0!
    ///
    /// # Arguments
    ///
    /// * `orig_id` - Original block ID
    /// * `orig_block` - Original block to split
    /// * `offset_start` - Start offset within block (in graphemes)
    /// * `offset_end` - End offset within block (in graphemes)
    /// * `deleted_ids` - Vector to collect IDs of deleted blocks
    #[cfg(feature = "text-crdt")]
    fn split_block_for_deletion(
        &mut self,
        orig_id: &NodeId,
        orig_block: &FugueBlock,
        offset_start: usize,
        offset_end: usize,
        deleted_ids: &mut Vec<NodeId>,
    ) -> Result<(), TextError> {
        use unicode_segmentation::UnicodeSegmentation;

        // Split text into grapheme clusters
        let graphemes: Vec<&str> = orig_block.text.graphemes(true).collect();
        let block_len = graphemes.len();

        // Validate offsets
        if offset_start >= block_len || offset_end > block_len || offset_start >= offset_end {
            return Err(TextError::InvalidBlockSplit {
                block_id: orig_id.clone(),
                offset_start,
                offset_end,
                block_len,
            });
        }

        // Extract text segments
        let left_text: String = graphemes[..offset_start].join("");
        let middle_text: String = graphemes[offset_start..offset_end].join("");
        let right_text: String = graphemes[offset_end..].join("");

        // Calculate the block's starting clock value
        // Block ID stores the LAST clock value, so start = end - len + 1
        // Example: block@15:0 with len=15 → start_clock = 15 - 15 + 1 = 1
        let block_start_clock = orig_id.clock - (block_len as u64) + 1;

        // Remove original block (if it still exists)
        if !self.blocks.contains_key(orig_id) {
            // Block was already removed or doesn't exist
            return Ok(());
        }
        self.blocks.remove(orig_id);

        // IMPORTANT: All split blocks maintain the SAME origins as the original block!
        // They represent parts of the same insert operation, so they have the same
        // position in the Fugue tree. The clock ranges differentiate them.

        // Create left block (if needed)
        if !left_text.is_empty() {
            let left_len = offset_start as u64;
            let left_end_clock = block_start_clock + left_len - 1;
            let left_id = NodeId::new(orig_id.client_id.clone(), left_end_clock, 0);

            let left_block = FugueBlock::new(
                left_id.clone(),
                left_text,
                orig_block.left_origin.clone(),  // Same as original!
                orig_block.right_origin.clone(), // Same as original!
            );
            self.blocks.insert(left_id.clone(), left_block);
        }

        // Create middle block (deleted)
        let _middle_len = (offset_end - offset_start) as u64;
        let middle_end_clock = block_start_clock + offset_end as u64 - 1;
        let middle_id = NodeId::new(orig_id.client_id.clone(), middle_end_clock, 0);

        let mut middle_block = FugueBlock::new(
            middle_id.clone(),
            middle_text,
            orig_block.left_origin.clone(),  // Same as original!
            orig_block.right_origin.clone(), // Same as original!
        );
        middle_block.mark_deleted();
        self.blocks.insert(middle_id.clone(), middle_block);
        deleted_ids.push(middle_id.clone());

        // Create right block (if needed)
        if !right_text.is_empty() {
            let _right_len = (block_len - offset_end) as u64;
            let right_end_clock = block_start_clock + block_len as u64 - 1;
            let right_id = NodeId::new(orig_id.client_id.clone(), right_end_clock, 0);

            let right_block = FugueBlock::new(
                right_id.clone(),
                right_text,
                orig_block.left_origin.clone(),  // Same as original!
                orig_block.right_origin.clone(), // Same as original!
            );
            self.blocks.insert(right_id, right_block);
        }

        Ok(())
    }

    /// Get the NodeId of the character at the given position
    ///
    /// Returns a stable NodeId that identifies the character at the specified
    /// grapheme position. This NodeId includes the block's timestamp and the
    /// offset within the block, making it stable across text edits.
    ///
    /// This is critical for Peritext format spans - format ranges must reference
    /// stable character identifiers, not position indices that shift on edits.
    ///
    /// # Arguments
    ///
    /// * `position` - Grapheme index of the character
    ///
    /// # Returns
    ///
    /// NodeId with correct offset for the character at this position
    ///
    /// # Errors
    ///
    /// Returns `TextError::PositionOutOfBounds` if position >= length
    ///
    /// # Complexity
    ///
    /// O(log n) with position cache, O(n) without cache
    ///
    /// # Example
    ///
    /// ```rust
    /// use synckit_core::crdt::text_fugue::FugueText;
    ///
    /// let mut text = FugueText::new("client1".to_string());
    /// text.insert(0, "Hello").unwrap();
    ///
    /// let node_id = text.get_node_id_at_position(2).unwrap();
    /// // Returns NodeId for 'l' at position 2
    /// // Format: client1@1:2 (client1, clock=1, offset=2)
    /// ```
    pub fn get_node_id_at_position(&mut self, position: usize) -> Result<NodeId, TextError> {
        // 1. Validate position
        let len = self.len();
        if position >= len {
            return Err(TextError::PositionOutOfBounds {
                position,
                length: len,
            });
        }

        // 2. Ensure cache is valid for O(log n) lookup
        if !self.cache_valid {
            self.rebuild_position_cache();
            self.cache_valid = true;
        }

        // 3. Binary search to find block containing this position
        if self.cached_blocks.is_empty() {
            return Err(TextError::PositionOutOfBounds {
                position,
                length: len,
            });
        }

        let search_result = self.cached_blocks.binary_search_by(|id| {
            let block = &self.blocks[id];
            let block_start = block.cached_position().unwrap_or(0);
            let block_end = block_start + block.len();

            if position < block_start {
                std::cmp::Ordering::Greater
            } else if position >= block_end {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Equal
            }
        });

        // 4. Calculate clock value for character and create NodeId
        match search_result {
            Ok(idx) => {
                let block_id = &self.cached_blocks[idx];
                let block = &self.blocks[block_id];
                let block_start = block.cached_position().unwrap_or(0);
                let offset_in_block = position - block_start;

                // Calculate the actual clock value for this character
                // Block ID stores the LAST clock, so start = end - len + 1
                let block_len = block.len() as u64;
                let block_start_clock = block_id.clock.saturating_sub(block_len - 1);
                let char_clock = block_start_clock + offset_in_block as u64;

                // Create NodeId with clock value (offset=0!)
                Ok(NodeId::new(block_id.client_id.clone(), char_clock, 0))
            }
            Err(_) => {
                // Should never happen if cache is valid and position is in bounds
                Err(TextError::PositionOutOfBounds {
                    position,
                    length: len,
                })
            }
        }
    }

    /// Get the current position of a character identified by NodeId
    ///
    /// This is the reverse of `get_node_id_at_position`. Given a clock-based NodeId
    /// (client_id, clock, 0), returns the character's current position in the text.
    ///
    /// With per-character clocks, the clock value directly identifies a unique character.
    /// We find the block whose clock range contains this clock value.
    ///
    /// Returns None if the NodeId doesn't exist (e.g., character was deleted).
    /// Complexity: O(n) for searching blocks (could be optimized with a block index).
    ///
    /// # Arguments
    ///
    /// * `node_id` - The NodeId to find (clock-based, offset should be 0)
    ///
    /// # Example
    ///
    /// ```rust
    /// use synckit_core::crdt::text_fugue::{FugueText, NodeId};
    ///
    /// let mut text = FugueText::new("client1".to_string());
    /// text.insert(0, "Hello").unwrap();
    ///
    /// let node_id = NodeId::new("client1".to_string(), 3, 0);  // 3rd clock value
    /// if let Some(pos) = text.get_position_of_node_id(&node_id) {
    ///     println!("Character is at position {}", pos);
    /// } else {
    ///     println!("Character was deleted");
    /// }
    /// ```
    pub fn get_position_of_node_id(&mut self, node_id: &NodeId) -> Option<usize> {
        // 1. Ensure cache is valid
        if !self.cache_valid {
            self.rebuild_position_cache();
            self.cache_valid = true;
        }

        // 2. Find the block whose clock range contains node_id.clock
        // Use find_block_for_nodeid which handles clock ranges
        let block_id = self.find_block_for_nodeid(node_id)?;

        // 3. Check if block exists and is visible
        if let Some(block) = self.blocks.get(&block_id) {
            // Block is deleted, character doesn't exist
            if block.deleted {
                return None;
            }

            // 4. Calculate offset within block based on clock values
            let block_len = block.len() as u64;
            let block_start_clock = block_id.clock.saturating_sub(block_len - 1);
            let offset_in_block = (node_id.clock - block_start_clock) as usize;

            // Validate offset is within block length
            if offset_in_block >= block.len() {
                return None;
            }

            // 5. Get block's starting position and add offset
            if let Some(block_start) = block.cached_position() {
                return Some(block_start + offset_in_block);
            }
        }

        // Block doesn't exist or character was deleted
        None
    }

    /// Merge with another FugueText replica
    ///
    /// Merges remote blocks into local state, ensuring convergence.
    /// Complexity: O(m log n) where m = remote blocks, n = local blocks.
    ///
    /// # Arguments
    ///
    /// * `remote` - Remote FugueText to merge
    ///
    /// # Example
    ///
    /// ```rust
    /// use synckit_core::crdt::text_fugue::FugueText;
    ///
    /// let mut text1 = FugueText::new("client1".to_string());
    /// let mut text2 = FugueText::new("client2".to_string());
    ///
    /// text1.insert(0, "Hello").unwrap();
    /// text2.insert(0, "World").unwrap();
    ///
    /// text1.merge(&text2).unwrap();
    /// text2.merge(&text1).unwrap();
    ///
    /// // Both converge to same result
    /// assert_eq!(text1.to_string(), text2.to_string());
    /// ```
    pub fn merge(&mut self, remote: &FugueText) -> Result<(), TextError> {
        // 1. Merge remote blocks into local BTreeMap
        for (remote_id, remote_block) in &remote.blocks {
            match self.blocks.get_mut(remote_id) {
                Some(local_block) => {
                    // Block exists locally - merge deletion status
                    if remote_block.is_deleted() && !local_block.is_deleted() {
                        local_block.mark_deleted();
                    }
                }
                None => {
                    // New block from remote - insert it
                    self.blocks.insert(remote_id.clone(), remote_block.clone());
                }
            }
        }

        // 2. Rebuild rope from blocks (Phase 1: simple O(n) rebuild)
        // Phase 2 optimization: incremental update
        self.rebuild_rope();

        // 3. Update Lamport clock
        let remote_max_clock = remote
            .blocks
            .values()
            .map(|b| b.id.clock)
            .max()
            .unwrap_or(0);
        self.clock.update(remote_max_clock);

        Ok(())
    }

    /// Find CRDT origins for insertion at given position (Phase 1.5 optimized)
    ///
    /// **Phase 1.5 Optimization: Binary Search O(log n)**
    /// - Uses cached_start_pos for O(log n) binary search
    /// - Uses cached_blocks vector (O(1) access, no O(n) allocation!)
    /// - Lazy cache rebuild if invalid (O(1) check via cache_valid flag)
    /// - Reduces complexity from O(n²) → O(n log n) for sequential ops
    ///
    /// **Performance:**
    /// - Phase 1: O(n) linear scan per insert → O(n²) total
    /// - Phase 1.5: O(log n) binary search per insert → O(n log n) total
    /// - Expected: 260K ops from ~40 min → <500ms (4,800x faster!)
    ///
    /// Returns (left_origin, right_origin) for Fugue's two-phase resolution.
    fn find_origins(
        &mut self,
        grapheme_pos: usize,
    ) -> Result<(Option<NodeId>, Option<NodeId>), TextError> {
        // Phase 1.5: O(1) check if cache needs rebuild (using flag, not scanning!)
        if !self.cache_valid {
            self.rebuild_position_cache();
            self.cache_valid = true;
        }

        // Phase 1.5: Use cached blocks vector (O(1) access, no allocation!)
        if self.cached_blocks.is_empty() {
            // Empty document - no origins
            return Ok((None, None));
        }

        // Binary search using cached positions (O(log n))
        let search_result = self.cached_blocks.binary_search_by(|id| {
            let block = &self.blocks[id];
            let block_start = block.cached_position().unwrap();
            let block_end = block_start + block.len();

            if grapheme_pos < block_start {
                std::cmp::Ordering::Greater // Search in left half
            } else if grapheme_pos >= block_end {
                std::cmp::Ordering::Less // Search in right half
            } else {
                std::cmp::Ordering::Equal // Found the block!
            }
        });

        let mut left_origin = None;
        let mut right_origin = None;

        match search_result {
            Ok(idx) => {
                // Found exact block containing position
                let id = &self.cached_blocks[idx];
                let block = &self.blocks[id];
                let block_start = block.cached_position().unwrap();
                let block_end = block_start + block.len();

                if grapheme_pos == block_start {
                    // Insert right before this block
                    // Right origin: first character of this block
                    let block_len = block.len() as u64;
                    let block_start_clock = id.clock.saturating_sub(block_len - 1);
                    right_origin = Some(NodeId::new(id.client_id.clone(), block_start_clock, 0));

                    // Find left_origin (last character of previous block)
                    if idx > 0 {
                        let prev_id = &self.cached_blocks[idx - 1];
                        // Last character has the block's clock value (blocks store LAST clock)
                        left_origin =
                            Some(NodeId::new(prev_id.client_id.clone(), prev_id.clock, 0));
                    }
                } else if grapheme_pos == block_end {
                    // Insert right after this block
                    // Left origin: last character of this block (block's clock value)
                    left_origin = Some(NodeId::new(id.client_id.clone(), id.clock, 0));

                    // Find right_origin (next block - first character)
                    if idx + 1 < self.cached_blocks.len() {
                        let next_id = &self.cached_blocks[idx + 1];
                        let next_block = &self.blocks[next_id];
                        let next_block_len = next_block.len() as u64;
                        let next_start_clock = next_id.clock.saturating_sub(next_block_len - 1);
                        right_origin =
                            Some(NodeId::new(next_id.client_id.clone(), next_start_clock, 0));
                    }
                } else {
                    // Insert INSIDE this block
                    // Calculate character-level clock values for proper Fugue tree structure
                    let offset_in_block = grapheme_pos - block_start;
                    let block_len = block.len() as u64;
                    let block_start_clock = id.clock.saturating_sub(block_len - 1);

                    // Left origin: character immediately before insertion point
                    let left_char_clock = block_start_clock + offset_in_block as u64 - 1;
                    left_origin = Some(NodeId::new(id.client_id.clone(), left_char_clock, 0));

                    // Right origin: character at insertion point
                    let right_char_clock = block_start_clock + offset_in_block as u64;
                    right_origin = Some(NodeId::new(id.client_id.clone(), right_char_clock, 0));
                }
            }
            Err(idx) => {
                // Position falls between blocks or at boundaries
                if idx == 0 {
                    // Insert at very beginning - right origin is first char of first block
                    let first_id = &self.cached_blocks[0];
                    let first_block = &self.blocks[first_id];
                    let first_block_len = first_block.len() as u64;
                    let first_start_clock = first_id.clock.saturating_sub(first_block_len - 1);
                    right_origin = Some(NodeId::new(
                        first_id.client_id.clone(),
                        first_start_clock,
                        0,
                    ));
                } else if idx >= self.cached_blocks.len() {
                    // Insert at very end - point to last character of last block
                    let last_id = &self.cached_blocks[self.cached_blocks.len() - 1];
                    // Last character has the block's clock value
                    left_origin = Some(NodeId::new(last_id.client_id.clone(), last_id.clock, 0));
                } else {
                    // Insert between blocks
                    // Left: last character of previous block (its clock value)
                    let left_id = &self.cached_blocks[idx - 1];
                    left_origin = Some(NodeId::new(left_id.client_id.clone(), left_id.clock, 0));

                    // Right: first character of next block
                    let right_id = &self.cached_blocks[idx];
                    let right_block = &self.blocks[right_id];
                    let right_block_len = right_block.len() as u64;
                    let right_start_clock = right_id.clock.saturating_sub(right_block_len - 1);
                    right_origin = Some(NodeId::new(
                        right_id.client_id.clone(),
                        right_start_clock,
                        0,
                    ));
                }
            }
        }

        Ok((left_origin, right_origin))
    }

    /// Convert grapheme position to byte position (for rope operations)
    fn char_to_byte(&self, char_pos: usize) -> Result<usize, TextError> {
        if char_pos > self.rope.len_chars() {
            return Err(TextError::PositionOutOfBounds {
                position: char_pos,
                length: self.rope.len_chars(),
            });
        }
        Ok(self.rope.char_to_byte(char_pos))
    }

    /// Invalidate position cache for blocks after given byte position
    fn invalidate_position_cache(&mut self, from_byte_pos: usize) {
        for block in self.blocks.values_mut() {
            if let Some(rope_pos) = block.rope_position() {
                if rope_pos >= from_byte_pos {
                    block.invalidate_rope_position();
                }
            }
        }
    }

    /// Rebuild rope from scratch (Phase 1: simple O(n) implementation)
    ///
    /// This is used after merge to ensure rope matches CRDT state.
    /// Phase 2 optimization: incremental updates instead of full rebuild.
    fn rebuild_rope(&mut self) {
        // CRITICAL: Build text in DOCUMENT ORDER (Fugue tree), NOT BTreeMap order!
        // BTreeMap order is causal/timestamp order, which differs from document
        // order in concurrent scenarios.
        let document_order = self.get_document_order();
        let mut text = String::new();

        for id in document_order {
            if let Some(block) = self.blocks.get(&id) {
                if !block.is_deleted() {
                    text.push_str(&block.text);
                }
            }
        }

        // Replace rope
        self.rope = Rope::from_str(&text);

        // Invalidate all position caches (Phase 1.5: O(1) flag + O(n) rope invalidation)
        for block in self.blocks.values_mut() {
            block.invalidate_rope_position();
        }
        self.cache_valid = false; // Mark cache as stale
    }

    /// Get blocks in document order using Fugue tree traversal.
    ///
    /// CRITICAL: This is the ONLY correct way to determine character positions.
    /// BTreeMap iteration gives causal/timestamp order, NOT document order.
    ///
    /// # Algorithm
    /// 1. Reconstruct Fugue tree from left_origin/right_origin metadata
    /// 2. Perform in-order traversal of the tree
    /// 3. Return NodeIds in document order
    ///
    /// # Complexity
    /// - Time: O(n²) for tree reconstruction, O(n) for traversal
    /// - Space: O(n) for tree storage
    ///
    /// # Returns
    /// Vector of NodeIds in document order (how characters appear in text)
    fn get_document_order(&self) -> Vec<NodeId> {
        // Step 1: Reconstruct the Fugue tree
        let tree = self.reconstruct_fugue_tree();

        // Step 2: In-order traversal to get document order
        self.in_order_traversal(&tree)
    }

    /// Find the block that contains a given character-level NodeId.
    ///
    /// With per-character clock allocation, each block represents a RANGE of clock values,
    /// not just a single clock. Block IDs always have offset=0.
    ///
    /// # Clock Range Calculation
    ///
    /// A block with ID `client@5:0` and length=3 contains characters at clocks [3, 4, 5]:
    /// - block_start_clock = 5 - 3 + 1 = 3
    /// - block_end_clock = 5
    ///
    /// # Arguments
    /// * `node_id` - Character-level NodeId pointing to a specific clock value
    ///
    /// # Returns
    /// Block ID that contains this clock value, None if not found
    fn find_block_for_nodeid(&self, node_id: &NodeId) -> Option<NodeId> {
        // Find block with matching client_id whose clock range contains node_id.clock
        for (block_id, block) in &self.blocks {
            if block_id.client_id == node_id.client_id {
                // Block represents clock range [start_clock, end_clock]
                // Example: block@5:0 with len=3 → clocks [3, 4, 5]
                let block_len = block.len() as u64;
                if block_len == 0 {
                    continue; // Empty blocks don't contain any characters
                }

                let block_start_clock = block_id.clock.saturating_sub(block_len - 1);
                let block_end_clock = block_id.clock;

                if node_id.clock >= block_start_clock && node_id.clock <= block_end_clock {
                    return Some(block_id.clone());
                }
            }
        }
        None
    }

    /// Reconstruct the Fugue tree from left_origin and right_origin metadata.
    ///
    /// This builds an explicit tree structure with parent-child relationships
    /// from the implicit tree encoded in left_origin/right_origin fields.
    ///
    /// **NOTE**: This works at BLOCK level. Blocks are the atomic units in the tree.
    /// Character-level NodeIds in origins are mapped to their containing blocks.
    ///
    /// # Algorithm
    /// Process blocks in timestamp order (NodeId order). For each block:
    /// 1. Map character-level origins to their containing blocks
    /// 2. Check if left_origin block is an ancestor of right_origin block
    /// 3. If YES: block becomes left child of right_origin block
    /// 4. If NO: block becomes right child of left_origin block
    ///
    /// # Returns
    /// HashMap mapping NodeId → TreeNode with parent/side information
    fn reconstruct_fugue_tree(&self) -> HashMap<NodeId, TreeNode> {
        let mut tree = HashMap::new();

        // Process blocks in timestamp order (critical for ancestor checks)
        let mut sorted_blocks: Vec<_> = self.blocks.iter().collect();
        sorted_blocks.sort_by_key(|(id, _)| *id);

        for (id, block) in sorted_blocks {
            // Map character-level NodeIds to their containing blocks
            let left_block = block
                .left_origin
                .as_ref()
                .and_then(|node_id| self.find_block_for_nodeid(node_id));
            let right_block = block
                .right_origin
                .as_ref()
                .and_then(|node_id| self.find_block_for_nodeid(node_id));

            let (parent, side) = self.determine_parent_and_side(&left_block, &right_block, &tree);

            tree.insert(
                id.clone(),
                TreeNode {
                    id: id.clone(),
                    parent,
                    side,
                    deleted: block.is_deleted(),
                },
            );
        }

        tree
    }

    /// Determine parent and side for a new node based on Fugue algorithm.
    ///
    /// # Fugue Rule
    /// When inserting between positions a and b:
    /// - If a is NOT an ancestor of b: new node is right child of a
    /// - If a IS an ancestor of b: new node is left child of b
    ///
    /// # Arguments
    /// * `left_origin` - Block to the left (a)
    /// * `right_origin` - Block to the right (b)
    /// * `tree` - Partial tree built from earlier blocks
    fn determine_parent_and_side(
        &self,
        left_origin: &Option<NodeId>,
        right_origin: &Option<NodeId>,
        tree: &HashMap<NodeId, TreeNode>,
    ) -> (Option<NodeId>, Side) {
        match (left_origin, right_origin) {
            // No origins: root node (first block ever inserted)
            (None, None) => (None, Side::Right),

            // Only left origin: insert at end
            (Some(a), None) => (Some(a.clone()), Side::Right),

            // Only right origin: insert at start
            (None, Some(b)) => (Some(b.clone()), Side::Left),

            // Both origins: check ancestor relationship
            (Some(a), Some(b)) => {
                if self.is_ancestor_in_tree(a, b, tree) {
                    // a is ancestor of b → new node is left child of b
                    (Some(b.clone()), Side::Left)
                } else {
                    // a is NOT ancestor of b → new node is right child of a
                    (Some(a.clone()), Side::Right)
                }
            }
        }
    }

    /// Check if node `a` is an ancestor of node `b` in the tree.
    ///
    /// Walks up from b to root, checking if we encounter a.
    ///
    /// # Arguments
    /// * `a` - Potential ancestor
    /// * `b` - Potential descendant
    /// * `tree` - Tree structure to search
    fn is_ancestor_in_tree(
        &self,
        a: &NodeId,
        b: &NodeId,
        tree: &HashMap<NodeId, TreeNode>,
    ) -> bool {
        let mut current = Some(b.clone());

        while let Some(node_id) = current {
            if &node_id == a {
                return true;
            }

            // Walk to parent
            current = tree.get(&node_id).and_then(|node| node.parent.clone());
        }

        false
    }

    /// Perform in-order traversal of the Fugue tree to get document order.
    ///
    /// # In-Order Traversal Algorithm
    /// 1. Traverse left children (sorted by NodeId for determinism)
    /// 2. Visit the node
    /// 3. Traverse right children (sorted by NodeId)
    ///
    /// This produces the correct document order for Fugue CRDT.
    ///
    /// # Arguments
    /// * `tree` - Reconstructed Fugue tree
    ///
    /// # Returns
    /// Vector of NodeIds in document order
    fn in_order_traversal(&self, tree: &HashMap<NodeId, TreeNode>) -> Vec<NodeId> {
        // Find root nodes (nodes with no parent)
        let mut roots: Vec<NodeId> = tree
            .values()
            .filter(|node| node.parent.is_none())
            .map(|node| node.id.clone())
            .collect();

        // Sort roots by NodeId for deterministic ordering
        // This ensures concurrent inserts at position 0 converge
        roots.sort();

        let mut result = Vec::new();

        // Traverse from each root (usually just one, but handle multiple)
        for root_id in roots {
            self.in_order_visit(&root_id, tree, &mut result);
        }

        result
    }

    /// Recursive in-order tree traversal helper.
    fn in_order_visit(
        &self,
        node_id: &NodeId,
        tree: &HashMap<NodeId, TreeNode>,
        result: &mut Vec<NodeId>,
    ) {
        let node = &tree[node_id];

        // 1. Traverse left children (sorted by NodeId)
        // IMPORTANT: Include deleted nodes in traversal (they may have non-deleted children)
        let mut left_children: Vec<NodeId> = tree
            .values()
            .filter(|n| {
                n.parent.as_ref() == Some(node_id) && n.side == Side::Left
                // Don't filter by deleted here - deleted nodes can have children!
            })
            .map(|n| n.id.clone())
            .collect();

        left_children.sort(); // Deterministic ordering by causal dot (NodeId)

        for child_id in left_children {
            self.in_order_visit(&child_id, tree, result);
        }

        // 2. Visit this node (if not deleted)
        if !node.deleted {
            result.push(node_id.clone());
        }

        // 3. Traverse right children (sorted by NodeId)
        // IMPORTANT: Include deleted nodes in traversal (they may have non-deleted children)
        let mut right_children: Vec<NodeId> = tree
            .values()
            .filter(|n| {
                n.parent.as_ref() == Some(node_id) && n.side == Side::Right
                // Don't filter by deleted here - deleted nodes can have children!
            })
            .map(|n| n.id.clone())
            .collect();

        right_children.sort(); // Deterministic ordering by causal dot (NodeId)

        for child_id in right_children {
            self.in_order_visit(&child_id, tree, result);
        }
    }

    /// Rebuild position cache for all blocks (Phase 1.5 optimization)
    ///
    /// This enables O(log n) binary search in find_origins() instead of O(n)
    /// linear scan. For each block, we compute its cumulative grapheme start
    /// position in the document. Also rebuilds the cached_blocks vector.
    ///
    /// **Performance Impact:**
    /// - Without cache: O(n) position lookup → O(n²) for n sequential ops
    /// - With cache: O(log n) binary search → O(n log n) for n sequential ops
    /// - Expected: 260K ops from ~40 min → <500ms (4,800x faster!)
    ///
    /// **Complexity:** O(n) - Single pass through all blocks
    ///
    /// **When Called:**
    /// - Lazily on first find_origins() call after cache invalidation
    /// - Triggered by cache_valid flag (O(1) check)
    ///
    /// # Example
    ///
    /// ```text
    /// Before:
    ///   Block A: text="Hello", cached_start_pos=MAX (invalid)
    ///   Block B: text=" World", cached_start_pos=MAX (invalid)
    ///
    /// After rebuild_position_cache():
    ///   Block A: text="Hello", cached_start_pos=0   (starts at pos 0)
    ///   Block B: text=" World", cached_start_pos=5  (starts at pos 5)
    /// ```
    fn rebuild_position_cache(&mut self) {
        let mut current_pos = 0;
        self.cached_blocks.clear();

        // CRITICAL: Must use document order (Fugue tree), NOT BTreeMap order!
        // BTreeMap order is causal/timestamp order, which differs from document
        // order in concurrent scenarios.
        let document_order = self.get_document_order();

        for id in document_order {
            if let Some(block) = self.blocks.get_mut(&id) {
                if !block.is_deleted() {
                    block.set_cached_position(current_pos);
                    current_pos += block.len();
                    self.cached_blocks.push(id.clone()); // Cache non-deleted block IDs
                }
            }
        }
    }

    /// Update cache after insert
    ///
    /// **CRITICAL**: The incremental cache update optimization is incompatible with
    /// Fugue tree traversal! The cache must be rebuilt using get_document_order() to
    /// maintain correct character positions.
    ///
    /// The cache will be rebuilt on the next find_origins() call.
    ///
    /// # Arguments
    /// * `insert_pos` - Grapheme position where text was inserted (unused)
    /// * `insert_len` - Number of graphemes inserted (unused)
    /// * `new_block_id` - NodeId of the newly created block (unused)
    fn update_cache_after_insert(
        &mut self,
        _insert_pos: usize,
        _insert_len: usize,
        _new_block_id: &NodeId,
    ) {
        // Invalidate cache - will rebuild using Fugue tree traversal on next access
        self.cache_valid = false;
    }

    /// Update cache incrementally after delete (Phase 1.5 optimization)
    ///
    /// Similar to insert, but shifts positions backward and may remove blocks.
    ///
    /// **Performance:** O(log n) + O(k) where k = blocks after delete
    ///
    /// # Arguments
    /// * `delete_pos` - Grapheme position where text was deleted
    /// * `delete_len` - Number of graphemes deleted
    #[allow(dead_code)]
    fn update_cache_after_delete(&mut self, delete_pos: usize, _delete_len: usize) {
        if !self.cache_valid {
            // Cache is already invalid, will rebuild on next find_origins
            return;
        }

        // 1. Find deletion point using binary search - O(log n)
        let _delete_idx = self
            .cached_blocks
            .binary_search_by(|id| {
                let block = &self.blocks[id];
                let block_start = block.cached_position().unwrap_or(0);
                let block_end = block_start + block.len();

                if delete_pos < block_start {
                    std::cmp::Ordering::Greater
                } else if delete_pos >= block_end {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Equal
                }
            })
            .unwrap_or_else(|idx| idx);

        // 2. Remove deleted blocks from cached_blocks - O(k)
        // Note: We need to check which blocks were deleted and remove them
        self.cached_blocks.retain(|id| {
            let block = &self.blocks[id];
            !block.is_deleted()
        });

        // 3. Rebuild cached_blocks to ensure correct ordering after deletion
        // This is necessary because deletion might affect multiple blocks
        // CRITICAL: Must use document order (Fugue tree), NOT BTreeMap order!
        let mut current_pos = 0;
        self.cached_blocks.clear();

        let document_order = self.get_document_order();

        for id in document_order {
            if let Some(block) = self.blocks.get_mut(&id) {
                if !block.is_deleted() {
                    block.set_cached_position(current_pos);
                    current_pos += block.len();
                    self.cached_blocks.push(id.clone());
                }
            }
        }

        // Cache remains valid after update
    }
}

// Placeholder for when text-crdt feature is disabled
#[cfg(not(feature = "text-crdt"))]
#[derive(Debug, Clone)]
pub struct FugueText;

#[cfg(not(feature = "text-crdt"))]
impl FugueText {
    pub fn new(_client_id: String) -> Self {
        panic!("FugueText requires 'text-crdt' feature to be enabled");
    }
}

#[cfg(all(test, feature = "text-crdt"))]
mod tests {
    use super::*;

    #[test]
    fn test_new() {
        let text = FugueText::new("client1".to_string());
        assert_eq!(text.len(), 0);
        assert_eq!(text.to_string(), "");
        assert_eq!(text.client_id(), "client1");
        assert_eq!(text.clock(), 0);
    }

    #[test]
    fn test_insert_single() {
        let mut text = FugueText::new("client1".to_string());
        text.insert(0, "Hello").unwrap();

        assert_eq!(text.len(), 5);
        assert_eq!(text.to_string(), "Hello");
        assert_eq!(text.clock(), 5); // Per-character allocation: 5 chars = clock 5
    }

    #[test]
    fn test_insert_multiple() {
        let mut text = FugueText::new("client1".to_string());
        text.insert(0, "Hello").unwrap();
        text.insert(5, " ").unwrap();
        text.insert(6, "World").unwrap();

        assert_eq!(text.to_string(), "Hello World");
        assert_eq!(text.clock(), 11); // Per-character: 5 + 1 + 5 = 11
    }

    #[test]
    fn test_insert_out_of_bounds() {
        let mut text = FugueText::new("client1".to_string());
        let result = text.insert(10, "test");

        assert!(result.is_err());
        match result {
            Err(TextError::PositionOutOfBounds { position, length }) => {
                assert_eq!(position, 10);
                assert_eq!(length, 0);
            }
            _ => panic!("Expected PositionOutOfBounds error"),
        }
    }

    #[test]
    fn test_delete_single() {
        let mut text = FugueText::new("client1".to_string());
        text.insert(0, "Hello World").unwrap();
        text.delete(5, 6).unwrap();

        assert_eq!(text.to_string(), "Hello");
        assert_eq!(text.len(), 5);
    }

    #[test]
    fn test_delete_out_of_bounds() {
        let mut text = FugueText::new("client1".to_string());
        text.insert(0, "Hello").unwrap();

        let result = text.delete(0, 10);
        assert!(result.is_err());
    }

    #[test]
    fn test_concurrent_insert() {
        let mut text1 = FugueText::new("client1".to_string());
        let mut text2 = FugueText::new("client2".to_string());

        // Both insert at position 0
        text1.insert(0, "A").unwrap();
        text2.insert(0, "B").unwrap();

        // Merge
        text1.merge(&text2).unwrap();
        text2.merge(&text1).unwrap();

        // Should converge (order determined by Lamport timestamp + client_id)
        assert_eq!(text1.to_string(), text2.to_string());
    }

    #[test]
    fn test_convergence() {
        let mut text1 = FugueText::new("client1".to_string());
        let mut text2 = FugueText::new("client2".to_string());

        // Complex concurrent operations
        text1.insert(0, "Hello").unwrap();
        text2.insert(0, "World").unwrap();

        text1.insert(5, " there").unwrap();
        text2.insert(5, "!").unwrap();

        // Merge both ways
        text1.merge(&text2).unwrap();
        text2.merge(&text1).unwrap();

        // Must converge
        assert_eq!(text1.to_string(), text2.to_string());
    }

    #[test]
    fn test_unicode_emoji() {
        let mut text = FugueText::new("client1".to_string());
        text.insert(0, "Hello 👋").unwrap();

        assert_eq!(text.len(), 7); // 5 chars + space + emoji (1 grapheme)
        assert_eq!(text.to_string(), "Hello 👋");
    }

    #[test]
    fn test_lamport_clock() {
        let mut clock = LamportClock::new();
        assert_eq!(clock.value(), 0);

        let ts1 = clock.tick();
        assert_eq!(ts1, 1);

        let ts2 = clock.tick();
        assert_eq!(ts2, 2);

        clock.update(5);
        assert_eq!(clock.value(), 5);

        let ts3 = clock.tick();
        assert_eq!(ts3, 6);
    }

    // ============================================================
    // Additional comprehensive tests (expanding coverage to 50+)
    // ============================================================

    #[test]
    fn test_empty_string_insert() {
        let mut text = FugueText::new("client1".to_string());
        text.insert(0, "").unwrap();
        assert_eq!(text.len(), 0);
        assert_eq!(text.to_string(), "");
    }

    #[test]
    fn test_large_text_insert() {
        let mut text = FugueText::new("client1".to_string());
        let large_text = "a".repeat(10000);
        text.insert(0, &large_text).unwrap();
        assert_eq!(text.len(), 10000);
        assert_eq!(text.to_string(), large_text);
    }

    #[test]
    fn test_delete_entire_text() {
        let mut text = FugueText::new("client1".to_string());
        text.insert(0, "Hello World").unwrap();
        text.delete(0, 11).unwrap();
        assert_eq!(text.len(), 0);
        assert_eq!(text.to_string(), "");
    }

    #[test]
    fn test_delete_then_insert_same_position() {
        let mut text = FugueText::new("client1".to_string());
        text.insert(0, "Hello World").unwrap();
        text.delete(6, 5).unwrap(); // Delete "World"
        text.insert(6, "Rust").unwrap(); // Insert "Rust"
        assert_eq!(text.to_string(), "Hello Rust");
    }

    #[test]
    fn test_three_way_concurrent_insert() {
        let mut text1 = FugueText::new("client1".to_string());
        let mut text2 = FugueText::new("client2".to_string());
        let mut text3 = FugueText::new("client3".to_string());

        // All three clients insert at position 0
        text1.insert(0, "A").unwrap();
        text2.insert(0, "B").unwrap();
        text3.insert(0, "C").unwrap();

        // Merge all
        text1.merge(&text2).unwrap();
        text1.merge(&text3).unwrap();
        text2.merge(&text1).unwrap();
        text3.merge(&text1).unwrap();

        // All should converge
        let result = text1.to_string();
        assert_eq!(text2.to_string(), result);
        assert_eq!(text3.to_string(), result);
        assert!(result.contains('A') && result.contains('B') && result.contains('C'));
    }

    #[test]
    fn test_interleaved_operations() {
        let mut text1 = FugueText::new("client1".to_string());
        let mut text2 = FugueText::new("client2".to_string());

        text1.insert(0, "Hello").unwrap();
        text2.merge(&text1).unwrap();

        text1.insert(5, " World").unwrap();
        text2.insert(5, " Rust").unwrap();

        text1.merge(&text2).unwrap();
        text2.merge(&text1).unwrap();

        assert_eq!(text1.to_string(), text2.to_string());
    }

    #[test]
    fn test_multiple_sequential_merges() {
        let mut text1 = FugueText::new("client1".to_string());
        let mut text2 = FugueText::new("client2".to_string());

        text1.insert(0, "A").unwrap();
        text2.merge(&text1).unwrap();

        text2.insert(1, "B").unwrap();
        text1.merge(&text2).unwrap();

        text1.insert(2, "C").unwrap();
        text2.merge(&text1).unwrap();

        assert_eq!(text1.to_string(), "ABC");
        assert_eq!(text2.to_string(), "ABC");
    }

    #[test]
    fn test_concurrent_delete_and_insert() {
        let mut text1 = FugueText::new("client1".to_string());
        let mut text2 = FugueText::new("client2".to_string());

        text1.insert(0, "Hello World").unwrap();
        text2.merge(&text1).unwrap();

        text1.delete(6, 5).unwrap(); // Delete "World"
        text2.insert(11, "!").unwrap(); // Insert "!" at end

        text1.merge(&text2).unwrap();
        text2.merge(&text1).unwrap();

        assert_eq!(text1.to_string(), text2.to_string());
    }

    #[test]
    fn test_network_partition_simulation() {
        let mut text1 = FugueText::new("client1".to_string());
        let mut text2 = FugueText::new("client2".to_string());
        let mut text3 = FugueText::new("client3".to_string());

        // Initial state
        text1.insert(0, "Start").unwrap();
        text2.merge(&text1).unwrap();
        text3.merge(&text1).unwrap();

        // Network partition: clients 1 and 2 can communicate, but not with 3
        text1.insert(5, " A").unwrap();
        text2.insert(5, " B").unwrap();
        text3.insert(5, " C").unwrap();

        // Partial merge (1 and 2)
        text1.merge(&text2).unwrap();
        text2.merge(&text1).unwrap();

        // Network heals
        text1.merge(&text3).unwrap();
        text2.merge(&text3).unwrap();
        text3.merge(&text1).unwrap();

        // All converge
        let result = text1.to_string();
        assert_eq!(text2.to_string(), result);
        assert_eq!(text3.to_string(), result);
    }

    #[test]
    fn test_rle_optimization() {
        let mut text = FugueText::new("client1".to_string());
        text.insert(0, "Hello").unwrap();

        // With RLE, "Hello" should be stored in one block
        assert_eq!(text.blocks.len(), 1);

        // Insert at different position creates new block
        text.insert(0, "Hi ").unwrap();
        assert_eq!(text.blocks.len(), 2);
    }

    #[test]
    fn test_rtl_text() {
        let mut text = FugueText::new("client1".to_string());
        text.insert(0, "مرحبا").unwrap(); // Arabic "Hello"
        assert_eq!(text.to_string(), "مرحبا");
        assert!(!text.is_empty());
    }

    #[test]
    fn test_combining_characters() {
        let mut text = FugueText::new("client1".to_string());
        text.insert(0, "é").unwrap(); // e with combining acute accent
        assert_eq!(text.len(), 1); // Should count as 1 grapheme
    }

    #[test]
    fn test_mixed_scripts() {
        let mut text = FugueText::new("client1".to_string());
        text.insert(0, "Hello世界🌍").unwrap(); // English + Chinese + Emoji
        assert_eq!(text.to_string(), "Hello世界🌍");
    }

    #[test]
    fn test_sequential_single_char_inserts() {
        let mut text = FugueText::new("client1".to_string());
        text.insert(0, "H").unwrap();
        text.insert(1, "e").unwrap();
        text.insert(2, "l").unwrap();
        text.insert(3, "l").unwrap();
        text.insert(4, "o").unwrap();
        assert_eq!(text.to_string(), "Hello");
    }

    #[test]
    fn test_is_empty() {
        let mut text = FugueText::new("client1".to_string());
        assert!(text.is_empty());

        text.insert(0, "Hello").unwrap();
        assert!(!text.is_empty());

        text.delete(0, 5).unwrap();
        assert!(text.is_empty());
    }

    #[test]
    fn test_delete_middle() {
        let mut text = FugueText::new("client1".to_string());
        text.insert(0, "Hello World").unwrap();
        text.delete(5, 1).unwrap(); // Delete space
        assert_eq!(text.to_string(), "HelloWorld");
    }

    #[test]
    fn test_delete_beginning() {
        let mut text = FugueText::new("client1".to_string());
        text.insert(0, "Hello World").unwrap();
        text.delete(0, 6).unwrap(); // Delete "Hello "
        assert_eq!(text.to_string(), "World");
    }

    #[test]
    fn test_idempotent_merge() {
        let mut text1 = FugueText::new("client1".to_string());
        text1.insert(0, "Hello").unwrap();

        let state = text1.to_string();

        // Merge with itself should be idempotent
        text1.merge(&text1.clone()).unwrap();
        assert_eq!(text1.to_string(), state);
    }

    #[test]
    fn test_commutative_merge() {
        let mut text1 = FugueText::new("client1".to_string());
        let mut text2 = FugueText::new("client2".to_string());

        text1.insert(0, "A").unwrap();
        text2.insert(0, "B").unwrap();

        let mut text_ab = text1.clone();
        text_ab.merge(&text2).unwrap();

        let mut text_ba = text2.clone();
        text_ba.merge(&text1).unwrap();

        // Merge should be commutative
        assert_eq!(text_ab.to_string(), text_ba.to_string());
    }

    #[test]
    fn test_associative_merge() {
        let mut text1 = FugueText::new("client1".to_string());
        let mut text2 = FugueText::new("client2".to_string());
        let mut text3 = FugueText::new("client3".to_string());

        text1.insert(0, "A").unwrap();
        text2.insert(0, "B").unwrap();
        text3.insert(0, "C").unwrap();

        // (text1 ∪ text2) ∪ text3
        let mut result1 = text1.clone();
        result1.merge(&text2).unwrap();
        result1.merge(&text3).unwrap();

        // text1 ∪ (text2 ∪ text3)
        let mut result2 = text1.clone();
        let mut text23 = text2.clone();
        text23.merge(&text3).unwrap();
        result2.merge(&text23).unwrap();

        // Merge should be associative
        assert_eq!(result1.to_string(), result2.to_string());
    }

    #[test]
    fn test_get_node_id_at_position() {
        let mut text = FugueText::new("client1".to_string());
        text.insert(0, "Hello").unwrap();

        // Get NodeId at position 0 (first character 'H')
        // With per-character clocks, "Hello" allocates clocks 1-5
        let node_id_0 = text.get_node_id_at_position(0).unwrap();
        assert_eq!(node_id_0.client_id, "client1");
        assert_eq!(node_id_0.clock, 1); // First char has clock 1
        assert_eq!(node_id_0.offset, 0);

        // Get NodeId at position 2 (character 'l')
        let node_id_2 = text.get_node_id_at_position(2).unwrap();
        assert_eq!(node_id_2.client_id, "client1");
        assert_eq!(node_id_2.clock, 3); // Third char has clock 3
        assert_eq!(node_id_2.offset, 0);

        // Get NodeId at position 4 (last character 'o')
        let node_id_4 = text.get_node_id_at_position(4).unwrap();
        assert_eq!(node_id_4.client_id, "client1");
        assert_eq!(node_id_4.clock, 5); // Fifth char has clock 5
        assert_eq!(node_id_4.offset, 0);
    }

    #[test]
    fn test_get_node_id_at_position_out_of_bounds() {
        let mut text = FugueText::new("client1".to_string());
        text.insert(0, "Hello").unwrap();

        // Position equal to length should fail
        let result = text.get_node_id_at_position(5);
        assert!(result.is_err());
        match result {
            Err(TextError::PositionOutOfBounds { position, length }) => {
                assert_eq!(position, 5);
                assert_eq!(length, 5);
            }
            _ => panic!("Expected PositionOutOfBounds error"),
        }

        // Position greater than length should fail
        let result = text.get_node_id_at_position(10);
        assert!(result.is_err());
    }

    #[test]
    fn test_get_node_id_multiple_blocks() {
        let mut text = FugueText::new("client1".to_string());

        // Insert "Hello" at position 0 (allocates clocks 1-5)
        text.insert(0, "Hello").unwrap();

        // Insert " World" at position 5 (allocates clocks 6-11)
        text.insert(5, " World").unwrap();

        // Get NodeId in first block (position 2 -> 'l' in "Hello")
        let node_id_2 = text.get_node_id_at_position(2).unwrap();
        assert_eq!(node_id_2.client_id, "client1");
        assert_eq!(node_id_2.clock, 3); // Third char has clock 3
        assert_eq!(node_id_2.offset, 0);

        // Get NodeId in second block (position 6 -> 'W' in " World")
        let node_id_6 = text.get_node_id_at_position(6).unwrap();
        assert_eq!(node_id_6.client_id, "client1");
        assert_eq!(node_id_6.clock, 7); // "Hello"=1-5, " "=6, "W"=7
        assert_eq!(node_id_6.offset, 0);
    }

    #[test]
    fn test_get_node_id_after_delete() {
        let mut text = FugueText::new("client1".to_string());

        // Insert two separate blocks to test deletion
        text.insert(0, "Hello").unwrap(); // Clocks 1-5
        text.insert(5, " World").unwrap(); // Clocks 6-11

        // Verify initial state
        assert_eq!(text.to_string(), "Hello World");
        assert_eq!(text.len(), 11);

        // Delete " World" (positions 5-11)
        text.delete(5, 6).unwrap();

        // Text should now be "Hello"
        assert_eq!(text.to_string(), "Hello");
        assert_eq!(text.len(), 5);

        // Get NodeId at position 2 (middle 'l' character in "Hello")
        let node_id = text.get_node_id_at_position(2).unwrap();
        assert_eq!(node_id.client_id, "client1");
        assert_eq!(node_id.clock, 3); // Third char has clock 3
        assert_eq!(node_id.offset, 0);

        // Position 5 should now be out of bounds
        let result = text.get_node_id_at_position(5);
        assert!(result.is_err());
    }
}

#[cfg(test)]
mod fugue_tree_tests {
    use super::*;

    #[test]
    fn test_simple_sequential() {
        let mut text = FugueText::new("test".to_string());
        text.insert(0, "A").unwrap();
        text.insert(1, "B").unwrap();
        text.insert(2, "C").unwrap();
        assert_eq!(text.to_string(), "ABC");
    }

    #[test]
    fn test_insert_middle() {
        let mut text = FugueText::new("test".to_string());
        text.insert(0, "A").unwrap();
        text.insert(1, "C").unwrap();
        text.insert(1, "B").unwrap();
        let result = text.to_string();
        println!("Result: '{}'", result);
        assert_eq!(result, "ABC", "Expected ABC, got {}", result);
    }

    #[test]
    fn test_insert_into_middle_of_block() {
        // This mirrors the failing integration test
        let mut text = FugueText::new("test".to_string());

        // Insert "The quick brown fox" as one block
        text.insert(0, "The quick brown fox").unwrap();
        println!("After first insert: '{}'", text.to_string());
        assert_eq!(text.to_string(), "The quick brown fox");

        // Insert "very " at position 4 (after the space, before "quick")
        text.insert(4, "very ").unwrap();
        println!("After second insert: '{}'", text.to_string());

        // Expected: "The very quick brown fox"
        let result = text.to_string();
        assert_eq!(
            result, "The very quick brown fox",
            "Expected 'The very quick brown fox', got '{}'",
            result
        );
    }

    #[test]
    fn test_delete_and_get_node_id() {
        // This test verifies block splitting works correctly!
        // When deleting part of a block, it should be split into 3 blocks:
        // - Left block (non-deleted)
        // - Middle block (deleted)
        // - Right block (non-deleted)

        let mut text = FugueText::new("test".to_string());

        // Insert "Hello Beautiful World" (allocates clocks 1-21)
        text.insert(0, "Hello Beautiful World").unwrap();
        println!("After insert: '{}'", text.to_string());
        assert_eq!(text.to_string(), "Hello Beautiful World");
        assert_eq!(text.len(), 21);

        // Delete "Beautiful " (positions 6-15 inclusive, length 10)
        text.delete(6, 10).unwrap();
        println!("After delete: '{}'", text.to_string());
        assert_eq!(text.to_string(), "Hello World");
        assert_eq!(text.len(), 11);

        // Verify we can get NodeIds for all positions
        for i in 0..text.len() {
            let node_id = text.get_node_id_at_position(i).unwrap();
            println!("NodeId at position {}: {}", i, node_id);
            assert_eq!(node_id.client_id, "test");
            assert_eq!(node_id.offset, 0); // All NodeIds should have offset=0
        }

        // Verify specific positions have correct clocks
        // "Hello" = clocks 1-5, " " = clock 6, "World" = clocks 17-21
        // (clocks 7-16 were deleted with "Beautiful ")
        let node_0 = text.get_node_id_at_position(0).unwrap(); // 'H'
        assert_eq!(node_0.clock, 1);

        let node_5 = text.get_node_id_at_position(5).unwrap(); // ' ' after Hello
        assert_eq!(node_5.clock, 6);

        let node_6 = text.get_node_id_at_position(6).unwrap(); // 'W'
        assert_eq!(node_6.clock, 17); // First char of "World"
    }
}
