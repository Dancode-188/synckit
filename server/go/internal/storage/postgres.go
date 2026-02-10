package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresAdapter implements StorageAdapter for PostgreSQL
type PostgresAdapter struct {
	config    *StorageConfig
	pool      *pgxpool.Pool
	connected bool
}

// NewPostgresAdapter creates a new PostgreSQL storage adapter
func NewPostgresAdapter(config *StorageConfig) *PostgresAdapter {
	if config == nil {
		config = DefaultStorageConfig()
	}
	return &PostgresAdapter{
		config: config,
	}
}

// Connect establishes connection to PostgreSQL
func (p *PostgresAdapter) Connect(ctx context.Context) error {
	poolConfig, err := pgxpool.ParseConfig(p.config.ConnectionString)
	if err != nil {
		return NewConnectionError("failed to parse connection string", err)
	}

	poolConfig.MinConns = p.config.PoolMinConns
	poolConfig.MaxConns = p.config.PoolMaxConns
	poolConfig.ConnConfig.ConnectTimeout = p.config.ConnectionTimeout

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return NewConnectionError("failed to connect to PostgreSQL", err)
	}

	// Test connection
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return NewConnectionError("failed to ping PostgreSQL", err)
	}

	p.pool = pool
	p.connected = true
	return nil
}

// Disconnect closes the connection pool
func (p *PostgresAdapter) Disconnect(ctx context.Context) error {
	if p.pool != nil {
		p.pool.Close()
		p.connected = false
	}
	return nil
}

// IsConnected returns connection status
func (p *PostgresAdapter) IsConnected() bool {
	return p.connected && p.pool != nil
}

// HealthCheck verifies database connectivity
func (p *PostgresAdapter) HealthCheck(ctx context.Context) (bool, error) {
	if !p.IsConnected() {
		return false, ErrNotConnected
	}
	err := p.pool.Ping(ctx)
	return err == nil, err
}

// GetDocument retrieves a document by ID
func (p *PostgresAdapter) GetDocument(ctx context.Context, id string) (*DocumentState, error) {
	if !p.IsConnected() {
		return nil, ErrNotConnected
	}

	query := `SELECT id, state, version, created_at, updated_at FROM documents WHERE id = $1`
	row := p.pool.QueryRow(ctx, query, id)

	var doc DocumentState
	var stateJSON []byte

	err := row.Scan(&doc.ID, &stateJSON, &doc.Version, &doc.CreatedAt, &doc.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, NewQueryError("failed to get document", err)
	}

	if err := json.Unmarshal(stateJSON, &doc.State); err != nil {
		return nil, NewQueryError("failed to unmarshal state", err)
	}

	return &doc, nil
}

// SaveDocument creates or updates a document
func (p *PostgresAdapter) SaveDocument(ctx context.Context, id string, state map[string]interface{}) (*DocumentState, error) {
	if !p.IsConnected() {
		return nil, ErrNotConnected
	}

	stateJSON, err := json.Marshal(state)
	if err != nil {
		return nil, NewQueryError("failed to marshal state", err)
	}

	query := `
		INSERT INTO documents (id, state, version)
		VALUES ($1, $2, 1)
		ON CONFLICT (id) DO UPDATE
		SET state = $2, updated_at = NOW()
		RETURNING id, state, version, created_at, updated_at
	`

	row := p.pool.QueryRow(ctx, query, id, stateJSON)

	var doc DocumentState
	var returnedStateJSON []byte

	err = row.Scan(&doc.ID, &returnedStateJSON, &doc.Version, &doc.CreatedAt, &doc.UpdatedAt)
	if err != nil {
		return nil, NewQueryError("failed to save document", err)
	}

	if err := json.Unmarshal(returnedStateJSON, &doc.State); err != nil {
		return nil, NewQueryError("failed to unmarshal state", err)
	}

	return &doc, nil
}

