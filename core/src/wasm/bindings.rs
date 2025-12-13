//! JavaScript bindings for SyncKit core types

use crate::document::Document;
use crate::sync::VectorClock;
use wasm_bindgen::prelude::*;

// DocumentDelta is only available with protocol support
#[cfg(feature = "prost")]
use crate::protocol::delta::DocumentDelta;

/// JavaScript-friendly wrapper for Document
#[wasm_bindgen]
pub struct WasmDocument {
    inner: Document,
}

#[wasm_bindgen]
impl WasmDocument {
    /// Create a new document with the given ID
    #[wasm_bindgen(constructor)]
    pub fn new(id: String) -> Self {
        Self {
            inner: Document::new(id),
        }
    }

    /// Set a field value (pass JSON string for value)
    #[wasm_bindgen(js_name = setField)]
    pub fn set_field(
        &mut self,
        path: String,
        value_json: String,
        clock: u64,
        client_id: String,
    ) -> Result<(), JsValue> {
        let value: serde_json::Value = serde_json::from_str(&value_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid JSON: {}", e)))?;

        self.inner.set_field(path, value, clock, client_id);
        Ok(())
    }

    /// Get a field value (returns JSON string)
    #[wasm_bindgen(js_name = getField)]
    pub fn get_field(&self, path: String) -> Option<String> {
        self.inner
            .get_field(&path)
            .map(|field| serde_json::to_string(&field).unwrap())
    }

    /// Delete a field
    #[wasm_bindgen(js_name = deleteField)]
    pub fn delete_field(&mut self, path: String) {
        self.inner.delete_field(&path);
    }

    /// Get document ID
    #[wasm_bindgen(js_name = getId)]
    pub fn get_id(&self) -> String {
        self.inner.id().clone()
    }

    /// Get field count
    #[wasm_bindgen(js_name = fieldCount)]
    pub fn field_count(&self) -> usize {
        self.inner.field_count()
    }

    /// Export document as JSON string
    #[wasm_bindgen(js_name = toJSON)]
    pub fn to_json(&self) -> String {
        serde_json::to_string(&self.inner.to_json()).unwrap()
    }

    /// Merge with another document
    #[wasm_bindgen(js_name = merge)]
    pub fn merge(&mut self, other: &WasmDocument) {
        self.inner.merge(&other.inner);
    }
}

/// JavaScript-friendly wrapper for VectorClock
#[wasm_bindgen]
pub struct WasmVectorClock {
    inner: VectorClock,
}

impl Default for WasmVectorClock {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl WasmVectorClock {
    /// Create a new empty vector clock
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: VectorClock::new(),
        }
    }

    /// Increment clock for a client
    #[wasm_bindgen(js_name = tick)]
    pub fn tick(&mut self, client_id: String) {
        self.inner.tick(&client_id);
    }

    /// Update clock for a client
    #[wasm_bindgen(js_name = update)]
    pub fn update(&mut self, client_id: String, clock: u64) {
        self.inner.update(&client_id, clock);
    }

    /// Get clock value for a client
    #[wasm_bindgen(js_name = get)]
    pub fn get(&self, client_id: String) -> u64 {
        self.inner.get(&client_id)
    }

    /// Merge with another vector clock
    #[wasm_bindgen(js_name = merge)]
    pub fn merge(&mut self, other: &WasmVectorClock) {
        self.inner.merge(&other.inner);
    }

    /// Export as JSON string
    #[wasm_bindgen(js_name = toJSON)]
    pub fn to_json(&self) -> String {
        serde_json::to_string(&self.inner).unwrap()
    }
}

/// JavaScript-friendly wrapper for DocumentDelta
/// Only available when protocol support is enabled (core variant, not core-lite)
#[cfg(feature = "prost")]
#[wasm_bindgen]
pub struct WasmDelta {
    inner: DocumentDelta,
}

#[cfg(feature = "prost")]
#[wasm_bindgen]
impl WasmDelta {
    /// Compute delta between two documents
    #[wasm_bindgen(js_name = compute)]
    pub fn compute(from: &WasmDocument, to: &WasmDocument) -> Result<WasmDelta, JsValue> {
        DocumentDelta::compute(&from.inner, &to.inner)
            .map(|delta| WasmDelta { inner: delta })
            .map_err(|e| JsValue::from_str(&format!("Delta computation failed: {}", e)))
    }

