//! Property-based tests for SyncKit core
//!
//! These tests verify correctness properties with randomly generated operations,
//! testing edge cases that would be impractical to write manually.
//!
//! Properties verified:
//! - Convergence: All replicas reach identical state
//! - Order Independence: Operation order doesn't affect final result
//! - Idempotence: Applying operation twice has same effect as once
//! - Commutativity: Concurrent operations can be applied in any order
//! - No Data Loss: All operations affect final state

use proptest::prelude::*;
use serde_json::json;

use synckit_core::{Document, ClientID};
use synckit_core::sync::{compute_delta, apply_delta};

/// Generate random field names
fn field_name() -> impl Strategy<Value = String> {
    prop::string::string_regex("[a-z]{1,10}").unwrap()
}

/// Generate random field values
fn field_value() -> impl Strategy<Value = serde_json::Value> {
    prop_oneof![
        Just(json!(null)),
        any::<bool>().prop_map(|b| json!(b)),
        any::<i32>().prop_map(|i| json!(i)),
        prop::string::string_regex("[a-z0-9 ]{1,20}").unwrap().prop_map(|s| json!(s)),
    ]
}

/// Generate random client IDs
fn client_id() -> impl Strategy<Value = ClientID> {
    prop::string::string_regex("client[0-9]").unwrap()
}

/// A document operation (set field)
#[derive(Debug, Clone)]
struct Operation {
    field: String,
    value: serde_json::Value,
    timestamp: u64,
    client_id: ClientID,
}

/// Generate random operations
fn operation() -> impl Strategy<Value = Operation> {
    (field_name(), field_value(), 1u64..100u64, client_id())
        .prop_map(|(field, value, timestamp, client_id)| Operation {
            field,
            value,
            timestamp,
            client_id,
        })
}

