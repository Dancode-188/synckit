//! OR-Set: Observed-Remove Set CRDT
//!
//! A state-based CRDT that supports add and remove operations on a set.
//! Uses unique tags to distinguish between concurrent adds of the same element.
//!
//! # Properties
//!
//! - **Convergence:** All replicas converge to same set
//! - **Add wins:** Concurrent add and remove → element stays in set
//! - **Unique tags:** Each add gets a unique identifier
//!
//! # Example
//!
//! ```
//! use synckit_core::crdt::ORSet;
//!
//! let mut set1 = ORSet::new("replica1".to_string());
//! let mut set2 = ORSet::new("replica2".to_string());
//!
//! // Concurrent adds
//! set1.add("apple".to_string());
//! set2.add("banana".to_string());
//!
//! // Merge
//! set1.merge(&set2);
//!
//! assert!(set1.contains(&"apple".to_string()));
//! assert!(set1.contains(&"banana".to_string()));
//! ```

use crate::ClientID;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[cfg(not(target_arch = "wasm32"))]
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(target_arch = "wasm32")]
use js_sys::Date;

/// Unique identifier for an element in the set
///
/// Combines replica ID and timestamp to ensure global uniqueness
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
struct UniqueTag {
    replica_id: ClientID,
    timestamp: u64,
    sequence: u64, // For same-timestamp operations
}

impl UniqueTag {
    fn new(replica_id: ClientID, timestamp: u64, sequence: u64) -> Self {
        Self {
            replica_id,
            timestamp,
            sequence,
        }
    }
}

/// Observed-Remove Set CRDT
///
/// Maintains a set of elements where each add operation is tagged uniquely.
/// Removes are tracked separately to handle concurrent operations correctly.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ORSet<T>
where
    T: Clone + Eq + std::hash::Hash + Serialize,
{
    /// Replica identifier
    replica_id: ClientID,

    /// Elements with their unique tags
    /// Maps element → set of tags that added it
    elements: HashMap<T, HashSet<UniqueTag>>,

    /// Tags that have been removed
    /// An element is in the set if it has at least one tag not in this set
    removed_tags: HashSet<UniqueTag>,

    /// Sequence counter for this replica (for same-timestamp operations)
    sequence: u64,
}

