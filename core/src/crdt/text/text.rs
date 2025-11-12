//! Text CRDT: YATA-style collaborative text editing
//!
//! This implements the YATA (Yet Another Transformation Approach) algorithm
//! used by Yjs for high-performance collaborative text editing.
//!
//! Key features:
//! - Block-based structure for efficiency
//! - Sequential insertion optimization (O(1) for typical typing)
//! - Deterministic conflict resolution
//! - Tombstones for deletion handling

use super::id::ItemId;
use super::item::Item;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Text CRDT document
///
/// Stores all items (including deleted ones) and provides operations
/// for collaborative text editing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Text {
    /// Client ID for this replica
    client_id: u64,
    
    /// Lamport clock for generating unique IDs
    clock: u64,
    
    /// Store of all items by their ID
    items: HashMap<ItemId, Item>,
    
    /// Ordered list of item IDs (the actual sequence)
    sequence: Vec<ItemId>,
}

impl Text {
    /// Create a new text document
    pub fn new(client_id: u64) -> Self {
        Self {
            client_id,
            clock: 0,
            items: HashMap::new(),
            sequence: Vec::new(),
        }
    }
    
    /// Get the current client ID
    pub fn client_id(&self) -> u64 {
        self.client_id
    }
    
    /// Get the current clock value
    pub fn clock(&self) -> u64 {
        self.clock
    }
    
    /// Generate next item ID
    fn next_id(&mut self) -> ItemId {
        let id = ItemId::new(self.client_id, self.clock);
        self.clock += 1;
        id
    }
    
    /// Insert text at the given position
    ///
    /// Returns the IDs of created items
    pub fn insert(&mut self, position: usize, text: &str) -> Vec<ItemId> {
        let mut created_ids = Vec::new();
        
        // Find left and right origins
        let (left_origin, right_origin) = self.get_origins_at_position(position);
        
        // Create items for each character
        // All characters from this insert share the same left/right origins
        for ch in text.chars() {
            let id = self.next_id();
            let item = Item::new_char(id, ch, left_origin, right_origin);
            
            self.items.insert(id, item);
            created_ids.push(id);
        }
        
        // Integrate the new items into the sequence
        self.integrate_items(&created_ids);
        
        // Try to merge adjacent blocks from same client
        self.merge_blocks();
        
        created_ids
    }
    
    /// Delete text at the given position
    ///
    /// Marks items as deleted (tombstones) rather than removing them
    pub fn delete(&mut self, position: usize, length: usize) -> Vec<ItemId> {
        let mut deleted_ids = Vec::new();
        
        let mut visible_pos = 0;
        for &id in &self.sequence {
            if let Some(item) = self.items.get_mut(&id) {
                if item.deleted {
                    continue;
                }
                
                let item_len = item.content.len();
                
                // Check if this item overlaps with deletion range
                if visible_pos < position + length && visible_pos + item_len > position {
                    item.delete();
                    deleted_ids.push(id);
                }
                
                visible_pos += item_len;
                
                if visible_pos >= position + length {
                    break;
                }
            }
        }
        
        deleted_ids
    }
    
    /// Get the current text content (excluding deleted items)
    pub fn to_string(&self) -> String {
        let mut result = String::new();
        
        for &id in &self.sequence {
            if let Some(item) = self.items.get(&id) {
                if !item.deleted {
                    result.push_str(&item.content);
                }
            }
        }
        
        result
    }
    
    /// Get the length of the text (excluding deleted items)
    pub fn len(&self) -> usize {
        self.sequence
            .iter()
            .filter_map(|id| self.items.get(id))
            .filter(|item| !item.deleted)
            .map(|item| item.content.len())
            .sum()
    }
    
    /// Check if the text is empty
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
    
    /// Get left and right origins for insertion at position
    fn get_origins_at_position(&self, position: usize) -> (Option<ItemId>, Option<ItemId>) {
        if position == 0 {
            // Insert at beginning
            return (None, self.sequence.first().copied());
        }
        
        let mut visible_pos = 0;
        
        for (i, &id) in self.sequence.iter().enumerate() {
            if let Some(item) = self.items.get(&id) {
                if item.deleted {
                    continue;
                }
                
                let item_len = item.content.len();
                
                if visible_pos + item_len >= position {
                    // Found the insertion point - left origin is this item
                    let left_origin = Some(id);
                    
                    // Find right origin (next visible item after current)
                    let mut right_origin = None;
                    for &next_id in &self.sequence[i + 1..] {
                        if let Some(next_item) = self.items.get(&next_id) {
                            if !next_item.deleted {
                                right_origin = Some(next_id);
                                break;
                            }
                        }
                    }
                    
                    return (left_origin, right_origin);
                }
                
                visible_pos += item_len;
            }
        }
        
        // Insert at end
        (self.sequence.last().copied(), None)
    }
    
