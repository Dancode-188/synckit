package storage

import (
	"testing"
	"time"
)

// --- Data Structures ---

func TestDocumentState_Creation(t *testing.T) {
	now := time.Now()
	doc := DocumentState{
		ID:        "doc-1",
		State:     map[string]interface{}{"key": "value", "nested": map[string]interface{}{"a": 1}},
		Version:   1,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if doc.ID != "doc-1" {
		t.Errorf("ID = %q, want %q", doc.ID, "doc-1")
	}
	if doc.Version != 1 {
		t.Errorf("Version = %d, want 1", doc.Version)
	}
	if doc.State["key"] != "value" {
		t.Error("Expected state key to be 'value'")
	}
	nested, ok := doc.State["nested"].(map[string]interface{})
	if !ok {
		t.Fatal("Expected nested map in state")
	}
	if nested["a"] != 1 {
		t.Error("Expected nested.a to be 1")
	}
}

func TestVectorClockEntry_Creation(t *testing.T) {
	entry := VectorClockEntry{
		DocumentID: "doc-1",
		ClientID:   "client-a",
		ClockValue: 42,
		UpdatedAt:  time.Now(),
	}

	if entry.DocumentID != "doc-1" {
		t.Errorf("DocumentID = %q, want %q", entry.DocumentID, "doc-1")
	}
	if entry.ClockValue != 42 {
		t.Errorf("ClockValue = %d, want 42", entry.ClockValue)
	}
}

func TestDeltaEntry_SetOperation(t *testing.T) {
	delta := DeltaEntry{
		ID:            "delta-1",
		DocumentID:    "doc-1",
		ClientID:      "client-a",
		OperationType: "set",
		FieldPath:     "users.name",
		Value:         map[string]interface{}{"data": "Alice"},
		ClockValue:    5,
		Timestamp:     time.Now(),
	}

	if delta.OperationType != "set" {
		t.Errorf("OperationType = %q, want %q", delta.OperationType, "set")
	}
	if delta.FieldPath != "users.name" {
		t.Errorf("FieldPath = %q, want %q", delta.FieldPath, "users.name")
	}
}

func TestDeltaEntry_DeleteOperation(t *testing.T) {
	delta := DeltaEntry{
		ID:            "delta-2",
		DocumentID:    "doc-1",
		ClientID:      "client-a",
		OperationType: "delete",
		FieldPath:     "users.name",
		ClockValue:    6,
		Timestamp:     time.Now(),
	}

	if delta.OperationType != "delete" {
		t.Errorf("OperationType = %q, want %q", delta.OperationType, "delete")
	}
	if delta.Value != nil {
		t.Error("Delete operation should have nil value")
	}
}

func TestSessionEntry_Creation(t *testing.T) {
	now := time.Now()
	session := SessionEntry{
		ID:          "session-1",
		UserID:      "user-1",
		ClientID:    "client-a",
		ConnectedAt: now,
		LastSeen:    now,
		Metadata:    map[string]interface{}{"browser": "Chrome", "version": 120},
	}

	if session.UserID != "user-1" {
		t.Errorf("UserID = %q, want %q", session.UserID, "user-1")
	}
	if session.Metadata["browser"] != "Chrome" {
		t.Error("Expected metadata browser to be Chrome")
	}
}

func TestSnapshotEntry_Creation(t *testing.T) {
	snapshot := SnapshotEntry{
		ID:         "snap-1",
		DocumentID: "doc-1",
		State:      map[string]interface{}{"field": "value"},
		Version:    map[string]int64{"client-a": 5, "client-b": 3},
		SizeBytes:  1024,
		Compressed: true,
		CreatedAt:  time.Now(),
	}

	if snapshot.SizeBytes != 1024 {
		t.Errorf("SizeBytes = %d, want 1024", snapshot.SizeBytes)
	}
	if !snapshot.Compressed {
		t.Error("Expected Compressed to be true")
	}
	if snapshot.Version["client-a"] != 5 {
		t.Error("Expected vector clock client-a to be 5")
	}
}

func TestTextDocumentState_Creation(t *testing.T) {
	doc := TextDocumentState{
		ID:        "text-1",
		Content:   "Hello, world!",
		CRDTState: `{"nodes": [], "clock": 0}`,
		Clock:     7,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if doc.Content != "Hello, world!" {
		t.Errorf("Content = %q, want %q", doc.Content, "Hello, world!")
	}
	if doc.Clock != 7 {
		t.Errorf("Clock = %d, want 7", doc.Clock)
	}
}

// --- CleanupOptions ---

func TestCleanupOptions_Defaults(t *testing.T) {
	opts := CleanupOptions{}

	if opts.OldSessionsHours != 0 {
		t.Errorf("Default OldSessionsHours = %d, want 0", opts.OldSessionsHours)
	}
	if opts.MaxSnapshotsPerDocument != 0 {
		t.Errorf("Default MaxSnapshotsPerDocument = %d, want 0", opts.MaxSnapshotsPerDocument)
	}
}

func TestCleanupOptions_Custom(t *testing.T) {
	opts := CleanupOptions{
		OldSessionsHours:        24,
		OldDeltasDays:           30,
		OldSnapshotsDays:        90,
		MaxSnapshotsPerDocument: 10,
	}

	if opts.OldSessionsHours != 24 {
		t.Errorf("OldSessionsHours = %d, want 24", opts.OldSessionsHours)
	}
	if opts.OldDeltasDays != 30 {
		t.Errorf("OldDeltasDays = %d, want 30", opts.OldDeltasDays)
	}
}

func TestCleanupResult(t *testing.T) {
	result := CleanupResult{
		SessionsDeleted:  5,
		DeltasDeleted:    100,
		SnapshotsDeleted: 3,
	}

	if result.SessionsDeleted != 5 {
		t.Errorf("SessionsDeleted = %d, want 5", result.SessionsDeleted)
	}
	total := result.SessionsDeleted + result.DeltasDeleted + result.SnapshotsDeleted
	if total != 108 {
		t.Errorf("Total deleted = %d, want 108", total)
	}
}

// --- StorageConfig ---

func TestDefaultStorageConfig(t *testing.T) {
	cfg := DefaultStorageConfig()

	if cfg.PoolMinConns != 2 {
		t.Errorf("PoolMinConns = %d, want 2", cfg.PoolMinConns)
	}
	if cfg.PoolMaxConns != 10 {
		t.Errorf("PoolMaxConns = %d, want 10", cfg.PoolMaxConns)
	}
	if cfg.ConnectionTimeout != 5*time.Second {
		t.Errorf("ConnectionTimeout = %v, want 5s", cfg.ConnectionTimeout)
	}
}

func TestStorageConfig_Custom(t *testing.T) {
	cfg := &StorageConfig{
		ConnectionString:  "postgres://localhost:5432/synckit",
		PoolMinConns:      5,
		PoolMaxConns:      20,
		ConnectionTimeout: 10 * time.Second,
	}

	if cfg.ConnectionString != "postgres://localhost:5432/synckit" {
		t.Error("ConnectionString mismatch")
	}
	if cfg.PoolMaxConns != 20 {
		t.Errorf("PoolMaxConns = %d, want 20", cfg.PoolMaxConns)
	}
}