    /// Apply delta to a document
    #[wasm_bindgen(js_name = applyTo)]
    pub fn apply_to(&self, document: &mut WasmDocument, client_id: String) -> Result<(), JsValue> {
        self.inner
            .apply_to(&mut document.inner, &client_id)
            .map_err(|e| JsValue::from_str(&format!("Delta application failed: {}", e)))
    }

    /// Get document ID this delta applies to
    #[wasm_bindgen(js_name = getDocumentId)]
    pub fn get_document_id(&self) -> String {
        self.inner.document_id.clone()
    }

    /// Get number of changes in this delta
    #[wasm_bindgen(js_name = changeCount)]
    pub fn change_count(&self) -> usize {
        self.inner.changes.len()
    }

    /// Export as JSON string
    #[wasm_bindgen(js_name = toJSON)]
    pub fn to_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner)
            .map_err(|e| JsValue::from_str(&format!("JSON serialization failed: {}", e)))
    }
}

/// JavaScript-friendly wrapper for FugueText CRDT
/// Only available when text-crdt feature is enabled
#[cfg(feature = "text-crdt")]
#[wasm_bindgen]
pub struct WasmFugueText {
    inner: crate::crdt::FugueText,
}

#[cfg(feature = "text-crdt")]
#[wasm_bindgen]
impl WasmFugueText {
    /// Create a new FugueText with the given client ID
    #[wasm_bindgen(constructor)]
    pub fn new(client_id: String) -> Self {
        Self {
            inner: crate::crdt::FugueText::new(client_id),
        }
    }

    /// Insert text at the given position
    ///
    /// # Arguments
    /// * `position` - Grapheme index (user-facing position)
    /// * `text` - Text to insert
    ///
    /// # Returns
    /// JSON string of NodeId for the created block
    #[wasm_bindgen(js_name = insert)]
    pub fn insert(&mut self, position: usize, text: String) -> Result<String, JsValue> {
        let node_id = self
            .inner
            .insert(position, &text)
            .map_err(|e| JsValue::from_str(&format!("Insert failed: {}", e)))?;

        serde_json::to_string(&node_id)
            .map_err(|e| JsValue::from_str(&format!("JSON serialization failed: {}", e)))
    }

    /// Delete text at the given position
    ///
    /// # Arguments
    /// * `position` - Starting grapheme index
    /// * `length` - Number of graphemes to delete
    ///
    /// # Returns
    /// JSON string of array of deleted NodeIds
    #[wasm_bindgen(js_name = delete)]
    pub fn delete(&mut self, position: usize, length: usize) -> Result<String, JsValue> {
        let deleted_ids = self
            .inner
            .delete(position, length)
            .map_err(|e| JsValue::from_str(&format!("Delete failed: {}", e)))?;

        serde_json::to_string(&deleted_ids)
            .map_err(|e| JsValue::from_str(&format!("JSON serialization failed: {}", e)))
    }

    /// Get the NodeId of the character at the given position
    ///
    /// Returns a stable NodeId that identifies the character at the specified
    /// position. Critical for Peritext format spans that need stable character
    /// identifiers that don't shift when text is edited.
    ///
    /// # Arguments
    /// * `position` - Grapheme index of the character
    ///
    /// # Returns
    /// JSON string of NodeId (format: {client_id, clock, offset})
    ///
    /// # Example
    /// ```javascript
    /// const text = new WasmFugueText("client1");
    /// text.insert(0, "Hello");
    /// const nodeId = text.getNodeIdAtPosition(2);
    /// // Returns: '{"client_id":"client1","clock":1,"offset":2}'
    /// ```
    #[wasm_bindgen(js_name = getNodeIdAtPosition)]
    pub fn get_node_id_at_position(&mut self, position: usize) -> Result<String, JsValue> {
        let node_id = self
            .inner
            .get_node_id_at_position(position)
            .map_err(|e| JsValue::from_str(&format!("Get NodeId failed: {}", e)))?;

        serde_json::to_string(&node_id)
            .map_err(|e| JsValue::from_str(&format!("JSON serialization failed: {}", e)))
    }