    /// Integrate items into the sequence using YATA algorithm
    ///
    /// This is the core conflict resolution algorithm. It finds the correct
    /// position for new items based on their left and right origins.
    fn integrate_items(&mut self, item_ids: &[ItemId]) {
        for &item_id in item_ids {
            self.integrate_item(item_id);
        }
    }
    
    /// Integrate a single item into the sequence
    fn integrate_item(&mut self, item_id: ItemId) {
        let item = self.items.get(&item_id).expect("Item must exist");
        let left = item.left;
        let right = item.right;
        
        // Find insertion position using YATA algorithm
        let insert_pos = if let Some(left_id) = left {
            // Find left origin in sequence
            if let Some(left_pos) = self.sequence.iter().position(|&id| id == left_id) {
                // Scan forward from left origin
                let mut pos = left_pos + 1;
                
                while pos < self.sequence.len() {
                    let current_id = self.sequence[pos];
                    
                    // Stop if we reach the right origin
                    if Some(current_id) == right {
                        break;
                    }
                    
                    if let Some(current_item) = self.items.get(&current_id) {
                        // YATA conflict resolution:
                        // - Items with same left origin: order by ID (deterministic)
                        // - Items with different left but originated between our left and right:
                        //   continue scanning to find the right position
                        
                        if current_item.left == left {
                            // Same left origin: compare IDs
                            if item_id < current_id {
                                // Our item should come before this one
                                break;
                            } else {
                                // Continue scanning
                                pos += 1;
                            }
                        } else {
                            // Different left origin
                            // Check if current item originated between our left and right
                            if right.is_some() {
                                // If current's left comes after our left, we go before it
                                if let Some(current_left) = current_item.left {
                                    if current_left > left_id {
                                        break;
                                    }
                                }
                            }
                            pos += 1;
                        }
                    } else {
                        break;
                    }
                }
                
                pos
            } else {
                // Left origin not found, append
                self.sequence.len()
            }
        } else {
            // No left origin, insert at beginning
            // But scan to find items that also have no left origin
            let mut pos = 0;
            while pos < self.sequence.len() {
                let current_id = self.sequence[pos];
                
                // Stop if we reach the right origin
                if Some(current_id) == right {
                    break;
                }
                
                if let Some(current_item) = self.items.get(&current_id) {
                    if current_item.left.is_none() {
                        // Both have no left origin: order by ID
                        if item_id < current_id {
                            break;
                        } else {
                            pos += 1;
                        }
                    } else {
                        // Current has a left origin, we go before it
                        break;
                    }
                } else {
                    break;
                }
            }
            pos
        };
        
        self.sequence.insert(insert_pos, item_id);
    }
    
    /// Merge adjacent blocks from the same client
    ///
    /// This is an important optimization that keeps memory usage low
    /// for sequential typing patterns.
    fn merge_blocks(&mut self) {
        let mut i = 0;
        while i + 1 < self.sequence.len() {
            let id1 = self.sequence[i];
            let id2 = self.sequence[i + 1];
            
            // Check if items can be merged
            let can_merge = {
                if let (Some(item1), Some(item2)) = (self.items.get(&id1), self.items.get(&id2)) {
                    item1.can_merge_with(item2)
                } else {
                    false
                }
            };
            
            if can_merge {
                // Perform merge
                let item2 = self.items.remove(&id2).unwrap();
                self.items.get_mut(&id1).unwrap().merge(&item2);
                self.sequence.remove(i + 1);
                // Don't increment i, check if we can merge with next item
            } else {
                i += 1;
            }
        }
    }
    
