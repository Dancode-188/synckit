package security

import (
	"testing"
)

// --- ConnectionLimiter ---

func TestConnectionLimiter_AllowsWithinLimit(t *testing.T) {
	cl := NewConnectionLimiter()
	defer cl.Dispose()

	ip := "192.168.1.1"
	if !cl.CanConnect(ip) {
		t.Error("Should allow first connection")
	}

	cl.AddConnection(ip)
	if cl.GetConnectionCount(ip) != 1 {
		t.Errorf("Count = %d, want 1", cl.GetConnectionCount(ip))
	}
}

func TestConnectionLimiter_BlocksAtLimit(t *testing.T) {
	cl := NewConnectionLimiter()
	defer cl.Dispose()

	ip := "192.168.1.2"
	for i := 0; i < SecurityLimits.MaxConnectionsPerIP; i++ {
		cl.AddConnection(ip)
	}

	if cl.CanConnect(ip) {
		t.Error("Should block connections at limit")
	}
}

func TestConnectionLimiter_RemoveConnection(t *testing.T) {
	cl := NewConnectionLimiter()
	defer cl.Dispose()

	ip := "192.168.1.3"
	cl.AddConnection(ip)
	cl.AddConnection(ip)
	if cl.GetConnectionCount(ip) != 2 {
		t.Errorf("Count = %d, want 2", cl.GetConnectionCount(ip))
	}

	cl.RemoveConnection(ip)
	if cl.GetConnectionCount(ip) != 1 {
		t.Errorf("Count = %d, want 1", cl.GetConnectionCount(ip))
	}

	cl.RemoveConnection(ip)
	if cl.GetConnectionCount(ip) != 0 {
		t.Errorf("Count = %d, want 0", cl.GetConnectionCount(ip))
	}
}

func TestConnectionLimiter_MultipleIPs(t *testing.T) {
	cl := NewConnectionLimiter()
	defer cl.Dispose()

	cl.AddConnection("10.0.0.1")
	cl.AddConnection("10.0.0.2")
	cl.AddConnection("10.0.0.2")

	if cl.GetConnectionCount("10.0.0.1") != 1 {
		t.Error("IP 1 should have 1 connection")
	}
	if cl.GetConnectionCount("10.0.0.2") != 2 {
		t.Error("IP 2 should have 2 connections")
	}
}

// --- ConnectionRateLimiter ---

func TestConnectionRateLimiter_AllowsWithinLimit(t *testing.T) {
	crl := NewConnectionRateLimiter()
	defer crl.Dispose()

	connID := "conn-1"
	if !crl.CanSendMessage(connID) {
		t.Error("Should allow first message")
	}

	crl.RecordMessage(connID)
	if !crl.CanSendMessage(connID) {
		t.Error("Should allow messages within limit")
	}
}

func TestConnectionRateLimiter_BlocksAtLimit(t *testing.T) {
	crl := NewConnectionRateLimiter()
	defer crl.Dispose()

	connID := "conn-2"
	for i := 0; i < SecurityLimits.MaxMessagesPerMinute; i++ {
		crl.RecordMessage(connID)
	}

	if crl.CanSendMessage(connID) {
		t.Error("Should block messages at limit")
	}
}

func TestConnectionRateLimiter_RemoveConnection(t *testing.T) {
	crl := NewConnectionRateLimiter()
	defer crl.Dispose()

	connID := "conn-3"
	for i := 0; i < SecurityLimits.MaxMessagesPerMinute; i++ {
		crl.RecordMessage(connID)
	}

	crl.RemoveConnection(connID)
	if !crl.CanSendMessage(connID) {
		t.Error("Should allow messages after connection removal")
	}
}

func TestConnectionRateLimiter_IndependentConnections(t *testing.T) {
	crl := NewConnectionRateLimiter()
	defer crl.Dispose()

	// Fill up conn-a
	for i := 0; i < SecurityLimits.MaxMessagesPerMinute; i++ {
		crl.RecordMessage("conn-a")
	}

	// conn-b should be unaffected
	if !crl.CanSendMessage("conn-b") {
		t.Error("Different connection should not be rate limited")
	}
}

// --- DocumentLimiter ---

func TestDocumentLimiter_AllowsWithinLimit(t *testing.T) {
	dl := NewDocumentLimiter()
	defer dl.Dispose()

	allowed, reason := dl.CanCreateDocument("10.0.0.1")
	if !allowed {
		t.Errorf("Should allow first document, reason: %s", reason)
	}
}

func TestDocumentLimiter_BlocksAtTotalLimit(t *testing.T) {
	dl := NewDocumentLimiter()
	defer dl.Dispose()

	ip := "10.0.0.2"
	for i := 0; i < SecurityLimits.MaxDocsPerIP; i++ {
		dl.RecordDocument(ip)
	}

	allowed, _ := dl.CanCreateDocument(ip)
	if allowed {
		t.Error("Should block at total document limit")
	}
}

