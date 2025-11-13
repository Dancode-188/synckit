// Delta computation - Calculate minimal changes between document states
//!
//! This module computes deltas (minimal change sets) between document states
//! for efficient synchronization over the network.

use crate::document::{Document, Field as DocField};
use crate::protocol::*;
use crate::sync::VectorClock;
use crate::error::{SyncError, Result};
use std::collections::HashMap;

/// Represents a change in a single field
#[derive(Debug, Clone)]
pub struct FieldChange {
    /// Path to the field (e.g., "user.name")
    pub path: String,
    
    /// Field with its metadata
    pub field: DocField,
    
    /// Whether this is a deletion
    pub is_delete: bool,
}

/// A delta represents changes between two document states
#[derive(Debug, Clone)]
pub struct DocumentDelta {
    /// Document ID
    pub document_id: String,
    
    /// Field changes
    pub changes: Vec<FieldChange>,
    
    /// Base version (before changes)
    pub base_version: VectorClock,
    
    /// New version (after changes)
    pub new_version: VectorClock,
}

impl DocumentDelta {
    /// Create a new empty delta
    pub fn new(document_id: String) -> Self {
        Self {
            document_id,
            changes: Vec::new(),
            base_version: VectorClock::new(),
            new_version: VectorClock::new(),
        }
    }
    
    /// Compute delta between two documents
    ///
    /// Returns the minimal set of changes to transform `from` into `to`
    pub fn compute(from: &Document, to: &Document) -> Result<Self> {
        if from.id() != to.id() {
            return Err(SyncError::InvalidOperation(
                "Cannot compute delta between different documents".to_string()
            ));
        }
        
        let mut delta = DocumentDelta::new(from.id().to_string());
        delta.base_version = from.version().clone();
        delta.new_version = to.version().clone();
        
        // Find all changed, added, and removed fields
        let from_fields = from.fields();
        let to_fields = to.fields();
        
        // Check for new or modified fields
        for (path, to_field) in to_fields {
            if let Some(from_field) = from_fields.get(path) {
                // Field exists in both - check if changed
                if from_field.value != to_field.value || from_field.timestamp != to_field.timestamp {
                    delta.changes.push(FieldChange {
                        path: path.clone(),
                        field: to_field.clone(),
                        is_delete: false,
                    });
                }
            } else {
                // New field in 'to'
                delta.changes.push(FieldChange {
                    path: path.clone(),
                    field: to_field.clone(),
                    is_delete: false,
                });
            }
        }
        
        // Check for removed fields (tombstones)
        for (path, from_field) in from_fields {
            if !to_fields.contains_key(path) {
                delta.changes.push(FieldChange {
                    path: path.clone(),
                    field: from_field.clone(),
                    is_delete: true,
                });
            }
        }
        
        Ok(delta)
    }
    
    /// Apply this delta to a document
    pub fn apply_to(&self, document: &mut Document, _client_id: &str) -> Result<()> {
        if document.id() != &self.document_id {
            return Err(SyncError::InvalidOperation(
                "Cannot apply delta to different document".to_string()
            ));
        }
        
        for change in &self.changes {
            if !change.is_delete {
                // Use the field's original timestamp
                let clock = change.field.timestamp.clock;
                let original_client = &change.field.timestamp.client_id;
                document.set_field(
                    change.path.clone(),
                    change.field.value.clone(),
                    clock,
                    original_client.clone(),
                );
            } else {
                document.delete_field(&change.path);
            }
        }
        
        Ok(())
    }
    
    /// Convert to protocol format
    pub fn to_protocol(&self) -> Delta {
        let changes = self.changes.iter().map(|change| {
            // Convert to protocol Field
            Field {
                path: Some(FieldPath {
                    segments: vec![change.path.clone()],
                }),
                timestamp: Some(Timestamp {
                    millis: change.field.timestamp.clock as i64,
                    client_id: Some(ClientId {
                        id: change.field.timestamp.client_id.clone(),
                    }),
                }),
                content: if change.is_delete {
                    Some(field::Content::Tombstone(Tombstone {
                        deleted_at: Some(Timestamp {
                            millis: chrono::Utc::now().timestamp_millis(),
                            client_id: Some(ClientId {
                                id: change.field.timestamp.client_id.clone(),
                            }),
                        }),
                    }))
                } else {
                    Some(field::Content::Value(
                        crate::protocol::serialize::json_to_protocol_value(&change.field.value)
                    ))
                },
            }
        }).collect();
        
        Delta {
            document_id: Some(DocumentId {
                id: self.document_id.clone(),
            }),
            base_version: Some(vector_clock_to_protocol(&self.base_version)),
            new_version: Some(vector_clock_to_protocol(&self.new_version)),
            changes,
            client_id: None,
            created_at: None,
        }
    }
    