// UpdateDocument updates an existing document
func (p *PostgresAdapter) UpdateDocument(ctx context.Context, id string, state map[string]interface{}) (*DocumentState, error) {
	if !p.IsConnected() {
		return nil, ErrNotConnected
	}

	stateJSON, err := json.Marshal(state)
	if err != nil {
		return nil, NewQueryError("failed to marshal state", err)
	}

	query := `
		UPDATE documents
		SET state = $2, updated_at = NOW()
		WHERE id = $1
		RETURNING id, state, version, created_at, updated_at
	`

	row := p.pool.QueryRow(ctx, query, id, stateJSON)

	var doc DocumentState
	var returnedStateJSON []byte

	err = row.Scan(&doc.ID, &returnedStateJSON, &doc.Version, &doc.CreatedAt, &doc.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, NewNotFoundError("document", id)
		}
		return nil, NewQueryError("failed to update document", err)
	}

	if err := json.Unmarshal(returnedStateJSON, &doc.State); err != nil {
		return nil, NewQueryError("failed to unmarshal state", err)
	}

	return &doc, nil
}

// DeleteDocument removes a document
func (p *PostgresAdapter) DeleteDocument(ctx context.Context, id string) (bool, error) {
	if !p.IsConnected() {
		return false, ErrNotConnected
	}

	result, err := p.pool.Exec(ctx, "DELETE FROM documents WHERE id = $1", id)
	if err != nil {
		return false, NewQueryError("failed to delete document", err)
	}
	return result.RowsAffected() > 0, nil
}

// ListDocuments retrieves documents with pagination
func (p *PostgresAdapter) ListDocuments(ctx context.Context, limit, offset int) ([]*DocumentState, error) {
	if !p.IsConnected() {
		return nil, ErrNotConnected
	}

	if limit <= 0 {
		limit = 100
	}

	query := `
		SELECT id, state, version, created_at, updated_at
		FROM documents
		ORDER BY updated_at DESC
		LIMIT $1 OFFSET $2
	`

	rows, err := p.pool.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, NewQueryError("failed to list documents", err)
	}
	defer rows.Close()

	var docs []*DocumentState
	for rows.Next() {
		var doc DocumentState
		var stateJSON []byte

		if err := rows.Scan(&doc.ID, &stateJSON, &doc.Version, &doc.CreatedAt, &doc.UpdatedAt); err != nil {
			return nil, NewQueryError("failed to scan document", err)
		}

		if err := json.Unmarshal(stateJSON, &doc.State); err != nil {
			return nil, NewQueryError("failed to unmarshal state", err)
		}

		docs = append(docs, &doc)
	}

	return docs, nil
}

// GetVectorClock retrieves vector clock for a document
func (p *PostgresAdapter) GetVectorClock(ctx context.Context, documentID string) (map[string]int64, error) {
	if !p.IsConnected() {
		return nil, ErrNotConnected
	}

	query := `SELECT client_id, clock_value FROM vector_clocks WHERE document_id = $1`

	rows, err := p.pool.Query(ctx, query, documentID)
	if err != nil {
		return nil, NewQueryError("failed to get vector clock", err)
	}
	defer rows.Close()

	clock := make(map[string]int64)
	for rows.Next() {
		var clientID string
		var clockValue int64
		if err := rows.Scan(&clientID, &clockValue); err != nil {
			return nil, NewQueryError("failed to scan vector clock", err)
		}
		clock[clientID] = clockValue
	}

	return clock, nil
}

// UpdateVectorClock updates a single vector clock entry
func (p *PostgresAdapter) UpdateVectorClock(ctx context.Context, documentID, clientID string, clockValue int64) error {
	if !p.IsConnected() {
		return ErrNotConnected
	}

	query := `
		INSERT INTO vector_clocks (document_id, client_id, clock_value, updated_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (document_id, client_id)
		DO UPDATE SET clock_value = $3, updated_at = NOW()
	`

	_, err := p.pool.Exec(ctx, query, documentID, clientID, clockValue)
	if err != nil {
		return NewQueryError("failed to update vector clock", err)
	}

	return nil
}

