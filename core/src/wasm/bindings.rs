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

    /// Get the text content as a string
    #[wasm_bindgen(js_name = toString)]
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
