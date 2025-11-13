// Serialization layer - Convert CRDTs to/from Protocol Buffers
//!
//! This module provides conversion between our internal CRDT types
//! and the Protocol Buffer message format for network transmission.

use crate::crdt::{PNCounter, ORSet};
use crate::protocol::*;
use crate::error::{SyncError, Result};
use prost::Message;
use bytes::{Bytes, BytesMut};

/// Serialize a PN-Counter to protocol format
pub fn serialize_pn_counter(counter: &PNCounter, client_id: &str) -> CounterOperation {
    // Get the current value
    let value = counter.value();
    
    CounterOperation {
        op_type: if value >= 0 {
            counter_operation::OpType::Increment as i32
        } else {
            counter_operation::OpType::Decrement as i32
        },
        amount: value.abs(),
        client_id: Some(ClientId {
            id: client_id.to_string(),
        }),
    }
}

/// Deserialize a PN-Counter from protocol format
pub fn deserialize_pn_counter(op: &CounterOperation, client_id: &str) -> Result<PNCounter> {
    let mut counter = PNCounter::new(client_id.to_string());
    
    match counter_operation::OpType::try_from(op.op_type) {
        Ok(counter_operation::OpType::Increment) => {
            if op.amount > 0 {
                counter.increment(op.amount);
            }
        }
        Ok(counter_operation::OpType::Decrement) => {
            if op.amount > 0 {
                counter.decrement(op.amount);
            }
        }
        Err(_) => return Err(SyncError::Protocol("Invalid counter operation type".to_string())),
    }
    
    Ok(counter)
}

/// Serialize an OR-Set to protocol format
pub fn serialize_or_set<T>(set: &ORSet<T>, _client_id: &str) -> Vec<SetOperation>
where
    T: serde::Serialize + Clone + Eq + std::hash::Hash,
{
    let mut operations = Vec::new();
    
    for element in set.iter() {
        // Serialize element to JSON for Value encoding
        if let Ok(json_value) = serde_json::to_value(element) {
            operations.push(SetOperation {
                op_type: set_operation::OpType::Add as i32,
                element: Some(json_to_protocol_value(&json_value)),
                tag: format!("{}", chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)),
                remove_tags: vec![],
            });
        }
    }
    
    operations
}

/// Deserialize an OR-Set from protocol format
pub fn deserialize_or_set<T>(operations: &[SetOperation], client_id: &str) -> Result<ORSet<T>>
where
    T: serde::de::DeserializeOwned + Eq + std::hash::Hash + Clone + serde::Serialize,
{
    let mut set = ORSet::new(client_id.to_string());
    
    for op in operations {
        match set_operation::OpType::try_from(op.op_type) {
            Ok(set_operation::OpType::Add) => {
                if let Some(value) = &op.element {
                    let json_value = protocol_value_to_json(value)?;
                    let element: T = serde_json::from_value(json_value)
                        .map_err(|e| SyncError::Protocol(format!("Failed to deserialize element: {}", e)))?;
                    set.add(element);
                }
            }
            Ok(set_operation::OpType::Remove) => {
                // Handle remove operations if needed
            }
            Err(_) => return Err(SyncError::Protocol("Invalid set operation type".to_string())),
        }
    }
    
    Ok(set)
}

/// Convert serde_json::Value to protocol::Value
pub fn json_to_protocol_value(json: &serde_json::Value) -> Value {
    use serde_json::Value as JsonValue;
    
    match json {
        JsonValue::Null => Value {
            value: Some(value::Value::Null(true)),
        },
        JsonValue::Bool(b) => Value {
            value: Some(value::Value::BoolValue(*b)),
        },
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value {
                    value: Some(value::Value::IntValue(i)),
                }
            } else if let Some(f) = n.as_f64() {
                Value {
                    value: Some(value::Value::FloatValue(f)),
                }
            } else {
                Value {
                    value: Some(value::Value::Null(true)),
                }
            }
        }
        JsonValue::String(s) => Value {
            value: Some(value::Value::StringValue(s.clone())),
        },
        JsonValue::Array(arr) => {
            let items: Vec<Value> = arr.iter().map(json_to_protocol_value).collect();
            Value {
                value: Some(value::Value::ArrayValue(ValueArray { items })),
            }
        }
        JsonValue::Object(obj) => {
            let mut fields = std::collections::HashMap::new();
            for (key, value) in obj {
                fields.insert(key.clone(), json_to_protocol_value(value));
            }
            Value {
                value: Some(value::Value::ObjectValue(ValueObject { fields })),
            }
        }
    }
}

/// Convert protocol::Value to serde_json::Value
pub fn protocol_value_to_json(proto: &Value) -> Result<serde_json::Value> {
    use serde_json::Value as JsonValue;
    
    match &proto.value {
        Some(value::Value::Null(_)) => Ok(JsonValue::Null),
        Some(value::Value::BoolValue(b)) => Ok(JsonValue::Bool(*b)),
        Some(value::Value::IntValue(i)) => Ok(JsonValue::Number((*i).into())),
        Some(value::Value::FloatValue(f)) => {
            Ok(JsonValue::Number(serde_json::Number::from_f64(*f).unwrap_or(0.into())))
        }
        Some(value::Value::StringValue(s)) => Ok(JsonValue::String(s.clone())),
        Some(value::Value::BytesValue(b)) => {
            // Encode bytes as base64 string using new API
            use base64::Engine;
            let engine = base64::engine::general_purpose::STANDARD;
            Ok(JsonValue::String(engine.encode(b)))
        }
        Some(value::Value::ArrayValue(arr)) => {
            let items: Result<Vec<JsonValue>> = arr.items.iter()
                .map(protocol_value_to_json)
                .collect();
            Ok(JsonValue::Array(items?))
        }
        Some(value::Value::ObjectValue(obj)) => {
            let mut map = serde_json::Map::new();
            for (key, value) in &obj.fields {
                map.insert(key.clone(), protocol_value_to_json(value)?);
            }
            Ok(JsonValue::Object(map))
        }
        None => Ok(JsonValue::Null),
    }
}

/// Serialize any protocol message to bytes
pub fn encode_message<M: Message>(msg: &M) -> Result<Bytes> {
    let mut buf = BytesMut::with_capacity(msg.encoded_len());
    msg.encode(&mut buf)
        .map_err(|e| SyncError::Protocol(format!("Failed to encode message: {}", e)))?;
    Ok(buf.freeze())
}

/// Deserialize a protocol message from bytes
pub fn decode_message<M: Message + Default>(bytes: &[u8]) -> Result<M> {
    M::decode(bytes)
        .map_err(|e| SyncError::Protocol(format!("Failed to decode message: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_json_value_conversion() {
        let json = serde_json::json!({
            "name": "test",
            "value": 42,
            "active": true,
            "tags": ["a", "b", "c"]
        });
        
        let proto = json_to_protocol_value(&json);
        let back_to_json = protocol_value_to_json(&proto).unwrap();
        
        assert_eq!(json, back_to_json);
    }
    
    #[test]
    fn test_pn_counter_serialization() {
        let mut counter = PNCounter::new("client1".to_string());
        counter.increment(5);
        counter.decrement(2);
        
        let op = serialize_pn_counter(&counter, "client1");
        assert_eq!(op.amount, 3);
    }
    
    #[test]
    fn test_or_set_serialization() {
        let mut set = ORSet::new("client1".to_string());
        set.add("item1".to_string());
        set.add("item2".to_string());
        
        let ops = serialize_or_set(&set, "client1");
        assert_eq!(ops.len(), 2);
    }
}