// MergeVectorClock merges multiple vector clock entries atomically
func (p *PostgresAdapter) MergeVectorClock(ctx context.Context, documentID string, clock map[string]int64) error {
	if !p.IsConnected() {
		return ErrNotConnected
	}

	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return NewQueryError("failed to begin transaction", err)
	}
	defer tx.Rollback(ctx)

	query := `
		INSERT INTO vector_clocks (document_id, client_id, clock_value, updated_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (document_id, client_id)
		DO UPDATE SET
			clock_value = GREATEST(vector_clocks.clock_value, $3),
			updated_at = NOW()
	`

	for clientID, clockValue := range clock {
		if _, err := tx.Exec(ctx, query, documentID, clientID, clockValue); err != nil {
			return NewQueryError("failed to merge vector clock entry", err)
		}
	}

	return tx.Commit(ctx)
}

// SaveDelta saves an operation to the audit trail
func (p *PostgresAdapter) SaveDelta(ctx context.Context, delta *DeltaEntry) (*DeltaEntry, error) {
	if !p.IsConnected() {
		return nil, ErrNotConnected
	}

	valueJSON, err := json.Marshal(delta.Value)
	if err != nil {
		return nil, NewQueryError("failed to marshal delta value", err)
	}

	query := `
		INSERT INTO deltas (document_id, client_id, operation_type, field_path, value, clock_value)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, timestamp
	`

	row := p.pool.QueryRow(ctx, query, delta.DocumentID, delta.ClientID, delta.OperationType, delta.FieldPath, valueJSON, delta.ClockValue)

	err = row.Scan(&delta.ID, &delta.Timestamp)
	if err != nil {
		return nil, NewQueryError("failed to save delta", err)
	}

	return delta, nil
}

// GetDeltas retrieves deltas for a document
func (p *PostgresAdapter) GetDeltas(ctx context.Context, documentID string, limit int) ([]*DeltaEntry, error) {
	if !p.IsConnected() {
		return nil, ErrNotConnected
	}

	if limit <= 0 {
		limit = 100
	}

	query := `
		SELECT id, document_id, client_id, operation_type, field_path, value, clock_value, timestamp
		FROM deltas
		WHERE document_id = $1
		ORDER BY timestamp DESC
		LIMIT $2
	`

	rows, err := p.pool.Query(ctx, query, documentID, limit)
	if err != nil {
		return nil, NewQueryError("failed to get deltas", err)
	}
	defer rows.Close()

	var deltas []*DeltaEntry
	for rows.Next() {
		var delta DeltaEntry
		var valueJSON []byte

		if err := rows.Scan(&delta.ID, &delta.DocumentID, &delta.ClientID, &delta.OperationType, &delta.FieldPath, &valueJSON, &delta.ClockValue, &delta.Timestamp); err != nil {
			return nil, NewQueryError("failed to scan delta", err)
		}

		if valueJSON != nil {
			if err := json.Unmarshal(valueJSON, &delta.Value); err != nil {
				return nil, NewQueryError("failed to unmarshal delta value", err)
			}
		}

		deltas = append(deltas, &delta)
	}

	return deltas, nil
}

// SaveSession saves a connection session
func (p *PostgresAdapter) SaveSession(ctx context.Context, session *SessionEntry) (*SessionEntry, error) {
	if !p.IsConnected() {
		return nil, ErrNotConnected
	}

	metadataJSON, err := json.Marshal(session.Metadata)
	if err != nil {
		return nil, NewQueryError("failed to marshal metadata", err)
	}

	query := `
		INSERT INTO sessions (id, user_id, client_id, metadata)
		VALUES ($1, $2, $3, $4)
		RETURNING connected_at, last_seen
	`

	row := p.pool.QueryRow(ctx, query, session.ID, session.UserID, session.ClientID, metadataJSON)

	err = row.Scan(&session.ConnectedAt, &session.LastSeen)
	if err != nil {
		return nil, NewQueryError("failed to save session", err)
	}

	return session, nil
}

