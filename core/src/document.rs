//! Document structure with field-level Last-Write-Wins
//!
//! This implementation follows the TLA+ verified specification in
//! protocol/tla/lww_merge.tla
//!
//! Properties verified:
//! - Convergence: All replicas reach identical state
//! - Determinism: Same inputs always produce same output
//! - Idempotence: Applying operation twice has no effect
//! - Commutativity: Order of merges doesn't matter

use crate::{ClientID, DocumentID, FieldPath};
use crate::sync::{Timestamp, VectorClock};
// TODO: Will be used when implementing full error handling
// use crate::error::{Result, SyncError};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashMap;

/// A document with field-level LWW conflict resolution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    /// Unique document identifier
    pub id: DocumentID,
    
    /// Document fields with LWW metadata
    pub fields: HashMap<FieldPath, Field>,
    
    /// Vector clock for causality tracking
    pub version: VectorClock,
}

/// A single field with LWW metadata
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Field {
    /// Field value (JSON-like)
    pub value: JsonValue,
    
    /// Timestamp for LWW conflict resolution
    pub timestamp: Timestamp,
}

impl Document {
    /// Create a new empty document
    pub fn new(id: DocumentID) -> Self {
        Self {
            id,
            fields: HashMap::new(),
            version: VectorClock::new(),
        }
    }

    /// Set a field value (creates new timestamp)
    /// 
    /// This method uses LWW merge logic, so if there's already a value
    /// with a newer timestamp, it won't be overwritten.
    pub fn set_field(
        &mut self,
        field_path: FieldPath,
        value: JsonValue,
        clock: u64,
        client_id: ClientID,
    ) {
        let timestamp = Timestamp::new(clock, client_id);
        let new_field = Field { value, timestamp };
        
        // Use merge_field to respect LWW semantics
        self.merge_field(field_path, new_field);
    }

    /// Get a field value
    pub fn get_field(&self, field_path: &FieldPath) -> Option<&JsonValue> {
        self.fields.get(field_path).map(|f| &f.value)
    }

    /// Merge a remote field using LWW algorithm
    ///
    /// This is the core LWW merge algorithm verified by TLA+.
    /// Returns true if the local field was updated.
    ///
    /// Comparison order:
    /// 1. Higher timestamp wins
    /// 2. If timestamps equal, higher client_id wins
    /// 3. If both equal (duplicate), use value comparison for determinism
    pub fn merge_field(
        &mut self,
        field_path: FieldPath,
        remote_field: Field,
    ) -> bool {
        match self.fields.get(&field_path) {
            Some(local_field) => {
                // Compare timestamps for LWW
                match remote_field.timestamp.compare_lww(&local_field.timestamp) {
                    std::cmp::Ordering::Greater => {
                        // Remote wins (newer timestamp or higher client_id)
                        self.fields.insert(field_path, remote_field);
                        true
                    }
                    std::cmp::Ordering::Less => {
                        // Local wins (newer timestamp or higher client_id)
                        false
                    }
                    std::cmp::Ordering::Equal => {
                        // Exact same timestamp - use value comparison for determinism
                        // This handles the edge case where same client writes same timestamp
                        // with different values (which shouldn't happen in practice, but
                        // we handle it for total ordering)
                        let local_json = serde_json::to_string(&local_field.value).unwrap();
                        let remote_json = serde_json::to_string(&remote_field.value).unwrap();
                        
                        if remote_json > local_json {
                            self.fields.insert(field_path, remote_field);
                            true
                        } else {
                            // Keep local (or keep existing if values are also equal)
                            false
                        }
                    }
                }
            }
            None => {
                // No local value, remote wins
                self.fields.insert(field_path, remote_field);
                true
            }
        }
    }

    /// Merge an entire remote document
    ///
    /// Merges all fields and vector clocks.
    /// Returns the number of fields updated.
    pub fn merge(&mut self, remote: &Document) -> usize {
        let mut updated_count = 0;

        // Merge each remote field
        for (field_path, remote_field) in &remote.fields {
            if self.merge_field(field_path.clone(), remote_field.clone()) {
                updated_count += 1;
            }
        }

        // Merge vector clocks
        self.version.merge(&remote.version);

        updated_count
    }

    /// Convert document to JSON for serialization
    pub fn to_json(&self) -> JsonValue {
        let mut obj = serde_json::Map::new();
        
        for (field_path, field) in &self.fields {
            obj.insert(field_path.clone(), field.value.clone());
        }
        
        JsonValue::Object(obj)
    }

    /// Get all field paths
    pub fn field_paths(&self) -> Vec<&FieldPath> {
        self.fields.keys().collect()
    }

    /// Check if document has any fields
    pub fn is_empty(&self) -> bool {
        self.fields.is_empty()
    }

    /// Get number of fields
    pub fn field_count(&self) -> usize {
        self.fields.len()
    }
    
    /// Get document ID
    pub fn id(&self) -> &DocumentID {
        &self.id
    }
    
    /// Get document version (vector clock)
    pub fn version(&self) -> &VectorClock {
        &self.version
    }
    
    /// Get all fields with metadata
    pub fn fields(&self) -> &HashMap<FieldPath, Field> {
        &self.fields
    }
    