    /// Get the current position of a character identified by NodeId
    ///
    /// This is the reverse of `getNodeIdAtPosition`. Given a stable NodeId,
    /// returns the character's current position in the text. Returns -1 if
    /// the character doesn't exist (e.g., was deleted).
    ///
    /// # Arguments
    /// * `node_id_json` - JSON string of NodeId (format: {client_id, clock, offset})
    ///
    /// # Returns
    /// Current position (0-based index), or -1 if character doesn't exist
    ///
    /// # Example
    /// ```javascript
    /// const nodeId = '{"client_id":"client1","clock":1,"offset":2}';
    /// const position = text.getPositionOfNodeId(nodeId);
    /// // Returns: 2 (or -1 if deleted)
    /// ```
    #[wasm_bindgen(js_name = getPositionOfNodeId)]
    pub fn get_position_of_node_id(&mut self, node_id_json: &str) -> Result<i32, JsValue> {
        let node_id: crate::crdt::text_fugue::NodeId = serde_json::from_str(node_id_json)
            .map_err(|e| JsValue::from_str(&format!("JSON parse failed: {}", e)))?;

        match self.inner.get_position_of_node_id(&node_id) {
            Some(pos) => Ok(pos as i32),
            None => Ok(-1), // Character doesn't exist (deleted)
        }
    }

    /// Get the text content as a string
    #[wasm_bindgen(js_name = toString)]
    #[allow(clippy::inherent_to_string)]
    pub fn to_string(&self) -> String {
        self.inner.to_string()
    }

    /// Get the length in graphemes (user-perceived characters)
    #[wasm_bindgen(js_name = length)]
    pub fn length(&self) -> usize {
        self.inner.len()
    }

    /// Check if the text is empty
    #[wasm_bindgen(js_name = isEmpty)]
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Get the client ID
    #[wasm_bindgen(js_name = getClientId)]
    pub fn get_client_id(&self) -> String {
        self.inner.client_id().to_string()
    }

    /// Get the current Lamport clock value
    #[wasm_bindgen(js_name = getClock)]
    pub fn get_clock(&self) -> u64 {
        self.inner.clock()
    }

    /// Merge with another FugueText
    #[wasm_bindgen(js_name = merge)]
    pub fn merge(&mut self, other: &WasmFugueText) -> Result<(), JsValue> {
        self.inner
            .merge(&other.inner)
            .map_err(|e| JsValue::from_str(&format!("Merge failed: {}", e)))
    }

    /// Export as JSON string (for persistence/network)
    #[wasm_bindgen(js_name = toJSON)]
    pub fn to_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner)
            .map_err(|e| JsValue::from_str(&format!("JSON serialization failed: {}", e)))
    }

    /// Import from JSON string (for loading from persistence/network)
    #[wasm_bindgen(js_name = fromJSON)]
    pub fn from_json(json: String) -> Result<WasmFugueText, JsValue> {
        let inner: crate::crdt::FugueText = serde_json::from_str(&json)
            .map_err(|e| JsValue::from_str(&format!("JSON deserialization failed: {}", e)))?;

        Ok(Self { inner })
    }
}

/// JavaScript-friendly wrapper for PNCounter CRDT
/// Only available when counters feature is enabled
#[cfg(feature = "counters")]
#[wasm_bindgen]
pub struct WasmCounter {
    inner: crate::crdt::PNCounter,
}

#[cfg(feature = "counters")]
#[wasm_bindgen]
impl WasmCounter {
    /// Create a new PNCounter with the given replica ID
    #[wasm_bindgen(constructor)]
    pub fn new(replica_id: String) -> Self {
        Self {
            inner: crate::crdt::PNCounter::new(replica_id),
        }
    }

    /// Increment the counter
    ///
    /// # Arguments
    /// * `amount` - Amount to increment (defaults to 1 if not provided)
    #[wasm_bindgen(js_name = increment)]
    pub fn increment(&mut self, amount: Option<f64>) {
        self.inner.increment(amount.unwrap_or(1.0) as i64);
    }

