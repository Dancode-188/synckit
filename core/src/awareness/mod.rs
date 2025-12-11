mod clock;
/// Awareness Protocol - Ephemeral user presence and state
///
/// Unlike CRDTs which persist data, Awareness tracks ephemeral state like:
/// - Who's online
/// - Cursor positions
/// - User selections
/// - Custom presence data
///
/// Key differences from Document sync:
/// - No persistence (in-memory only)
/// - 30-second timeout for offline detection
/// - Simpler conflict resolution (increasing clock, not vector clocks)
/// - Separate broadcast channel (doesn't mix with CRDT operations)
mod state;

pub use clock::IncreasingClock;
pub use state::{Awareness, AwarenessState, AwarenessUpdate};

use std::time::Duration;

/// Default timeout for marking clients offline
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);

/// Heartbeat interval (send update even if no changes)
pub const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(10);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_awareness_creation() {
        let awareness = Awareness::new("client-1".to_string());
        assert_eq!(awareness.client_id(), "client-1");
        assert!(awareness.get_states().is_empty());
    }
}