    /// Delete a field
    pub fn delete_field(&mut self, field_path: &FieldPath) {
        self.fields.remove(field_path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_document_creation() {
        let doc = Document::new("doc-123".to_string());
        assert_eq!(doc.id, "doc-123");
        assert!(doc.is_empty());
    }

    #[test]
    fn test_set_and_get_field() {
        let mut doc = Document::new("doc-123".to_string());
        
        doc.set_field(
            "title".to_string(),
            json!("Hello World"),
            1,
            "client1".to_string(),
        );

        assert_eq!(doc.get_field(&"title".to_string()), Some(&json!("Hello World")));
        assert_eq!(doc.field_count(), 1);
    }

    #[test]
    fn test_lww_merge_remote_wins() {
        let mut doc = Document::new("doc-123".to_string());
        
        // Local writes at timestamp 1
        doc.set_field(
            "title".to_string(),
            json!("Local Title"),
            1,
            "client1".to_string(),
        );

        // Remote writes at timestamp 2 (newer)
        let remote_field = Field {
            value: json!("Remote Title"),
            timestamp: Timestamp::new(2, "client2".to_string()),
        };

        let updated = doc.merge_field("title".to_string(), remote_field);

        assert!(updated);
        assert_eq!(doc.get_field(&"title".to_string()), Some(&json!("Remote Title")));
    }

    #[test]
    fn test_lww_merge_local_wins() {
        let mut doc = Document::new("doc-123".to_string());
        
        // Local writes at timestamp 2
        doc.set_field(
            "title".to_string(),
            json!("Local Title"),
            2,
            "client1".to_string(),
        );

        // Remote writes at timestamp 1 (older)
        let remote_field = Field {
            value: json!("Remote Title"),
            timestamp: Timestamp::new(1, "client2".to_string()),
        };

        let updated = doc.merge_field("title".to_string(), remote_field);

        assert!(!updated);
        assert_eq!(doc.get_field(&"title".to_string()), Some(&json!("Local Title")));
    }

    #[test]
    fn test_lww_merge_tie_breaking() {
        let mut doc = Document::new("doc-123".to_string());
        
        // Local writes at timestamp 1 with client1
        doc.set_field(
            "title".to_string(),
            json!("Local Title"),
            1,
            "client1".to_string(),
        );

        // Remote writes at timestamp 1 with client2 (client2 > client1)
        let remote_field = Field {
            value: json!("Remote Title"),
            timestamp: Timestamp::new(1, "client2".to_string()),
        };

        let updated = doc.merge_field("title".to_string(), remote_field);

        // client2 > client1, so remote wins
        assert!(updated);
        assert_eq!(doc.get_field(&"title".to_string()), Some(&json!("Remote Title")));
    }

    #[test]
    fn test_merge_entire_document() {
        let mut doc1 = Document::new("doc-123".to_string());
        doc1.set_field("field1".to_string(), json!("value1"), 1, "client1".to_string());
        doc1.set_field("field2".to_string(), json!("value2"), 1, "client1".to_string());

        let mut doc2 = Document::new("doc-123".to_string());
        doc2.set_field("field1".to_string(), json!("new_value1"), 2, "client2".to_string());
        doc2.set_field("field3".to_string(), json!("value3"), 1, "client2".to_string());

        // Merge doc2 into doc1
        let updated_count = doc1.merge(&doc2);

        // field1 should be updated (newer timestamp)
        // field3 should be added (new field)
        // field2 should remain unchanged
        assert_eq!(updated_count, 2);
        assert_eq!(doc1.get_field(&"field1".to_string()), Some(&json!("new_value1")));
        assert_eq!(doc1.get_field(&"field2".to_string()), Some(&json!("value2")));
        assert_eq!(doc1.get_field(&"field3".to_string()), Some(&json!("value3")));
    }

    #[test]
    fn test_document_to_json() {
        let mut doc = Document::new("doc-123".to_string());
        doc.set_field("title".to_string(), json!("Hello"), 1, "client1".to_string());
        doc.set_field("count".to_string(), json!(42), 1, "client1".to_string());

        let json = doc.to_json();
        assert_eq!(json["title"], json!("Hello"));
        assert_eq!(json["count"], json!(42));
    }

    #[test]
    fn test_convergence_property() {
        // Test convergence: two replicas merging in different orders reach same state
        
        let mut replica1 = Document::new("doc-123".to_string());
        let mut replica2 = Document::new("doc-123".to_string());

        // Client1 writes
        let client1_update = Document {
            id: "doc-123".to_string(),
            fields: {
                let mut map = HashMap::new();
                map.insert(
                    "field1".to_string(),
                    Field {
                        value: json!("A"),
                        timestamp: Timestamp::new(1, "client1".to_string()),
                    },
                );
                map
            },
            version: VectorClock::new(),
        };

        // Client2 writes
        let client2_update = Document {
            id: "doc-123".to_string(),
            fields: {
                let mut map = HashMap::new();
                map.insert(
                    "field1".to_string(),
                    Field {
                        value: json!("B"),
                        timestamp: Timestamp::new(2, "client2".to_string()),
                    },
                );
                map
            },
            version: VectorClock::new(),
        };

        // Replica1 merges in order: client1, then client2
        replica1.merge(&client1_update);
        replica1.merge(&client2_update);

        // Replica2 merges in reverse order: client2, then client1
        replica2.merge(&client2_update);
        replica2.merge(&client1_update);

        // Both replicas should converge to same state
        assert_eq!(
            replica1.get_field(&"field1".to_string()),
            replica2.get_field(&"field1".to_string())
        );
        
        // Should be client2's value (timestamp 2 > timestamp 1)
        assert_eq!(replica1.get_field(&"field1".to_string()), Some(&json!("B")));
        assert_eq!(replica2.get_field(&"field1".to_string()), Some(&json!("B")));
    }
}