// UpdateSession updates a session's last seen time
func (p *PostgresAdapter) UpdateSession(ctx context.Context, sessionID string, lastSeen time.Time, metadata map[string]interface{}) error {
	if !p.IsConnected() {
		return ErrNotConnected
	}

	var query string
	var args []interface{}

	if metadata != nil {
		metadataJSON, err := json.Marshal(metadata)
		if err != nil {
			return NewQueryError("failed to marshal metadata", err)
		}
		query = `UPDATE sessions SET last_seen = $2, metadata = $3 WHERE id = $1`
		args = []interface{}{sessionID, lastSeen, metadataJSON}
	} else {
		query = `UPDATE sessions SET last_seen = $2 WHERE id = $1`
		args = []interface{}{sessionID, lastSeen}
	}

	_, err := p.pool.Exec(ctx, query, args...)
	if err != nil {
		return NewQueryError("failed to update session", err)
	}

	return nil
}

// DeleteSession removes a session
func (p *PostgresAdapter) DeleteSession(ctx context.Context, sessionID string) (bool, error) {
	if !p.IsConnected() {
		return false, ErrNotConnected
	}

	result, err := p.pool.Exec(ctx, "DELETE FROM sessions WHERE id = $1", sessionID)
	if err != nil {
		return false, NewQueryError("failed to delete session", err)
	}
	return result.RowsAffected() > 0, nil
}

// GetSessions retrieves sessions for a user
func (p *PostgresAdapter) GetSessions(ctx context.Context, userID string) ([]*SessionEntry, error) {
	if !p.IsConnected() {
		return nil, ErrNotConnected
	}

	query := `
		SELECT id, user_id, client_id, connected_at, last_seen, metadata
		FROM sessions
		WHERE user_id = $1
		ORDER BY last_seen DESC
	`

	rows, err := p.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, NewQueryError("failed to get sessions", err)
	}
	defer rows.Close()

	var sessions []*SessionEntry
	for rows.Next() {
		var session SessionEntry
		var metadataJSON []byte

		if err := rows.Scan(&session.ID, &session.UserID, &session.ClientID, &session.ConnectedAt, &session.LastSeen, &metadataJSON); err != nil {
			return nil, NewQueryError("failed to scan session", err)
		}

		if metadataJSON != nil {
			if err := json.Unmarshal(metadataJSON, &session.Metadata); err != nil {
				return nil, NewQueryError("failed to unmarshal metadata", err)
			}
		}

		sessions = append(sessions, &session)
	}

	return sessions, nil
}

// SaveSnapshot saves a document snapshot
func (p *PostgresAdapter) SaveSnapshot(ctx context.Context, snapshot *SnapshotEntry) (*SnapshotEntry, error) {
	if !p.IsConnected() {
		return nil, ErrNotConnected
	}

	stateJSON, err := json.Marshal(snapshot.State)
	if err != nil {
		return nil, NewQueryError("failed to marshal state", err)
	}

	versionJSON, err := json.Marshal(snapshot.Version)
	if err != nil {
		return nil, NewQueryError("failed to marshal version", err)
	}

	query := `
		INSERT INTO snapshots (document_id, state, version, size_bytes, compressed)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at
	`

	row := p.pool.QueryRow(ctx, query, snapshot.DocumentID, stateJSON, versionJSON, snapshot.SizeBytes, snapshot.Compressed)

	err = row.Scan(&snapshot.ID, &snapshot.CreatedAt)
	if err != nil {
		return nil, NewQueryError("failed to save snapshot", err)
	}

	return snapshot, nil
}

// GetSnapshot retrieves a snapshot by ID
func (p *PostgresAdapter) GetSnapshot(ctx context.Context, snapshotID string) (*SnapshotEntry, error) {
	if !p.IsConnected() {
		return nil, ErrNotConnected
	}

	query := `
		SELECT id, document_id, state, version, size_bytes, compressed, created_at
		FROM snapshots
		WHERE id = $1
	`

	row := p.pool.QueryRow(ctx, query, snapshotID)
	return p.scanSnapshot(row)
}