    /// Decrement the counter
    ///
    /// # Arguments
    /// * `amount` - Amount to decrement (defaults to 1 if not provided)
    #[wasm_bindgen(js_name = decrement)]
    pub fn decrement(&mut self, amount: Option<f64>) {
        self.inner.decrement(amount.unwrap_or(1.0) as i64);
    }

    /// Get the current counter value
    #[wasm_bindgen(js_name = value)]
    pub fn value(&self) -> f64 {
        self.inner.value() as f64
    }

    /// Get the replica ID
    #[wasm_bindgen(js_name = getReplicaId)]
    pub fn get_replica_id(&self) -> String {
        self.inner.replica_id().clone()
    }

    /// Merge with another counter
    #[wasm_bindgen(js_name = merge)]
    pub fn merge(&mut self, other: &WasmCounter) {
        self.inner.merge(&other.inner);
    }

    /// Reset the counter to zero (local operation)
    #[wasm_bindgen(js_name = reset)]
    pub fn reset(&mut self) {
        self.inner.reset();
    }

    /// Export as JSON string
    #[wasm_bindgen(js_name = toJSON)]
    pub fn to_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner)
            .map_err(|e| JsValue::from_str(&format!("JSON serialization failed: {}", e)))
    }

    /// Import from JSON string
    #[wasm_bindgen(js_name = fromJSON)]
    pub fn from_json(json: String) -> Result<WasmCounter, JsValue> {
        let inner: crate::crdt::PNCounter = serde_json::from_str(&json)
            .map_err(|e| JsValue::from_str(&format!("JSON deserialization failed: {}", e)))?;

        Ok(Self { inner })
    }
}

/// JavaScript-friendly wrapper for ORSet CRDT
/// Only available when sets feature is enabled
#[cfg(feature = "sets")]
#[wasm_bindgen]
pub struct WasmSet {
    inner: crate::crdt::ORSet<String>,
}

#[cfg(feature = "sets")]
#[wasm_bindgen]
impl WasmSet {
    /// Create a new ORSet with the given replica ID
    #[wasm_bindgen(constructor)]
    pub fn new(replica_id: String) -> Self {
        Self {
            inner: crate::crdt::ORSet::new(replica_id),
        }
    }

    /// Add an element to the set
    ///
    /// # Arguments
    /// * `value` - Element to add
    #[wasm_bindgen(js_name = add)]
    pub fn add(&mut self, value: String) {
        self.inner.add(value);
    }

    /// Remove an element from the set
    ///
    /// # Arguments
    /// * `value` - Element to remove
    #[wasm_bindgen(js_name = remove)]
    pub fn remove(&mut self, value: String) {
        self.inner.remove(&value);
    }

    /// Check if the set contains an element
    ///
    /// # Arguments
    /// * `value` - Element to check
    #[wasm_bindgen(js_name = has)]
    pub fn has(&mut self, value: String) -> bool {
        self.inner.contains(&value)
    }

    /// Get the number of elements in the set
    #[wasm_bindgen(js_name = size)]
    pub fn size(&self) -> usize {
        self.inner.len()
    }

    /// Check if the set is empty
    #[wasm_bindgen(js_name = isEmpty)]
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Get all values in the set as a JSON array string
    #[wasm_bindgen(js_name = values)]
    pub fn values(&self) -> Result<String, JsValue> {
        let values: Vec<_> = self.inner.iter().collect();
        serde_json::to_string(&values)
            .map_err(|e| JsValue::from_str(&format!("JSON serialization failed: {}", e)))
    }

    /// Clear all elements from the set
    #[wasm_bindgen(js_name = clear)]
    pub fn clear(&mut self) {
        self.inner.clear();
    }

    /// Merge with another set
    #[wasm_bindgen(js_name = merge)]
    pub fn merge(&mut self, other: &WasmSet) {
        self.inner.merge(&other.inner);
    }