impl<T> ORSet<T>
where
    T: Clone + Eq + std::hash::Hash + Serialize,
{
    /// Create a new OR-Set for the given replica
    pub fn new(replica_id: ClientID) -> Self {
        Self {
            replica_id,
            elements: HashMap::new(),
            removed_tags: HashSet::new(),
            sequence: 0,
        }
    }

    /// Add an element to the set
    ///
    /// Creates a unique tag for this add operation.
    pub fn add(&mut self, element: T) {
        #[cfg(not(target_arch = "wasm32"))]
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_micros() as u64;

        #[cfg(target_arch = "wasm32")]
        let timestamp = (Date::now() * 1000.0) as u64; // Convert ms to microseconds

        self.sequence += 1;
        let tag = UniqueTag::new(self.replica_id.clone(), timestamp, self.sequence);

        self.elements.entry(element).or_default().insert(tag);
    }

    /// Remove an element from the set
    ///
    /// Marks all current tags for this element as removed.
    /// If the element is added again later, it will get a new tag.
    pub fn remove(&mut self, element: &T) {
        if let Some(tags) = self.elements.get(element) {
            // Mark all tags for this element as removed
            for tag in tags {
                self.removed_tags.insert(tag.clone());
            }
        }
    }

    /// Check if an element is in the set
    ///
    /// An element is in the set if it has at least one tag that hasn't been removed.
    pub fn contains(&self, element: &T) -> bool {
        if let Some(tags) = self.elements.get(element) {
            // Element is in set if any tag is not removed
            tags.iter().any(|tag| !self.removed_tags.contains(tag))
        } else {
            false
        }
    }

    /// Get all elements currently in the set
    pub fn iter(&self) -> impl Iterator<Item = &T> {
        self.elements
            .iter()
            .filter(|(_, tags)| {
                // Include element if any tag is not removed
                tags.iter().any(|tag| !self.removed_tags.contains(tag))
            })
            .map(|(element, _)| element)
    }

    /// Get the number of elements in the set
    pub fn len(&self) -> usize {
        self.iter().count()
    }

    /// Check if the set is empty
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Merge another OR-Set's state into this one
    ///
    /// Takes the union of all elements and removed tags.
    pub fn merge(&mut self, other: &ORSet<T>) {
        // Merge elements (union of tags)
        for (element, tags) in &other.elements {
            self.elements
                .entry(element.clone())
                .or_default()
                .extend(tags.clone());
        }

        // Merge removed tags (union)
        self.removed_tags.extend(other.removed_tags.clone());
    }

    /// Clear all elements from the set
    pub fn clear(&mut self) {
        // Mark all current tags as removed
        for tags in self.elements.values() {
            for tag in tags {
                self.removed_tags.insert(tag.clone());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_set_creation() {
        let set: ORSet<String> = ORSet::new("replica1".to_string());
        assert_eq!(set.len(), 0);
        assert!(set.is_empty());
    }

    #[test]
    fn test_add_element() {
        let mut set = ORSet::new("replica1".to_string());
        set.add("apple".to_string());

        assert_eq!(set.len(), 1);
        assert!(set.contains(&"apple".to_string()));
    }

    #[test]
    fn test_add_multiple_elements() {
        let mut set = ORSet::new("replica1".to_string());
        set.add("apple".to_string());
        set.add("banana".to_string());
        set.add("cherry".to_string());

        assert_eq!(set.len(), 3);
        assert!(set.contains(&"apple".to_string()));
        assert!(set.contains(&"banana".to_string()));
        assert!(set.contains(&"cherry".to_string()));
    }

    #[test]
    fn test_remove_element() {
        let mut set = ORSet::new("replica1".to_string());
        set.add("apple".to_string());
        set.add("banana".to_string());

        set.remove(&"apple".to_string());

        assert_eq!(set.len(), 1);
        assert!(!set.contains(&"apple".to_string()));
        assert!(set.contains(&"banana".to_string()));
    }

    #[test]
    fn test_remove_nonexistent() {
        let mut set = ORSet::new("replica1".to_string());
        set.add("apple".to_string());

        // Removing non-existent element should be no-op
        set.remove(&"banana".to_string());

        assert_eq!(set.len(), 1);
        assert!(set.contains(&"apple".to_string()));
    }

    #[test]
    fn test_add_after_remove() {
        let mut set = ORSet::new("replica1".to_string());
        set.add("apple".to_string());
        set.remove(&"apple".to_string());

        // Add again - should work (new tag)
        set.add("apple".to_string());

        assert_eq!(set.len(), 1);
        assert!(set.contains(&"apple".to_string()));
    }

    #[test]
    fn test_merge_different_replicas() {
        let mut set1 = ORSet::new("replica1".to_string());
        let mut set2 = ORSet::new("replica2".to_string());

        set1.add("apple".to_string());
        set2.add("banana".to_string());

        set1.merge(&set2);

        assert_eq!(set1.len(), 2);
        assert!(set1.contains(&"apple".to_string()));
        assert!(set1.contains(&"banana".to_string()));
    }

    #[test]
    fn test_merge_with_removes() {
        let mut set1 = ORSet::new("replica1".to_string());
        let mut set2 = ORSet::new("replica2".to_string());

        // Both add apple
        set1.add("apple".to_string());
        set2.add("apple".to_string());

        // Replica2 removes it
        set2.remove(&"apple".to_string());

        // Before merge, replica1 has apple, replica2 doesn't
        assert!(set1.contains(&"apple".to_string()));
        assert!(!set2.contains(&"apple".to_string()));

        // After merge, replica1's add should survive (add-wins semantics)
        set1.merge(&set2);
        assert!(set1.contains(&"apple".to_string()));
    }

    #[test]
    fn test_concurrent_add_remove() {
        let mut set1 = ORSet::new("replica1".to_string());
        let mut set2 = set1.clone();

        // Concurrent operations
        set1.add("apple".to_string());
        set2.remove(&"apple".to_string()); // Removes nothing (apple not added yet)

        set1.merge(&set2);

        // Add should win
        assert!(set1.contains(&"apple".to_string()));
    }

    #[test]
    fn test_merge_idempotence() {
        let mut set1 = ORSet::new("replica1".to_string());
        let mut set2 = ORSet::new("replica2".to_string());

        set1.add("apple".to_string());
        set2.add("banana".to_string());

        set1.merge(&set2);
        let len1 = set1.len();

        set1.merge(&set2);
        let len2 = set1.len();

        assert_eq!(len1, len2);
    }

    #[test]
    fn test_clear() {
        let mut set = ORSet::new("replica1".to_string());
        set.add("apple".to_string());
        set.add("banana".to_string());

        set.clear();

        assert_eq!(set.len(), 0);
        assert!(!set.contains(&"apple".to_string()));
        assert!(!set.contains(&"banana".to_string()));
    }

    #[test]
    fn test_iter() {
        let mut set = ORSet::new("replica1".to_string());
        set.add("apple".to_string());
        set.add("banana".to_string());
        set.add("cherry".to_string());

        let mut items: Vec<_> = set.iter().cloned().collect();
        items.sort();

        assert_eq!(items, vec!["apple", "banana", "cherry"]);
    }
}
