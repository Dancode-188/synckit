package protocol

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
)

// MessageTypeCode represents binary message type codes (must match SDK client exactly)
type MessageTypeCode byte

const (
	AUTH              MessageTypeCode = 0x01
	AUTH_SUCCESS      MessageTypeCode = 0x02
	AUTH_ERROR        MessageTypeCode = 0x03
	SUBSCRIBE         MessageTypeCode = 0x10
	UNSUBSCRIBE       MessageTypeCode = 0x11
	SYNC_REQUEST      MessageTypeCode = 0x12
	SYNC_RESPONSE     MessageTypeCode = 0x13
	SYNC_STEP1        MessageTypeCode = 0x14
	SYNC_STEP2        MessageTypeCode = 0x15
	DELTA             MessageTypeCode = 0x20
	ACK               MessageTypeCode = 0x21
	DELTA_BATCH       MessageTypeCode = 0x22
	PING              MessageTypeCode = 0x30
	PONG              MessageTypeCode = 0x31
	AWARENESS_UPDATE  MessageTypeCode = 0x40
	AWARENESS_SUBSCRIBE MessageTypeCode = 0x41
	AWARENESS_STATE   MessageTypeCode = 0x42
	ERROR             MessageTypeCode = 0xFF
)

// MessageType represents string message type names
const (
	TypeConnect    = "connect"
	TypeDisconnect = "disconnect"
	TypePing       = "ping"
	TypePong       = "pong"

	TypeAuth        = "auth"
	TypeAuthSuccess = "auth_success"
	TypeAuthError   = "auth_error"

	TypeSubscribe    = "subscribe"
	TypeUnsubscribe  = "unsubscribe"
	TypeSyncRequest  = "sync_request"
	TypeSyncResponse = "sync_response"
	TypeSyncStep1    = "sync_step1"
	TypeSyncStep2    = "sync_step2"
	TypeDelta        = "delta"
	TypeDeltaBatch   = "delta_batch"
	TypeAck          = "ack"

	TypeAwarenessUpdate    = "awareness_update"
	TypeAwarenessSubscribe = "awareness_subscribe"
	TypeAwarenessState     = "awareness_state"

	TypeError = "error"
)

// Map type codes to type names
var typeCodeToName = map[MessageTypeCode]string{
	AUTH:              TypeAuth,
	AUTH_SUCCESS:      TypeAuthSuccess,
	AUTH_ERROR:        TypeAuthError,
	SUBSCRIBE:         TypeSubscribe,
	UNSUBSCRIBE:       TypeUnsubscribe,
	SYNC_REQUEST:      TypeSyncRequest,
	SYNC_RESPONSE:     TypeSyncResponse,
	SYNC_STEP1:        TypeSyncStep1,
	SYNC_STEP2:        TypeSyncStep2,
	DELTA:             TypeDelta,
	ACK:               TypeAck,
	DELTA_BATCH:       TypeDeltaBatch,
	PING:              TypePing,
	PONG:              TypePong,
	AWARENESS_UPDATE:  TypeAwarenessUpdate,
	AWARENESS_SUBSCRIBE: TypeAwarenessSubscribe,
	AWARENESS_STATE:   TypeAwarenessState,
	ERROR:             TypeError,
}

// Map type names to type codes
var typeNameToCode = map[string]MessageTypeCode{
	TypeAuth:        AUTH,
	TypeAuthSuccess: AUTH_SUCCESS,
	TypeAuthError:   AUTH_ERROR,
	TypeSubscribe:   SUBSCRIBE,
	TypeUnsubscribe: UNSUBSCRIBE,
	TypeSyncRequest: SYNC_REQUEST,
	TypeSyncResponse: SYNC_RESPONSE,
	TypeSyncStep1:   SYNC_STEP1,
	TypeSyncStep2:   SYNC_STEP2,
	TypeDelta:       DELTA,
	TypeAck:         ACK,
	TypeDeltaBatch:  DELTA_BATCH,
	TypePing:        PING,
	TypePong:        PONG,
	TypeAwarenessUpdate: AWARENESS_UPDATE,
	TypeAwarenessSubscribe: AWARENESS_SUBSCRIBE,
	TypeAwarenessState: AWARENESS_STATE,
	TypeError:       ERROR,
}

// Message represents a WebSocket message
type Message struct {
	Type      string                 `json:"type"`
	ID        string                 `json:"id"`
	Timestamp int64                  `json:"timestamp"`
	Payload   map[string]interface{} `json:"-"`
}

// EncodeMessage encodes a message to binary format
// Format: [type:1 byte][timestamp:8 bytes][payload_len:4 bytes][payload:JSON bytes]
func EncodeMessage(messageType string, payload map[string]interface{}, timestamp int64) ([]byte, error) {
	// Get type code
	typeCode, ok := typeNameToCode[messageType]
	if !ok {
		typeCode = ERROR
	}

	// Encode payload as JSON
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	payloadLen := uint32(len(payloadJSON))

	// Create buffer: 1 (type) + 8 (timestamp) + 4 (length) + payload
	buf := make([]byte, 13+payloadLen)

	// Write type code
	buf[0] = byte(typeCode)

	// Write timestamp (big-endian)
	binary.BigEndian.PutUint64(buf[1:9], uint64(timestamp))

	// Write payload length (big-endian)
	binary.BigEndian.PutUint32(buf[9:13], payloadLen)

	// Write payload
	copy(buf[13:], payloadJSON)

	return buf, nil
}

// DecodeMessage decodes a binary or JSON message
func DecodeMessage(data []byte) (*Message, error) {
	// Check if it's JSON (starts with '{' or '[')
	if len(data) > 0 && (data[0] == '{' || data[0] == '[') {
		// JSON text protocol
		var msg map[string]interface{}
		if err := json.Unmarshal(data, &msg); err != nil {
			return nil, fmt.Errorf("failed to unmarshal JSON: %w", err)
		}

		message := &Message{
			Payload: msg,
		}

		if t, ok := msg["type"].(string); ok {
			message.Type = t
		}
		if id, ok := msg["id"].(string); ok {
			message.ID = id
		}
		if ts, ok := msg["timestamp"].(float64); ok {
			message.Timestamp = int64(ts)
		}

		return message, nil
	}

	// Binary protocol
	if len(data) < 13 {
		return nil, fmt.Errorf("message too short: %d bytes", len(data))
	}

	// Parse header
	typeCode := MessageTypeCode(data[0])
	timestamp := int64(binary.BigEndian.Uint64(data[1:9]))
	payloadLen := binary.BigEndian.Uint32(data[9:13])

	// Validate length
	if uint32(len(data)) < 13+payloadLen {
		return nil, fmt.Errorf("incomplete message: expected %d bytes, got %d", 13+payloadLen, len(data))
	}

	// Parse payload
	payloadBytes := data[13 : 13+payloadLen]
	var payload map[string]interface{}
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return nil, fmt.Errorf("failed to unmarshal payload: %w", err)
	}

	// Get type name
	typeName, ok := typeCodeToName[typeCode]
	if !ok {
		typeName = TypeError
	}

	message := &Message{
		Type:      typeName,
		Timestamp: timestamp,
		Payload:   payload,
	}

	// Extract common fields
	if id, ok := payload["id"].(string); ok {
		message.ID = id
	}

	return message, nil
}