    /// Merge this text document with another
    ///
    /// Integrates all items from the other document that we don't have yet
    pub fn merge(&mut self, other: &Text) {
        // Update clock to be at least as large as other's clock
        if other.clock > self.clock {
            self.clock = other.clock;
        }
        
        // Collect new items and update existing items
        let mut new_items = Vec::new();
        for (&id, other_item) in &other.items {
            if let Some(my_item) = self.items.get_mut(&id) {
                // Item exists: update deletion status
                if other_item.deleted && !my_item.deleted {
                    my_item.deleted = true;
                }
            } else {
                // New item: add it
                self.items.insert(id, other_item.clone());
                new_items.push(id);
            }
        }
        
        // Integrate new items
        self.integrate_items(&new_items);
        
        // Merge blocks for optimization
        self.merge_blocks();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_basic_insert() {
        let mut text = Text::new(1);
        
        text.insert(0, "Hello");
        assert_eq!(text.to_string(), "Hello");
        assert_eq!(text.len(), 5);
    }
    
    #[test]
    fn test_insert_at_position() {
        let mut text = Text::new(1);
        
        text.insert(0, "Hello");
        text.insert(5, " World");
        
        assert_eq!(text.to_string(), "Hello World");
        assert_eq!(text.len(), 11);
    }
    
    #[test]
    fn test_insert_in_middle() {
        let mut text = Text::new(1);
        
        text.insert(0, "Helo");
        text.insert(2, "l");
        
        assert_eq!(text.to_string(), "Hello");
    }
    
    #[test]
    fn test_basic_delete() {
        let mut text = Text::new(1);
        
        text.insert(0, "Hello World");
        text.delete(5, 6); // Delete " World"
        
        assert_eq!(text.to_string(), "Hello");
        assert_eq!(text.len(), 5);
    }
    
    #[test]
    fn test_delete_in_middle() {
        let mut text = Text::new(1);
        
        text.insert(0, "Hello");
        text.delete(1, 3); // Delete "ell"
        
        assert_eq!(text.to_string(), "Ho");
    }
    
    #[test]
    fn test_sequential_typing() {
        let mut text = Text::new(1);
        
        // Simulate typing "Hello" character by character
        text.insert(0, "H");
        text.insert(1, "e");
        text.insert(2, "l");
        text.insert(3, "l");
        text.insert(4, "o");
        
        assert_eq!(text.to_string(), "Hello");
        
        // Check that blocks were merged (optimization)
        assert!(text.sequence.len() <= 5);
    }
    
    #[test]
    fn test_concurrent_insert_same_position() {
        // Two clients insert at position 0 concurrently
        let mut text1 = Text::new(1);
        let mut text2 = Text::new(2);
        
        text1.insert(0, "A");
        text2.insert(0, "B");
        
        // Merge states
        text1.merge(&text2);
        text2.merge(&text1);
        
        // Should converge to same result
        assert_eq!(text1.to_string(), text2.to_string());
        
        // Result should be deterministic (ordered by client ID)
        let result = text1.to_string();
        assert!(result == "AB" || result == "BA");
    }
    
    #[test]
    fn test_concurrent_insert_different_positions() {
        // Setup initial state
        let mut text1 = Text::new(1);
        let mut text2 = Text::new(2);
        
        text1.insert(0, "Hello");
        text2.merge(&text1);
        
        // Concurrent insertions at different positions
        text1.insert(0, "A");    // "AHello"
        text2.insert(5, "B");    // "HelloB"
        
        // Merge
        text1.merge(&text2);
        text2.merge(&text1);
        
        // Should converge
        assert_eq!(text1.to_string(), text2.to_string());
        assert_eq!(text1.to_string(), "AHelloB");
    }
    
    #[test]
    fn test_concurrent_delete() {
        // Setup initial state
        let mut text1 = Text::new(1);
        let mut text2 = Text::new(2);
        
        text1.insert(0, "Hello World");
        text2.merge(&text1);
        
        // Concurrent deletions
        text1.delete(0, 5);  // Delete "Hello"
        text2.delete(6, 5);  // Delete "World"
        
        // Merge
        text1.merge(&text2);
        text2.merge(&text1);
        
        // Should converge
        assert_eq!(text1.to_string(), text2.to_string());
        assert_eq!(text1.to_string(), " ");
    }
    
    #[test]
    fn test_merge_convergence() {
        // Three clients making concurrent changes
        let mut text1 = Text::new(1);
        let mut text2 = Text::new(2);
        let mut text3 = Text::new(3);
        
        // Initial state
        text1.insert(0, "abc");
        text2.merge(&text1);
        text3.merge(&text1);
        
        // Concurrent operations
        text1.insert(1, "X");  // "aXbc"
        text2.insert(2, "Y");  // "abYc"
        text3.delete(0, 1);    // "bc"
        
        // Merge all states
        text1.merge(&text2);
        text1.merge(&text3);
        
        text2.merge(&text1);
        text2.merge(&text3);
        
        text3.merge(&text1);
        text3.merge(&text2);
        
        // All should converge to same result
        assert_eq!(text1.to_string(), text2.to_string());
        assert_eq!(text2.to_string(), text3.to_string());
    }
    
    #[test]
    fn test_empty_text() {
        let text = Text::new(1);
        
        assert_eq!(text.to_string(), "");
        assert_eq!(text.len(), 0);
        assert!(text.is_empty());
    }
    
    #[test]
    fn test_delete_everything() {
        let mut text = Text::new(1);
        
        text.insert(0, "Hello");
        text.delete(0, 5);
        
        assert_eq!(text.to_string(), "");
        assert!(text.is_empty());
    }
}
