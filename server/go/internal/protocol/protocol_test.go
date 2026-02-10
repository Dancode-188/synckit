package protocol

import (
	"encoding/binary"
	"encoding/json"
	"testing"
	"time"
)

func TestMessageTypeCodes(t *testing.T) {
	tests := []struct {
		code MessageTypeCode
		want byte
	}{
		{AUTH, 0x01},
		{AUTH_SUCCESS, 0x02},
		{AUTH_ERROR, 0x03},
		{SUBSCRIBE, 0x10},
		{UNSUBSCRIBE, 0x11},
		{SYNC_REQUEST, 0x12},
		{SYNC_RESPONSE, 0x13},
		{DELTA, 0x20},
		{ACK, 0x21},
		{PING, 0x30},
		{PONG, 0x31},
		{AWARENESS_UPDATE, 0x40},
		{ERROR, 0xFF},
	}

	for _, tt := range tests {
		if byte(tt.code) != tt.want {
			t.Errorf("MessageTypeCode %v = %#x, want %#x", tt.code, byte(tt.code), tt.want)
		}
	}
}

func TestBidirectionalMapping(t *testing.T) {
	for code, name := range typeCodeToName {
		gotCode, ok := typeNameToCode[name]
		if !ok {
			t.Errorf("type name %q not found in typeNameToCode", name)
			continue
		}
		if gotCode != code {
			t.Errorf("typeNameToCode[%q] = %#x, want %#x", name, gotCode, code)
		}
	}
}

func TestEncodeMessage(t *testing.T) {
	tests := []struct {
		name        string
		messageType string
		payload     map[string]interface{}
		timestamp   int64
		wantCode    MessageTypeCode
	}{
		{
			name:        "ping message",
			messageType: TypePing,
			payload:     map[string]interface{}{"type": "ping", "id": "test-123"},
			timestamp:   1234567890000,
			wantCode:    PING,
		},
		{
			name:        "delta message",
			messageType: TypeDelta,
			payload: map[string]interface{}{
				"type":    "delta",
				"id":      "delta-456",
				"docId":   "doc-1",
				"changes": map[string]interface{}{"key": "value"},
			},
			timestamp: 1234567890000,
			wantCode:  DELTA,
		},
		{
			name:        "auth message",
			messageType: TypeAuth,
			payload:     map[string]interface{}{"type": "auth", "token": "jwt-token"},
			timestamp:   1234567890000,
			wantCode:    AUTH,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := EncodeMessage(tt.messageType, tt.payload, tt.timestamp)
			if err != nil {
				t.Fatalf("EncodeMessage() error = %v", err)
			}

			// Check minimum length (header)
			if len(result) < 13 {
				t.Fatalf("EncodeMessage() result length = %d, want >= 13", len(result))
			}

			// Check type code
			typeCode := MessageTypeCode(result[0])
			if typeCode != tt.wantCode {
				t.Errorf("EncodeMessage() type code = %#x, want %#x", typeCode, tt.wantCode)
			}

			// Check timestamp
			ts := int64(binary.BigEndian.Uint64(result[1:9]))
			if ts != tt.timestamp {
				t.Errorf("EncodeMessage() timestamp = %d, want %d", ts, tt.timestamp)
			}

			// Check payload length
			payloadLen := binary.BigEndian.Uint32(result[9:13])
			if int(payloadLen) != len(result)-13 {
				t.Errorf("EncodeMessage() payload length = %d, want %d", payloadLen, len(result)-13)
			}

			// Verify payload is valid JSON
			var decodedPayload map[string]interface{}
			if err := json.Unmarshal(result[13:], &decodedPayload); err != nil {
				t.Errorf("EncodeMessage() payload is not valid JSON: %v", err)
			}
		})
	}
}

func TestDecodeMessage_Binary(t *testing.T) {
	payload := map[string]interface{}{"id": "test-123", "data": "hello"}
	payloadBytes, _ := json.Marshal(payload)
	timestamp := int64(1234567890000)

	// Build binary message
	header := make([]byte, 13)
	header[0] = byte(PING)
	binary.BigEndian.PutUint64(header[1:9], uint64(timestamp))
	binary.BigEndian.PutUint32(header[9:13], uint32(len(payloadBytes)))

	message := append(header, payloadBytes...)

	result, err := DecodeMessage(message)
	if err != nil {
		t.Fatalf("DecodeMessage() error = %v", err)
	}

	if result.Type != TypePing {
		t.Errorf("DecodeMessage() type = %q, want %q", result.Type, TypePing)
	}
	if result.Timestamp != timestamp {
		t.Errorf("DecodeMessage() timestamp = %d, want %d", result.Timestamp, timestamp)
	}
	if result.ID != "test-123" {
		t.Errorf("DecodeMessage() ID = %q, want %q", result.ID, "test-123")
	}
}

func TestDecodeMessage_JSON(t *testing.T) {
	message := []byte(`{"type":"ping","id":"test-123","timestamp":1234567890000}`)

	result, err := DecodeMessage(message)
	if err != nil {
		t.Fatalf("DecodeMessage() error = %v", err)
	}

	if result.Type != "ping" {
		t.Errorf("DecodeMessage() type = %q, want %q", result.Type, "ping")
	}
	if result.ID != "test-123" {
		t.Errorf("DecodeMessage() ID = %q, want %q", result.ID, "test-123")
	}
}

