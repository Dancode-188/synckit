// Package storage provides database adapters for document persistence.
// Matches TypeScript reference: server/typescript/src/storage/interface.ts
package storage

import (
	"context"
	"time"
)

// DocumentState represents a stored document
type DocumentState struct {
	ID        string                 `json:"id"`
	State     map[string]interface{} `json:"state"`
	Version   int64                  `json:"version"`
	CreatedAt time.Time              `json:"createdAt"`
	UpdatedAt time.Time              `json:"updatedAt"`
}

// VectorClockEntry represents a vector clock entry for a document
type VectorClockEntry struct {
	DocumentID string    `json:"documentId"`
	ClientID   string    `json:"clientId"`
	ClockValue int64     `json:"clockValue"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// DeltaEntry represents an operation in the audit trail
type DeltaEntry struct {
	ID            string                 `json:"id"`
	DocumentID    string                 `json:"documentId"`
	ClientID      string                 `json:"clientId"`
	OperationType string                 `json:"operationType"` // "set", "delete", "merge"
	FieldPath     string                 `json:"fieldPath"`
	Value         map[string]interface{} `json:"value,omitempty"`
	ClockValue    int64                  `json:"clockValue"`
	Timestamp     time.Time              `json:"timestamp"`
}

// SessionEntry represents an active connection session
type SessionEntry struct {
	ID          string                 `json:"id"`
	UserID      string                 `json:"userId"`
	ClientID    string                 `json:"clientId,omitempty"`
	ConnectedAt time.Time              `json:"connectedAt"`
	LastSeen    time.Time              `json:"lastSeen"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

// SnapshotEntry represents a point-in-time document snapshot
type SnapshotEntry struct {
	ID         string                 `json:"id"`
	DocumentID string                 `json:"documentId"`
	State      map[string]interface{} `json:"state"`
	Version    map[string]int64       `json:"version"` // Vector clock at snapshot
	SizeBytes  int                    `json:"sizeBytes"`
	Compressed bool                   `json:"compressed"`
	CreatedAt  time.Time              `json:"createdAt"`
}

// TextDocumentState represents a SyncText (Fugue CRDT) document
type TextDocumentState struct {
	ID        string    `json:"id"`
	Content   string    `json:"content"`   // Plain text content
	CRDTState string    `json:"crdtState"` // Full Fugue CRDT JSON state
	Clock     int64     `json:"clock"`     // Lamport clock
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// CleanupOptions specifies what to clean up
type CleanupOptions struct {
	OldSessionsHours        int
	OldDeltasDays           int
	OldSnapshotsDays        int
	MaxSnapshotsPerDocument int
}

// CleanupResult contains cleanup statistics
type CleanupResult struct {
	SessionsDeleted  int `json:"sessionsDeleted"`
	DeltasDeleted    int `json:"deltasDeleted"`
	SnapshotsDeleted int `json:"snapshotsDeleted"`
}

// StorageAdapter defines the interface for document persistence
type StorageAdapter interface {
	// Connection lifecycle
	Connect(ctx context.Context) error
	Disconnect(ctx context.Context) error
	IsConnected() bool
	HealthCheck(ctx context.Context) (bool, error)

	// Document operations
	GetDocument(ctx context.Context, id string) (*DocumentState, error)
	SaveDocument(ctx context.Context, id string, state map[string]interface{}) (*DocumentState, error)
	UpdateDocument(ctx context.Context, id string, state map[string]interface{}) (*DocumentState, error)
	DeleteDocument(ctx context.Context, id string) (bool, error)
	ListDocuments(ctx context.Context, limit, offset int) ([]*DocumentState, error)

	// Vector clock operations
	GetVectorClock(ctx context.Context, documentID string) (map[string]int64, error)
	UpdateVectorClock(ctx context.Context, documentID, clientID string, clockValue int64) error
	MergeVectorClock(ctx context.Context, documentID string, clock map[string]int64) error

	// Delta operations (for audit trail)
	SaveDelta(ctx context.Context, delta *DeltaEntry) (*DeltaEntry, error)
	GetDeltas(ctx context.Context, documentID string, limit int) ([]*DeltaEntry, error)

	// Session operations (for connection tracking)
	SaveSession(ctx context.Context, session *SessionEntry) (*SessionEntry, error)
	UpdateSession(ctx context.Context, sessionID string, lastSeen time.Time, metadata map[string]interface{}) error
	DeleteSession(ctx context.Context, sessionID string) (bool, error)
	GetSessions(ctx context.Context, userID string) ([]*SessionEntry, error)

	// Snapshot operations
	SaveSnapshot(ctx context.Context, snapshot *SnapshotEntry) (*SnapshotEntry, error)
	GetSnapshot(ctx context.Context, snapshotID string) (*SnapshotEntry, error)
	GetLatestSnapshot(ctx context.Context, documentID string) (*SnapshotEntry, error)
	ListSnapshots(ctx context.Context, documentID string, limit int) ([]*SnapshotEntry, error)
	DeleteSnapshot(ctx context.Context, snapshotID string) (bool, error)

	// Text document operations (for SyncText/Fugue CRDT)
	SaveTextDocument(ctx context.Context, id, content, crdtState string, clock int64) (*TextDocumentState, error)
	GetTextDocument(ctx context.Context, id string) (*TextDocumentState, error)

	// Maintenance
	Cleanup(ctx context.Context, options *CleanupOptions) (*CleanupResult, error)
}

// StorageConfig holds configuration for storage adapters
type StorageConfig struct {
	ConnectionString  string
	PoolMinConns      int32
	PoolMaxConns      int32
	ConnectionTimeout time.Duration
}

// DefaultStorageConfig returns sensible defaults
func DefaultStorageConfig() *StorageConfig {
	return &StorageConfig{
		PoolMinConns:      2,
		PoolMaxConns:      10,
		ConnectionTimeout: 5 * time.Second,
	}
}
