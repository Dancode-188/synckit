/// Increasing Clock for Awareness Conflict Resolution
///
/// Unlike vector clocks (used for CRDTs), awareness uses a simple
/// monotonically increasing clock per client. This is sufficient because:
/// - Awareness state is ephemeral (no complex merge semantics)
/// - Last-write-wins at field level is acceptable
/// - Simpler = faster for high-frequency updates (cursor positions)
use std::sync::atomic::{AtomicU64, Ordering};

/// Thread-safe increasing clock
#[derive(Debug)]
pub struct IncreasingClock {
    value: AtomicU64,
}

impl IncreasingClock {
    /// Create a new clock starting at 0
    pub fn new() -> Self {
        Self {
            value: AtomicU64::new(0),
        }
    }

    /// Increment and return the new value
    pub fn increment(&self) -> u64 {
        self.value.fetch_add(1, Ordering::SeqCst) + 1
    }

    /// Get current value without incrementing
    pub fn get(&self) -> u64 {
        self.value.load(Ordering::SeqCst)
    }

    /// Set to a specific value (used when receiving remote updates)
    pub fn set(&self, value: u64) {
        self.value.store(value, Ordering::SeqCst);
    }

    /// Update to max of current and provided value
    /// (ensures monotonicity when receiving updates)
    pub fn update_to_max(&self, other: u64) {
        self.value.fetch_max(other, Ordering::SeqCst);
    }
}

impl Default for IncreasingClock {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for IncreasingClock {
    fn clone(&self) -> Self {
        Self {
            value: AtomicU64::new(self.get()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clock_increment() {
        let clock = IncreasingClock::new();
        assert_eq!(clock.get(), 0);
        assert_eq!(clock.increment(), 1);
        assert_eq!(clock.increment(), 2);
        assert_eq!(clock.get(), 2);
    }

    #[test]
    fn test_clock_update_to_max() {
        let clock = IncreasingClock::new();
        clock.set(5);
        clock.update_to_max(3); // Should not decrease
        assert_eq!(clock.get(), 5);
        clock.update_to_max(10); // Should increase
        assert_eq!(clock.get(), 10);
    }
}
