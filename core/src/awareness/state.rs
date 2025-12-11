/// Awareness State Management
///
/// Tracks ephemeral state for all connected clients.
/// State is stored as arbitrary JSON and merged at the field level.
use super::clock::IncreasingClock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// Time tracking only available on non-WASM targets
#[cfg(not(target_arch = "wasm32"))]
use std::time::{Duration, Instant};

/// Awareness state for a single client
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AwarenessState {
    /// Client identifier
    pub client_id: String,

    /// Arbitrary JSON state (user info, cursor, selection, etc.)
    pub state: serde_json::Value,

    /// Logical clock for conflict resolution
    pub clock: u64,

    /// Last update timestamp (for timeout detection)
    /// Not available in WASM builds
    #[cfg(not(target_arch = "wasm32"))]
    #[serde(skip)]
    pub last_updated: Option<Instant>,
}

/// Update message for awareness state changes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AwarenessUpdate {
    pub client_id: String,
    pub state: Option<serde_json::Value>, // None = client left
    pub clock: u64,
}

/// Awareness manager tracking all client states
#[derive(Debug)]
pub struct Awareness {
    client_id: String,
    states: HashMap<String, AwarenessState>,
    clock: IncreasingClock,
}

impl Awareness {
    /// Create new awareness instance
    pub fn new(client_id: String) -> Self {
        Self {
            client_id,
            states: HashMap::new(),
            clock: IncreasingClock::new(),
        }
    }

    /// Get the local client ID
    pub fn client_id(&self) -> &str {
        &self.client_id
    }

    /// Get all current client states
    pub fn get_states(&self) -> &HashMap<String, AwarenessState> {
        &self.states
    }

    /// Get state for a specific client
    pub fn get_state(&self, client_id: &str) -> Option<&AwarenessState> {
        self.states.get(client_id)
    }

    /// Get local client's state
    pub fn get_local_state(&self) -> Option<&AwarenessState> {
        self.get_state(&self.client_id)
    }

    /// Set local client's state (returns update to broadcast)
    pub fn set_local_state(&mut self, state: serde_json::Value) -> AwarenessUpdate {
        let clock = self.clock.increment();

        let awareness_state = AwarenessState {
            client_id: self.client_id.clone(),
            state: state.clone(),
            clock,
            #[cfg(not(target_arch = "wasm32"))]
            last_updated: Some(Instant::now()),
        };

        self.states.insert(self.client_id.clone(), awareness_state);

        AwarenessUpdate {
            client_id: self.client_id.clone(),
            state: Some(state),
            clock,
        }
    }

    /// Apply remote awareness update
    pub fn apply_update(&mut self, update: AwarenessUpdate) {
        // Update our clock to maintain monotonicity
        self.clock.update_to_max(update.clock);

        match update.state {
            Some(state) => {
                // Client is online with new state
                let should_update = self
                    .states
                    .get(&update.client_id)
                    .map(|existing| update.clock > existing.clock)
                    .unwrap_or(true);

                if should_update {
                    self.states.insert(
                        update.client_id.clone(),
                        AwarenessState {
                            client_id: update.client_id,
                            state,
                            clock: update.clock,
                            #[cfg(not(target_arch = "wasm32"))]
                            last_updated: Some(Instant::now()),
                        },
                    );
                }
            }
            None => {
                // Client left gracefully
                self.states.remove(&update.client_id);
            }
        }
    }

    /// Remove clients that haven't updated within timeout
    /// Returns list of removed client IDs
    #[cfg(not(target_arch = "wasm32"))]
    pub fn remove_stale_clients(&mut self, timeout: Duration) -> Vec<String> {
        let now = Instant::now();
        let mut removed = Vec::new();

        self.states.retain(|client_id, state| {
            if let Some(last_updated) = state.last_updated {
                if now.duration_since(last_updated) > timeout {
                    removed.push(client_id.clone());
                    return false;
                }
            }
            true
        });

        removed
    }

    /// Remove clients that haven't updated within timeout
    /// Returns list of removed client IDs
    /// WASM version: No-op since time tracking is not available
    #[cfg(target_arch = "wasm32")]
    pub fn remove_stale_clients(&mut self, _timeout_ms: u64) -> Vec<String> {
        // Time tracking not available in WASM
        // Stale client removal should be handled server-side
        Vec::new()
    }

    /// Create update to signal local client leaving
    pub fn create_leave_update(&self) -> AwarenessUpdate {
        AwarenessUpdate {
            client_id: self.client_id.clone(),
            state: None,
            clock: self.clock.increment(),
        }
    }

    /// Get number of online clients (including self)
    pub fn client_count(&self) -> usize {
        self.states.len()
    }

    /// Get number of online clients excluding self
    pub fn other_client_count(&self) -> usize {
        self.states
            .len()
            .saturating_sub(if self.states.contains_key(&self.client_id) {
                1
            } else {
                0
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_set_local_state() {
        let mut awareness = Awareness::new("client-1".to_string());

        let state = json!({
            "name": "Alice",
            "color": "#FF0000",
        });

        let update = awareness.set_local_state(state.clone());

        assert_eq!(update.client_id, "client-1");
        assert_eq!(update.state, Some(state));
        assert_eq!(update.clock, 1);
        assert_eq!(awareness.client_count(), 1);
    }

    #[test]
    fn test_apply_remote_update() {
        let mut awareness = Awareness::new("client-1".to_string());

        let update = AwarenessUpdate {
            client_id: "client-2".to_string(),
            state: Some(json!({"name": "Bob"})),
            clock: 5,
        };

        awareness.apply_update(update);

        assert_eq!(awareness.client_count(), 1);
        assert!(awareness.get_state("client-2").is_some());
    }

    #[test]
    fn test_clock_monotonicity() {
        let mut awareness = Awareness::new("client-1".to_string());

        // Apply update with high clock value
        let update = AwarenessUpdate {
            client_id: "client-2".to_string(),
            state: Some(json!({})),
            clock: 100,
        };
        awareness.apply_update(update);

        // Local clock should be at least 100
        let local_update = awareness.set_local_state(json!({}));
        assert!(local_update.clock > 100);
    }

    #[test]
    fn test_client_leaving() {
        let mut awareness = Awareness::new("client-1".to_string());

        // Add a client
        awareness.apply_update(AwarenessUpdate {
            client_id: "client-2".to_string(),
            state: Some(json!({"name": "Bob"})),
            clock: 1,
        });
        assert_eq!(awareness.client_count(), 1);

        // Client leaves
        awareness.apply_update(AwarenessUpdate {
            client_id: "client-2".to_string(),
            state: None,
            clock: 2,
        });
        assert_eq!(awareness.client_count(), 0);
    }

    #[test]
    fn test_other_client_count() {
        let mut awareness = Awareness::new("client-1".to_string());

        // Add self
        awareness.set_local_state(json!({}));
        assert_eq!(awareness.other_client_count(), 0);

        // Add another client
        awareness.apply_update(AwarenessUpdate {
            client_id: "client-2".to_string(),
            state: Some(json!({})),
            clock: 1,
        });
        assert_eq!(awareness.other_client_count(), 1);
    }
}