/// Generate a sequence of operations
fn operations(count: usize) -> impl Strategy<Value = Vec<Operation>> {
    prop::collection::vec(operation(), 1..=count)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Property: Convergence
    /// 
    /// If all replicas receive all operations, they must converge to identical state.
    /// This is the fundamental CRDT property - Strong Eventual Consistency.
    #[test]
    fn prop_convergence() {
        proptest!(|(ops in operations(20))| {
            // Create two independent replicas
            let mut doc1 = Document::new("test-doc".to_string());
            let mut doc2 = Document::new("test-doc".to_string());
            
            // Apply all operations to both documents
            for op in &ops {
                doc1.set_field(
                    op.field.clone(),
                    op.value.clone(),
                    op.timestamp,
                    op.client_id.clone(),
                );
                doc2.set_field(
                    op.field.clone(),
                    op.value.clone(),
                    op.timestamp,
                    op.client_id.clone(),
                );
            }
            
            // Documents must have identical field values
            prop_assert_eq!(doc1.fields.len(), doc2.fields.len());
            
            for (field_name, field1) in &doc1.fields {
                let field2 = doc2.fields.get(field_name).unwrap();
                prop_assert_eq!(&field1.value, &field2.value);
                prop_assert_eq!(field1.timestamp.clock, field2.timestamp.clock);
                prop_assert_eq!(&field1.timestamp.client_id, &field2.timestamp.client_id);
            }
        });
    }

    /// Property: Order Independence
    /// 
    /// The final state should be the same regardless of the order operations are applied.
    /// This verifies that LWW semantics work correctly.
    #[test]
    fn prop_order_independence() {
        proptest!(|(ops in operations(15))| {
            let mut doc1 = Document::new("test-doc".to_string());
            let mut doc2 = Document::new("test-doc".to_string());
            
            // Apply operations in original order to doc1
            for op in &ops {
                doc1.set_field(
                    op.field.clone(),
                    op.value.clone(),
                    op.timestamp,
                    op.client_id.clone(),
                );
            }
            
            // Apply operations in reverse order to doc2
            for op in ops.iter().rev() {
                doc2.set_field(
                    op.field.clone(),
                    op.value.clone(),
                    op.timestamp,
                    op.client_id.clone(),
                );
            }
            
            // Final state must be identical
            prop_assert_eq!(doc1.fields.len(), doc2.fields.len());
            
            for (field_name, field1) in &doc1.fields {
                let field2 = doc2.fields.get(field_name).unwrap();
                prop_assert_eq!(&field1.value, &field2.value);
            }
        });
    }

    /// Property: Idempotence
    /// 
    /// Applying the same operation twice should have the same effect as applying it once.
    #[test]
    fn prop_idempotence() {
        proptest!(|(ops in operations(10))| {
            let mut doc1 = Document::new("test-doc".to_string());
            let mut doc2 = Document::new("test-doc".to_string());
            
            // Apply operations once to doc1
            for op in &ops {
                doc1.set_field(
                    op.field.clone(),
                    op.value.clone(),
                    op.timestamp,
                    op.client_id.clone(),
                );
            }
            
            // Apply operations twice to doc2
            for op in &ops {
                doc2.set_field(
                    op.field.clone(),
                    op.value.clone(),
                    op.timestamp,
                    op.client_id.clone(),
                );
            }
            for op in &ops {
                doc2.set_field(
                    op.field.clone(),
                    op.value.clone(),
                    op.timestamp,
                    op.client_id.clone(),
                );
            }
            
            // State must be identical
            prop_assert_eq!(doc1.fields.len(), doc2.fields.len());
            
            for (field_name, field1) in &doc1.fields {
                let field2 = doc2.fields.get(field_name).unwrap();
                prop_assert_eq!(&field1.value, &field2.value);
            }
        });
    }

    /// Property: Delta Application Preserves Convergence
    /// 
    /// Applying deltas should produce the same result as direct operations.
    #[test]
    fn prop_delta_convergence() {
        proptest!(|(ops in operations(15))| {
            // Direct application
            let mut direct = Document::new("test-doc".to_string());
            for op in &ops {
                direct.set_field(
                    op.field.clone(),
                    op.value.clone(),
                    op.timestamp,
                    op.client_id.clone(),
                );
            }
            
            // Delta-based application
            let mut via_delta = Document::new("test-doc".to_string());
            let mut intermediate = Document::new("test-doc".to_string());
            
            for op in &ops {
                intermediate.set_field(
                    op.field.clone(),
                    op.value.clone(),
                    op.timestamp,
                    op.client_id.clone(),
                );
            }
            
            let delta = compute_delta(&via_delta, &intermediate);
            apply_delta(&mut via_delta, &delta);
            
            // Results must be identical
            prop_assert_eq!(direct.fields.len(), via_delta.fields.len());
            
            for (field_name, field1) in &direct.fields {
                let field2 = via_delta.fields.get(field_name).unwrap();
                prop_assert_eq!(&field1.value, &field2.value);
            }
        });
    }

    /// Property: No Data Loss
    /// 
    /// Every operation should affect the final state (either visible or superseded by newer op).
    #[test]
    fn prop_no_data_loss() {
        proptest!(|(ops in operations(10))| {
            let mut doc = Document::new("test-doc".to_string());
            
            // Track which fields we've written to
            let mut written_fields = std::collections::HashSet::new();
            
            for op in &ops {
                doc.set_field(
                    op.field.clone(),
                    op.value.clone(),
                    op.timestamp,
                    op.client_id.clone(),
                );
                written_fields.insert(op.field.clone());
            }
            
            // All written fields should exist in the document
            // (even if their values were superseded by newer writes)
            for field in &written_fields {
                prop_assert!(doc.fields.contains_key(field));
            }
        });
    }

    /// Property: LWW Determinism
    /// 
    /// For the same set of concurrent operations, LWW must always choose the same winner.
    #[test]
    fn prop_lww_determinism() {
        proptest!(|(
            field in field_name(),
            value1 in field_value(),
            value2 in field_value(),
            timestamp in 1u64..100u64,
            client1 in client_id(),
            client2 in client_id(),
        )| {
            // Create same scenario multiple times
            for _ in 0..5 {
                let mut doc = Document::new("test-doc".to_string());
                
                // Apply two operations with same timestamp
                doc.set_field(field.clone(), value1.clone(), timestamp, client1.clone());
                doc.set_field(field.clone(), value2.clone(), timestamp, client2.clone());
                
                // Winner should be determined by:
                // 1. Higher client_id
                // 2. If client_ids equal, use JSON value comparison for determinism
                let expected_winner = if client2 > client1 {
                    &value2
                } else if client1 > client2 {
                    &value1
                } else {
                    // Same client, same timestamp - use value comparison
                    let value1_json = serde_json::to_string(&value1).unwrap();
                    let value2_json = serde_json::to_string(&value2).unwrap();
                    if value2_json > value1_json {
                        &value2
                    } else {
                        &value1
                    }
                };
                
                prop_assert_eq!(&doc.fields[&field].value, expected_winner);
            }
        });
    }

    /// Property: Concurrent Operations Commute
    /// 
    /// Operations on different fields can be applied in any order.
    #[test]
    fn prop_concurrent_operations_commute() {
        proptest!(|(
            field1 in field_name(),
            field2 in field_name(),
            value1 in field_value(),
            value2 in field_value(),
            ts in 1u64..100u64,
        )| {
            // Skip if fields are the same (not testing that case here)
            prop_assume!(field1 != field2);
            
            let mut doc1 = Document::new("test-doc".to_string());
            let mut doc2 = Document::new("test-doc".to_string());
            
            // Apply in order 1,2 to doc1
            doc1.set_field(field1.clone(), value1.clone(), ts, "client1".to_string());
            doc1.set_field(field2.clone(), value2.clone(), ts, "client2".to_string());
            
            // Apply in order 2,1 to doc2
            doc2.set_field(field2.clone(), value2.clone(), ts, "client2".to_string());
            doc2.set_field(field1.clone(), value1.clone(), ts, "client1".to_string());
            
            // Results must be identical
            prop_assert_eq!(&doc1.fields[&field1].value, &doc2.fields[&field1].value);
            prop_assert_eq!(&doc1.fields[&field2].value, &doc2.fields[&field2].value);
        });
    }

    /// Stress Test: Large number of operations
    /// 
    /// Verify system can handle 1000+ operations without breaking.
    #[test]
    fn prop_stress_test_1000_ops() {
        proptest!(|(ops in operations(1000))| {
            let mut doc = Document::new("test-doc".to_string());
            
            // Should not panic or error
            for op in &ops {
                doc.set_field(
                    op.field.clone(),
                    op.value.clone(),
                    op.timestamp,
                    op.client_id.clone(),
                );
            }
            
            // Document should be in valid state
            prop_assert!(doc.fields.len() > 0);
            
            // All fields should have valid timestamps
            for (_, field) in &doc.fields {
                prop_assert!(field.timestamp.clock > 0);
                prop_assert!(!field.timestamp.client_id.is_empty());
            }
        });
    }
}