    /// Create from protocol format
    pub fn from_protocol(proto: &Delta, client_id: &str) -> Result<Self> {
        let document_id = proto.document_id.as_ref()
            .map(|id| id.id.clone())
            .ok_or_else(|| SyncError::Protocol("Missing document ID".to_string()))?;
        
        let base_version = proto.base_version.as_ref()
            .map(vector_clock_from_protocol)
            .unwrap_or_else(VectorClock::new);
        
        let new_version = proto.new_version.as_ref()
            .map(vector_clock_from_protocol)
            .unwrap_or_else(VectorClock::new);
        
        let changes = proto.changes.iter().map(|field| {
            let path = field.path.as_ref()
                .and_then(|p| p.segments.first())
                .ok_or_else(|| SyncError::Protocol("Missing field path".to_string()))?
                .clone();
            
            let timestamp_proto = field.timestamp.as_ref()
                .ok_or_else(|| SyncError::Protocol("Missing timestamp".to_string()))?;
            
            let timestamp = crate::sync::Timestamp::new(
                timestamp_proto.millis as u64,
                timestamp_proto.client_id.as_ref()
                    .map(|c| c.id.clone())
                    .unwrap_or_else(|| client_id.to_string()),
            );
            
            let is_delete = matches!(field.content, Some(field::Content::Tombstone(_)));
            
            let value = if let Some(field::Content::Value(v)) = &field.content {
                crate::protocol::serialize::protocol_value_to_json(v)?
            } else {
                serde_json::Value::Null
            };
            
            Ok(FieldChange {
                path,
                field: DocField { value, timestamp },
                is_delete,
            })
        }).collect::<Result<Vec<_>>>()?;
        
        Ok(Self {
            document_id,
            changes,
            base_version,
            new_version,
        })
    }
}

/// Convert VectorClock to protocol format
fn vector_clock_to_protocol(vc: &VectorClock) -> crate::protocol::VectorClock {
    let mut clocks = HashMap::new();
    for (client_id, clock) in &vc.clocks {
        clocks.insert(client_id.clone(), *clock as i64);
    }
    
    crate::protocol::VectorClock { clocks }
}

/// Convert protocol VectorClock to internal format
fn vector_clock_from_protocol(proto: &crate::protocol::VectorClock) -> VectorClock {
    let mut vc = VectorClock::new();
    for (client_id, clock) in &proto.clocks {
        vc.update(client_id, *clock as u64);
    }
    vc
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_delta_computation() {
        let mut doc1 = Document::new("doc-1".to_string());
        doc1.set_field("name".to_string(), serde_json::json!("Alice"), 1, "client1".to_string());
        doc1.set_field("age".to_string(), serde_json::json!(30), 2, "client1".to_string());
        
        let mut doc2 = doc1.clone();
        doc2.set_field("age".to_string(), serde_json::json!(31), 3, "client1".to_string());
        doc2.set_field("city".to_string(), serde_json::json!("NYC"), 4, "client1".to_string());
        
        let delta = DocumentDelta::compute(&doc1, &doc2).unwrap();
        
        // Should have 2 changes: age modified, city added
        assert_eq!(delta.changes.len(), 2);
    }
    
    #[test]
    fn test_delta_protocol_conversion() {
        let mut doc1 = Document::new("doc-1".to_string());
        doc1.set_field("name".to_string(), serde_json::json!("Bob"), 1, "client1".to_string());
        
        let mut doc2 = doc1.clone();
        doc2.set_field("name".to_string(), serde_json::json!("Alice"), 2, "client1".to_string());
        
        let delta = DocumentDelta::compute(&doc1, &doc2).unwrap();
        
        // Convert to protocol and back
        let proto = delta.to_protocol();
        let delta2 = DocumentDelta::from_protocol(&proto, "client1").unwrap();
        
        assert_eq!(delta.document_id, delta2.document_id);
        assert_eq!(delta.changes.len(), delta2.changes.len());
    }
}
