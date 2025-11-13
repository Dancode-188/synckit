//! Vector Clock implementation for causality tracking
//!
//! This implementation follows the TLA+ verified specification in
//! protocol/tla/vector_clock.tla
//!
//! Properties verified:
//! - CausalityPreserved: Happens-before relationship is correct
//! - Transitivity: If A→B and B→C, then A→C
//! - Monotonicity: Clock values only increase
//! - ConcurrentDetection: Concurrent operations detected correctly
//! - MergeCorrectness: Clock merging preserves causality

use crate::ClientID;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::HashMap;

/// Vector clock for tracking causality between operations
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VectorClock {
    /// Map from ClientID to logical clock value
    pub clocks: HashMap<ClientID, u64>,
}

impl VectorClock {
    /// Create a new empty vector clock
    pub fn new() -> Self {
        Self {
            clocks: HashMap::new(),
        }
    }
    
    /// Create a VectorClock from a Timestamp
    pub fn from_timestamp(timestamp: &crate::sync::Timestamp) -> Self {
        let mut clock = Self::new();
        clock.clocks.insert(timestamp.client_id.clone(), timestamp.clock);
        clock
    }

    /// Increment the clock for a specific client
    pub fn tick(&mut self, client_id: &ClientID) {
        let counter = self.clocks.entry(client_id.clone()).or_insert(0);
        *counter += 1;
    }

    /// Get the clock value for a specific client
    pub fn get(&self, client_id: &ClientID) -> u64 {
        *self.clocks.get(client_id).unwrap_or(&0)
    }
    
    /// Update the clock for a specific client to a specific value
    pub fn update(&mut self, client_id: &ClientID, value: u64) {
        self.clocks.insert(client_id.clone(), value);
    }
    
    /// Get all client clocks
    pub fn clocks(&self) -> &HashMap<ClientID, u64> {
        &self.clocks
    }

    /// Merge with another vector clock (take max of each entry)
    /// 
    /// This operation is used when receiving remote operations.
    /// It ensures that all causal dependencies are tracked.
    pub fn merge(&mut self, other: &VectorClock) {
        for (client_id, &other_clock) in &other.clocks {
            let entry = self.clocks.entry(client_id.clone()).or_insert(0);
            *entry = (*entry).max(other_clock);
        }
    }

    /// Compare two vector clocks to determine happens-before relationship
    ///
    /// Returns:
    /// - Ordering::Less: self happened before other (self < other)
    /// - Ordering::Greater: other happened before self (self > other)
    /// - Ordering::Equal: clocks are identical (rare in distributed systems)
    ///
    /// Note: This function returns Equal for concurrent events where neither
    /// happened before the other. Use `is_concurrent` to explicitly check.
    pub fn compare(&self, other: &VectorClock) -> Ordering {
        let mut less = false;
        let mut greater = false;

        // Get all unique client IDs from both clocks
        let all_clients: std::collections::HashSet<_> = self
            .clocks
            .keys()
            .chain(other.clocks.keys())
            .collect();

        for client_id in all_clients {
            let self_clock = self.get(client_id);
            let other_clock = other.get(client_id);

            if self_clock < other_clock {
                less = true;
            } else if self_clock > other_clock {
                greater = true;
            }
        }

        match (less, greater) {
            (true, false) => Ordering::Less,     // self < other (happened before)
            (false, true) => Ordering::Greater,  // self > other (happened after)
            (false, false) => Ordering::Equal,   // Identical clocks
            (true, true) => Ordering::Equal,     // Concurrent (neither happened before)
        }
    }

    /// Check if two vector clocks are concurrent (neither happened before the other)
    pub fn is_concurrent(&self, other: &VectorClock) -> bool {
        let mut less = false;
        let mut greater = false;

        let all_clients: std::collections::HashSet<_> = self
            .clocks
            .keys()
            .chain(other.clocks.keys())
            .collect();

        for client_id in all_clients {
            let self_clock = self.get(client_id);
            let other_clock = other.get(client_id);

            if self_clock < other_clock {
                less = true;
            } else if self_clock > other_clock {
                greater = true;
            }
        }

        // Concurrent if we found both less and greater comparisons
        less && greater
    }

    /// Check if self happened before other (self < other)
    pub fn happened_before(&self, other: &VectorClock) -> bool {
        self.compare(other) == Ordering::Less
    }
}

impl Default for VectorClock {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tick() {
        let mut clock = VectorClock::new();
        assert_eq!(clock.get(&"c1".to_string()), 0);

        clock.tick(&"c1".to_string());
        assert_eq!(clock.get(&"c1".to_string()), 1);

        clock.tick(&"c1".to_string());
        assert_eq!(clock.get(&"c1".to_string()), 2);
    }

    #[test]
    fn test_merge() {
        let mut clock1 = VectorClock::new();
        clock1.tick(&"c1".to_string());
        clock1.tick(&"c1".to_string());  // c1: 2

        let mut clock2 = VectorClock::new();
        clock2.tick(&"c2".to_string());
        clock2.tick(&"c2".to_string());
        clock2.tick(&"c2".to_string());  // c2: 3

        // Merge clock2 into clock1
        clock1.merge(&clock2);

        // Should have max of both
        assert_eq!(clock1.get(&"c1".to_string()), 2);
        assert_eq!(clock1.get(&"c2".to_string()), 3);
    }

    #[test]
    fn test_compare_happened_before() {
        let mut clock1 = VectorClock::new();
        clock1.tick(&"c1".to_string());  // {c1: 1}

        let mut clock2 = VectorClock::new();
        clock2.tick(&"c1".to_string());
        clock2.tick(&"c1".to_string());  // {c1: 2}

        // clock1 happened before clock2
        assert_eq!(clock1.compare(&clock2), Ordering::Less);
        assert!(clock1.happened_before(&clock2));

        // clock2 happened after clock1
        assert_eq!(clock2.compare(&clock1), Ordering::Greater);
        assert!(!clock2.happened_before(&clock1));
    }

    #[test]
    fn test_concurrent() {
        let mut clock1 = VectorClock::new();
        clock1.tick(&"c1".to_string());  // {c1: 1}

        let mut clock2 = VectorClock::new();
        clock2.tick(&"c2".to_string());  // {c2: 1}

        // These are concurrent (neither happened before the other)
        assert!(clock1.is_concurrent(&clock2));
        assert!(clock2.is_concurrent(&clock1));

        // compare returns Equal for concurrent clocks
        assert_eq!(clock1.compare(&clock2), Ordering::Equal);
    }

    #[test]
    fn test_identical_clocks() {
        let mut clock1 = VectorClock::new();
        clock1.tick(&"c1".to_string());

        let mut clock2 = VectorClock::new();
        clock2.tick(&"c1".to_string());

        // Identical clocks
        assert_eq!(clock1.compare(&clock2), Ordering::Equal);
        assert!(!clock1.is_concurrent(&clock2));  // Not concurrent, just equal
    }

    #[test]
    fn test_merge_preserves_causality() {
        // Test the MergeCorrectness property from TLA+
        let mut clock_a = VectorClock::new();
        clock_a.tick(&"c1".to_string());

        let mut clock_b = VectorClock::new();
        clock_b.tick(&"c2".to_string());

        let mut clock_merged = clock_a.clone();
        clock_merged.merge(&clock_b);

        // Merged clock should be >= both inputs
        assert!(clock_merged.compare(&clock_a) != Ordering::Less);
        assert!(clock_merged.compare(&clock_b) != Ordering::Less);
    }
}