func TestDecodeMessage_RejectsShortMessage(t *testing.T) {
	shortMessage := []byte{0x30, 0x00, 0x00} // Only 3 bytes

	_, err := DecodeMessage(shortMessage)
	if err == nil {
		t.Error("DecodeMessage() expected error for short message, got nil")
	}
}

func TestDecodeMessage_RejectsTruncatedPayload(t *testing.T) {
	// Header says payload is 100 bytes but we only provide 5
	header := make([]byte, 13)
	header[0] = byte(PING)
	binary.BigEndian.PutUint64(header[1:9], 1000)
	binary.BigEndian.PutUint32(header[9:13], 100)

	message := append(header, []byte("short")...)

	_, err := DecodeMessage(message)
	if err == nil {
		t.Error("DecodeMessage() expected error for truncated payload, got nil")
	}
}

func TestRoundTrip(t *testing.T) {
	tests := []struct {
		name        string
		messageType string
		payload     map[string]interface{}
	}{
		{
			name:        "ping",
			messageType: TypePing,
			payload:     map[string]interface{}{"type": "ping", "id": "roundtrip-1"},
		},
		{
			name:        "delta with complex payload",
			messageType: TypeDelta,
			payload: map[string]interface{}{
				"type":   "delta",
				"id":     "complex-1",
				"docId":  "doc-123",
				"string": "hello",
				"number": float64(42),
				"nested": map[string]interface{}{"key": "value"},
				"array":  []interface{}{float64(1), "two", float64(3.0)},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			timestamp := time.Now().UnixMilli()

			encoded, err := EncodeMessage(tt.messageType, tt.payload, timestamp)
			if err != nil {
				t.Fatalf("EncodeMessage() error = %v", err)
			}

			decoded, err := DecodeMessage(encoded)
			if err != nil {
				t.Fatalf("DecodeMessage() error = %v", err)
			}

			if decoded.Type != tt.messageType {
				t.Errorf("Round trip type = %q, want %q", decoded.Type, tt.messageType)
			}
			if decoded.Timestamp != timestamp {
				t.Errorf("Round trip timestamp = %d, want %d", decoded.Timestamp, timestamp)
			}
		})
	}
}

func TestRoundTrip_AllMessageTypes(t *testing.T) {
	typesToTest := []struct {
		typeName string
		typeCode MessageTypeCode
	}{
		{TypeAuth, AUTH},
		{TypeAuthSuccess, AUTH_SUCCESS},
		{TypeSubscribe, SUBSCRIBE},
		{TypeDelta, DELTA},
		{TypeAck, ACK},
		{TypePing, PING},
		{TypePong, PONG},
		{TypeAwarenessUpdate, AWARENESS_UPDATE},
		{TypeError, ERROR},
	}

	for _, tt := range typesToTest {
		t.Run(tt.typeName, func(t *testing.T) {
			payload := map[string]interface{}{"type": tt.typeName, "id": "test"}
			timestamp := int64(1000)

			encoded, err := EncodeMessage(tt.typeName, payload, timestamp)
			if err != nil {
				t.Fatalf("EncodeMessage(%q) error = %v", tt.typeName, err)
			}

			decoded, err := DecodeMessage(encoded)
			if err != nil {
				t.Fatalf("DecodeMessage(%q) error = %v", tt.typeName, err)
			}

			if decoded.Type != tt.typeName {
				t.Errorf("Round trip for %q: got type %q", tt.typeName, decoded.Type)
			}
		})
	}
}

func TestEncodeMessage_PreservesPayloadData(t *testing.T) {
	payload := map[string]interface{}{
		"type": "delta",
		"id":   "test",
		"nested": map[string]interface{}{
			"deep": map[string]interface{}{
				"value": float64(123),
			},
		},
		"array": []interface{}{float64(1), float64(2), float64(3)},
	}

	result, err := EncodeMessage(TypeDelta, payload, 1000)
	if err != nil {
		t.Fatalf("EncodeMessage() error = %v", err)
	}

	var decoded map[string]interface{}
	if err := json.Unmarshal(result[13:], &decoded); err != nil {
		t.Fatalf("Failed to unmarshal payload: %v", err)
	}

	// Check nested value
	nested, ok := decoded["nested"].(map[string]interface{})
	if !ok {
		t.Fatal("decoded[\"nested\"] is not a map")
	}
	deep, ok := nested["deep"].(map[string]interface{})
	if !ok {
		t.Fatal("nested[\"deep\"] is not a map")
	}
	value, ok := deep["value"].(float64)
	if !ok || value != 123 {
		t.Errorf("nested.deep.value = %v, want 123", deep["value"])
	}

	// Check array
	arr, ok := decoded["array"].([]interface{})
	if !ok {
		t.Fatal("decoded[\"array\"] is not an array")
	}
	if len(arr) != 3 {
		t.Errorf("array length = %d, want 3", len(arr))
	}
}