// GetLatestSnapshot retrieves the most recent snapshot for a document
func (p *PostgresAdapter) GetLatestSnapshot(ctx context.Context, documentID string) (*SnapshotEntry, error) {
	if !p.IsConnected() {
		return nil, ErrNotConnected
	}

	query := `
		SELECT id, document_id, state, version, size_bytes, compressed, created_at
		FROM snapshots
		WHERE document_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`

	row := p.pool.QueryRow(ctx, query, documentID)
	return p.scanSnapshot(row)
}

// ListSnapshots retrieves snapshots for a document
func (p *PostgresAdapter) ListSnapshots(ctx context.Context, documentID string, limit int) ([]*SnapshotEntry, error) {
	if !p.IsConnected() {
		return nil, ErrNotConnected
	}

	if limit <= 0 {
		limit = 10
	}

	query := `
		SELECT id, document_id, state, version, size_bytes, compressed, created_at
		FROM snapshots
		WHERE document_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`

	rows, err := p.pool.Query(ctx, query, documentID, limit)
	if err != nil {
		return nil, NewQueryError("failed to list snapshots", err)
	}
	defer rows.Close()

	var snapshots []*SnapshotEntry
	for rows.Next() {
		var snapshot SnapshotEntry
		var stateJSON, versionJSON []byte

		if err := rows.Scan(&snapshot.ID, &snapshot.DocumentID, &stateJSON, &versionJSON, &snapshot.SizeBytes, &snapshot.Compressed, &snapshot.CreatedAt); err != nil {
			return nil, NewQueryError("failed to scan snapshot", err)
		}

		if err := json.Unmarshal(stateJSON, &snapshot.State); err != nil {
			return nil, NewQueryError("failed to unmarshal state", err)
		}

		if err := json.Unmarshal(versionJSON, &snapshot.Version); err != nil {
			return nil, NewQueryError("failed to unmarshal version", err)
		}

		snapshots = append(snapshots, &snapshot)
	}

	return snapshots, nil
}

// DeleteSnapshot removes a snapshot
func (p *PostgresAdapter) DeleteSnapshot(ctx context.Context, snapshotID string) (bool, error) {
	if !p.IsConnected() {
		return false, ErrNotConnected
	}

	result, err := p.pool.Exec(ctx, "DELETE FROM snapshots WHERE id = $1", snapshotID)
	if err != nil {
		return false, NewQueryError("failed to delete snapshot", err)
	}
	return result.RowsAffected() > 0, nil
}

// SaveTextDocument saves a SyncText (Fugue CRDT) document
func (p *PostgresAdapter) SaveTextDocument(ctx context.Context, id, content, crdtState string, clock int64) (*TextDocumentState, error) {
	if !p.IsConnected() {
		return nil, ErrNotConnected
	}

	// Store as JSONB with type field for identification
	state := map[string]interface{}{
		"type":    "text",
		"content": content,
		"crdt":    crdtState,
		"clock":   clock,
	}

	stateJSON, err := json.Marshal(state)
	if err != nil {
		return nil, NewQueryError("failed to marshal text state", err)
	}

	query := `
		INSERT INTO documents (id, state, version)
		VALUES ($1, $2, 1)
		ON CONFLICT (id) DO UPDATE
		SET state = $2, updated_at = NOW()
		RETURNING created_at, updated_at
	`

	row := p.pool.QueryRow(ctx, query, id, stateJSON)

	var textDoc TextDocumentState
	textDoc.ID = id
	textDoc.Content = content
	textDoc.CRDTState = crdtState
	textDoc.Clock = clock

	err = row.Scan(&textDoc.CreatedAt, &textDoc.UpdatedAt)
	if err != nil {
		return nil, NewQueryError("failed to save text document", err)
	}

	return &textDoc, nil
}

