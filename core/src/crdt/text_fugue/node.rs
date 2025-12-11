//! NodeId: Unique identifier for Fugue blocks with total ordering
//!
//! NodeId provides the foundation for Fugue's deterministic ordering system.
//! The Ord implementation defines how blocks are ordered in the BTreeMap,
//! which maintains the Fugue CRDT structure.

use serde::{Deserialize, Serialize};
use std::cmp::Ordering;

/// Unique identifier for a Fugue block
///
/// NodeId consists of three components that together provide globally unique
/// identification and deterministic ordering:
///
/// 1. **client_id**: Replica identifier (ensures uniqueness across replicas)
/// 2. **clock**: Lamport timestamp (provides causal ordering)
/// 3. **offset**: Position within batch operation (orders chars in same op)
///
/// # Ordering
///
/// NodeIds are ordered by:
/// 1. Lamport clock (timestamp)
/// 2. Client ID (tiebreaker for concurrent operations)
/// 3. Offset (orders characters within same insertion)
///
/// This ordering is critical for Fugue's correctness - BTreeMap uses it
/// to maintain the proper CRDT structure.
///
/// # Example
///
/// ```rust
/// use synckit_core::crdt::text_fugue::NodeId;
///
/// let id1 = NodeId::new("client1".to_string(), 1, 0);
/// let id2 = NodeId::new("client2".to_string(), 1, 0);
/// let id3 = NodeId::new("client1".to_string(), 2, 0);
///
/// // Same clock → ordered by client_id
/// assert!(id1 < id2);
///
/// // Higher clock → comes after
/// assert!(id3 > id1);
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct NodeId {
    /// Client/replica identifier
    pub client_id: String,

    /// Lamport timestamp (logical clock)
    pub clock: u64,

    /// Offset within batch insertion (0 for first char, 1 for second, etc.)
    pub offset: usize,
}

impl NodeId {
    /// Create a new NodeId
    ///
    /// # Arguments
    ///
    /// * `client_id` - Unique identifier for this replica
    /// * `clock` - Current Lamport timestamp
    /// * `offset` - Position within batch operation (0 for single insertions)
    ///
    /// # Example
    ///
    /// ```rust
    /// use synckit_core::crdt::text_fugue::NodeId;
    ///
    /// let id = NodeId::new("client1".to_string(), 42, 0);
    /// ```
    pub fn new(client_id: String, clock: u64, offset: usize) -> Self {
        Self {
            client_id,
            clock,
            offset,
        }
    }
}

/// Implement total ordering for Fugue algorithm
///
/// This ordering is the heart of Fugue's deterministic convergence.
/// BTreeMap uses this to maintain blocks in Fugue order, which ensures
/// all replicas converge to the same final text regardless of operation
/// order.
///
/// **Ordering rules:**
/// 1. Primary: Compare Lamport clocks (earlier comes first)
/// 2. Tiebreaker 1: Compare client IDs (lexicographic order)
/// 3. Tiebreaker 2: Compare offsets (lower offset first)
impl Ord for NodeId {
    fn cmp(&self, other: &Self) -> Ordering {
        // Phase 1: Compare by Lamport clock (causality)
        match self.clock.cmp(&other.clock) {
            Ordering::Equal => {
                // Phase 2: Tiebreaker by client ID (deterministic)
                match self.client_id.cmp(&other.client_id) {
                    Ordering::Equal => {
                        // Phase 3: Offset for characters within same operation
                        self.offset.cmp(&other.offset)
                    }
                    other => other,
                }
            }
            other => other,
        }
    }
}

impl PartialOrd for NodeId {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl std::fmt::Display for NodeId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}@{}:{}", self.client_id, self.clock, self.offset)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ordering_by_clock() {
        let id1 = NodeId::new("client1".to_string(), 1, 0);
        let id2 = NodeId::new("client1".to_string(), 2, 0);

        assert!(id1 < id2, "Lower clock should come first");
        assert!(id2 > id1, "Higher clock should come after");
    }

    #[test]
    fn test_ordering_by_client_id() {
        let id1 = NodeId::new("client1".to_string(), 1, 0);
        let id2 = NodeId::new("client2".to_string(), 1, 0);

        assert!(
            id1 < id2,
            "Lexicographically earlier client_id should come first"
        );
    }

    #[test]
    fn test_ordering_by_offset() {
        let id1 = NodeId::new("client1".to_string(), 1, 0);
        let id2 = NodeId::new("client1".to_string(), 1, 1);

        assert!(id1 < id2, "Lower offset should come first");
    }

    #[test]
    fn test_equality() {
        let id1 = NodeId::new("client1".to_string(), 1, 0);
        let id2 = NodeId::new("client1".to_string(), 1, 0);

        assert_eq!(id1, id2, "Identical NodeIds should be equal");
    }

    #[test]
    fn test_btreemap_ordering() {
        use std::collections::BTreeMap;

        let mut map = BTreeMap::new();

        // Insert in reverse order
        map.insert(NodeId::new("client1".to_string(), 3, 0), "third");
        map.insert(NodeId::new("client1".to_string(), 1, 0), "first");
        map.insert(NodeId::new("client1".to_string(), 2, 0), "second");

        // BTreeMap should maintain Fugue order
        let values: Vec<_> = map.values().copied().collect();
        assert_eq!(values, vec!["first", "second", "third"]);
    }

    #[test]
    fn test_display() {
        let id = NodeId::new("client1".to_string(), 42, 5);
        assert_eq!(format!("{}", id), "client1@42:5");
    }

    #[test]
    fn test_serialization() {
        let id = NodeId::new("client1".to_string(), 42, 5);

        let json = serde_json::to_string(&id).unwrap();
        let deserialized: NodeId = serde_json::from_str(&json).unwrap();

        assert_eq!(id, deserialized);
    }
}