    /// Export as JSON string
    #[wasm_bindgen(js_name = toJSON)]
    pub fn to_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner)
            .map_err(|e| JsValue::from_str(&format!("JSON serialization failed: {}", e)))
    }

    /// Import from JSON string
    #[wasm_bindgen(js_name = fromJSON)]
    pub fn from_json(json: String) -> Result<WasmSet, JsValue> {
        let inner: crate::crdt::ORSet<String> = serde_json::from_str(&json)
            .map_err(|e| JsValue::from_str(&format!("JSON deserialization failed: {}", e)))?;

        Ok(Self { inner })
    }
}
/// JavaScript-friendly wrapper for Awareness
#[wasm_bindgen]
pub struct WasmAwareness {
    inner: crate::awareness::Awareness,
}

#[wasm_bindgen]
impl WasmAwareness {
    /// Create a new awareness instance
    #[wasm_bindgen(constructor)]
    pub fn new(client_id: String) -> Self {
        Self {
            inner: crate::awareness::Awareness::new(client_id),
        }
    }

    /// Get the local client ID
    #[wasm_bindgen(js_name = getClientId)]
    pub fn get_client_id(&self) -> String {
        self.inner.client_id().to_string()
    }

    /// Set local client state (pass JSON string)
    #[wasm_bindgen(js_name = setLocalState)]
    pub fn set_local_state(&mut self, state_json: String) -> Result<String, JsValue> {
        let state: serde_json::Value = serde_json::from_str(&state_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid JSON: {}", e)))?;

        let update = self.inner.set_local_state(state);

        serde_json::to_string(&update)
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))
    }

    /// Apply remote awareness update (pass JSON string)
    #[wasm_bindgen(js_name = applyUpdate)]
    pub fn apply_update(&mut self, update_json: String) -> Result<(), JsValue> {
        let update: crate::awareness::AwarenessUpdate = serde_json::from_str(&update_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid update JSON: {}", e)))?;

        self.inner.apply_update(update);
        Ok(())
    }

    /// Get all client states as JSON string
    #[wasm_bindgen(js_name = getStates)]
    pub fn get_states(&self) -> Result<String, JsValue> {
        serde_json::to_string(self.inner.get_states())
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))
    }

    /// Get state for specific client as JSON string
    #[wasm_bindgen(js_name = getState)]
    pub fn get_state(&self, client_id: String) -> Result<Option<String>, JsValue> {
        match self.inner.get_state(&client_id) {
            Some(state) => serde_json::to_string(state)
                .map(Some)
                .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e))),
            None => Ok(None),
        }
    }

    /// Get local client's state as JSON string
    #[wasm_bindgen(js_name = getLocalState)]
    pub fn get_local_state(&self) -> Result<Option<String>, JsValue> {
        match self.inner.get_local_state() {
            Some(state) => serde_json::to_string(state)
                .map(Some)
                .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e))),
            None => Ok(None),
        }
    }

    /// Remove stale clients (timeout in milliseconds)
    /// Returns JSON array of removed client IDs
    #[wasm_bindgen(js_name = removeStaleClients)]
    pub fn remove_stale_clients(&mut self, timeout_ms: u64) -> Result<String, JsValue> {
        #[cfg(not(target_arch = "wasm32"))]
        let removed = {
            let timeout = std::time::Duration::from_millis(timeout_ms);
            self.inner.remove_stale_clients(timeout)
        };

        #[cfg(target_arch = "wasm32")]
        let removed = self.inner.remove_stale_clients(timeout_ms);

        serde_json::to_string(&removed)
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))
    }

    /// Create update to signal leaving
    #[wasm_bindgen(js_name = createLeaveUpdate)]
    pub fn create_leave_update(&self) -> Result<String, JsValue> {
        let update = self.inner.create_leave_update();

        serde_json::to_string(&update)
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))
    }

    /// Get number of online clients
    #[wasm_bindgen(js_name = clientCount)]
    pub fn client_count(&self) -> usize {
        self.inner.client_count()
    }

    /// Get number of other clients (excluding self)
    #[wasm_bindgen(js_name = otherClientCount)]
    pub fn other_client_count(&self) -> usize {
        self.inner.other_client_count()
    }
}