func TestDocumentLimiter_BlocksAtHourlyLimit(t *testing.T) {
	dl := NewDocumentLimiter()
	defer dl.Dispose()

	ip := "10.0.0.3"
	for i := 0; i < SecurityLimits.MaxDocsPerHour; i++ {
		dl.RecordDocument(ip)
	}

	allowed, reason := dl.CanCreateDocument(ip)
	if allowed {
		t.Error("Should block at hourly document limit")
	}
	if reason == "" {
		t.Error("Should provide a reason when blocked")
	}
}

func TestDocumentLimiter_IndependentIPs(t *testing.T) {
	dl := NewDocumentLimiter()
	defer dl.Dispose()

	for i := 0; i < SecurityLimits.MaxDocsPerHour; i++ {
		dl.RecordDocument("10.0.0.4")
	}

	allowed, _ := dl.CanCreateDocument("10.0.0.5")
	if !allowed {
		t.Error("Different IP should not be affected")
	}
}

// --- SecurityManager ---

func TestSecurityManager_Creation(t *testing.T) {
	sm := NewSecurityManager()
	defer sm.Dispose()

	if sm.ConnectionLimiter == nil {
		t.Error("ConnectionLimiter should not be nil")
	}
	if sm.ConnectionRateLimiter == nil {
		t.Error("ConnectionRateLimiter should not be nil")
	}
	if sm.DocumentLimiter == nil {
		t.Error("DocumentLimiter should not be nil")
	}
}

// --- ValidateMessage ---

func TestValidateMessage_Valid(t *testing.T) {
	tests := []map[string]interface{}{
		{"type": "auth"},
		{"type": "delta", "docId": "doc-1"},
		{"type": "subscribe"},
		{"type": "ping"},
	}

	for _, msg := range tests {
		valid, errMsg := ValidateMessage(msg)
		if !valid {
			t.Errorf("Expected valid for type %q, got error: %s", msg["type"], errMsg)
		}
	}
}

func TestValidateMessage_Invalid(t *testing.T) {
	tests := []struct {
		name string
		msg  map[string]interface{}
	}{
		{"nil message", nil},
		{"missing type", map[string]interface{}{"data": "test"}},
		{"empty type", map[string]interface{}{"type": ""}},
		{"invalid type", map[string]interface{}{"type": "hack"}},
	}

	for _, tt := range tests {
		valid, _ := ValidateMessage(tt.msg)
		if valid {
			t.Errorf("%s: expected invalid", tt.name)
		}
	}
}

// --- ValidateDocumentID ---

func TestValidateDocumentID_Valid(t *testing.T) {
	validIDs := []string{
		"doc-1",
		"my_document",
		"room:abc123",
		"playground:text:block-1",
		"ABC123",
	}

	for _, id := range validIDs {
		valid, errMsg := ValidateDocumentID(id)
		if !valid {
			t.Errorf("Expected %q to be valid, got error: %s", id, errMsg)
		}
	}
}

func TestValidateDocumentID_Invalid(t *testing.T) {
	tests := []struct {
		name string
		id   string
	}{
		{"empty", ""},
		{"spaces", "doc 1"},
		{"special chars", "doc@#$"},
		{"too long", string(make([]byte, 257))},
	}

	for _, tt := range tests {
		valid, _ := ValidateDocumentID(tt.id)
		if valid {
			t.Errorf("%s: expected invalid for %q", tt.name, tt.id)
		}
	}
}

// --- CanAccessDocument ---

func TestCanAccessDocument(t *testing.T) {
	tests := []struct {
		docID string
		want  bool
	}{
		{"playground", true},
		{"playground:text:block-1", true},
		{"wordwall", true},
		{"wordwall:submissions", true},
		{"room:abc123", true},
		{"room:abc:text:block-1", true},
		{"1769512101803", true},              // timestamp page ID
		{"1769512101803:text:block-1", true}, // timestamp page child
		{"private-doc", false},
		{"secret", false},
	}

	for _, tt := range tests {
		got := CanAccessDocument(tt.docID)
		if got != tt.want {
			t.Errorf("CanAccessDocument(%q) = %v, want %v", tt.docID, got, tt.want)
		}
	}
}

// --- SecurityLimits defaults ---

func TestSecurityLimits_Defaults(t *testing.T) {
	if SecurityLimits.MaxConnectionsPerIP != 50 {
		t.Errorf("MaxConnectionsPerIP = %d, want 50", SecurityLimits.MaxConnectionsPerIP)
	}
	if SecurityLimits.MaxMessagesPerMinute != 500 {
		t.Errorf("MaxMessagesPerMinute = %d, want 500", SecurityLimits.MaxMessagesPerMinute)
	}
	if SecurityLimits.MaxDocsPerIP != 20 {
		t.Errorf("MaxDocsPerIP = %d, want 20", SecurityLimits.MaxDocsPerIP)
	}
	if SecurityLimits.MaxDocsPerHour != 10 {
		t.Errorf("MaxDocsPerHour = %d, want 10", SecurityLimits.MaxDocsPerHour)
	}
	if SecurityLimits.MaxMessageSize != 2_000_000 {
		t.Errorf("MaxMessageSize = %d, want 2000000", SecurityLimits.MaxMessageSize)
	}
}