// GetTextDocument retrieves a SyncText document
func (p *PostgresAdapter) GetTextDocument(ctx context.Context, id string) (*TextDocumentState, error) {
	if !p.IsConnected() {
		return nil, ErrNotConnected
	}

	query := `SELECT id, state, created_at, updated_at FROM documents WHERE id = $1`
	row := p.pool.QueryRow(ctx, query, id)

	var docID string
	var stateJSON []byte
	var createdAt, updatedAt time.Time

	err := row.Scan(&docID, &stateJSON, &createdAt, &updatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, NewQueryError("failed to get text document", err)
	}

	var state map[string]interface{}
	if err := json.Unmarshal(stateJSON, &state); err != nil {
		return nil, NewQueryError("failed to unmarshal state", err)
	}

	// Check if this is a text document
	if state["type"] != "text" || state["crdt"] == nil {
		return nil, nil // Not a text document
	}

	textDoc := &TextDocumentState{
		ID:        docID,
		CreatedAt: createdAt,
		UpdatedAt: updatedAt,
	}

	if content, ok := state["content"].(string); ok {
		textDoc.Content = content
	}
	if crdtState, ok := state["crdt"].(string); ok {
		textDoc.CRDTState = crdtState
	}
	if clock, ok := state["clock"].(float64); ok {
		textDoc.Clock = int64(clock)
	}

	return textDoc, nil
}

// Cleanup removes old data based on options
func (p *PostgresAdapter) Cleanup(ctx context.Context, options *CleanupOptions) (*CleanupResult, error) {
	if !p.IsConnected() {
		return nil, ErrNotConnected
	}

	if options == nil {
		options = &CleanupOptions{
			OldSessionsHours: 24,
			OldDeltasDays:    30,
			MaxSnapshotsPerDocument: 10,
		}
	}

	result := &CleanupResult{}

	// Clean old sessions
	if options.OldSessionsHours > 0 {
		sessionsQuery := fmt.Sprintf(
			`DELETE FROM sessions WHERE last_seen < NOW() - INTERVAL '%d hours'`,
			options.OldSessionsHours,
		)
		r, err := p.pool.Exec(ctx, sessionsQuery)
		if err == nil {
			result.SessionsDeleted = int(r.RowsAffected())
		}
	}

	// Clean old deltas
	if options.OldDeltasDays > 0 {
		deltasQuery := fmt.Sprintf(
			`DELETE FROM deltas WHERE timestamp < NOW() - INTERVAL '%d days'`,
			options.OldDeltasDays,
		)
		r, err := p.pool.Exec(ctx, deltasQuery)
		if err == nil {
			result.DeltasDeleted = int(r.RowsAffected())
		}
	}

	// Clean old snapshots (keep only maxSnapshotsPerDocument per document)
	if options.MaxSnapshotsPerDocument > 0 {
		// This is a more complex query - delete snapshots beyond the limit per document
		snapshotsQuery := `
			DELETE FROM snapshots
			WHERE id IN (
				SELECT id FROM (
					SELECT id, ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY created_at DESC) as rn
					FROM snapshots
				) ranked
				WHERE rn > $1
			)
		`
		r, err := p.pool.Exec(ctx, snapshotsQuery, options.MaxSnapshotsPerDocument)
		if err == nil {
			result.SnapshotsDeleted = int(r.RowsAffected())
		}
	}

	return result, nil
}

// Helper function to scan a snapshot row
func (p *PostgresAdapter) scanSnapshot(row pgx.Row) (*SnapshotEntry, error) {
	var snapshot SnapshotEntry
	var stateJSON, versionJSON []byte

	err := row.Scan(&snapshot.ID, &snapshot.DocumentID, &stateJSON, &versionJSON, &snapshot.SizeBytes, &snapshot.Compressed, &snapshot.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, NewQueryError("failed to scan snapshot", err)
	}

	if err := json.Unmarshal(stateJSON, &snapshot.State); err != nil {
		return nil, NewQueryError("failed to unmarshal state", err)
	}

	if err := json.Unmarshal(versionJSON, &snapshot.Version); err != nil {
		return nil, NewQueryError("failed to unmarshal version", err)
	}

	return &snapshot, nil
}
