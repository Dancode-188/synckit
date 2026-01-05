-- SyncKit Database Schema
-- PostgreSQL 15+
-- Version: 0.1.0

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- DOCUMENTS TABLE
-- =============================================================================
-- Stores document states with JSONB for flexible schema
CREATE TABLE IF NOT EXISTS documents (
  id VARCHAR(255) PRIMARY KEY,
  state JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  version BIGINT NOT NULL DEFAULT 1
);

-- Index for fast state queries
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at DESC);

-- =============================================================================
-- VECTOR CLOCKS TABLE
-- =============================================================================
-- Stores vector clock state for each document
CREATE TABLE IF NOT EXISTS vector_clocks (
  document_id VARCHAR(255) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  clock_value BIGINT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (document_id, client_id),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Index for fast clock lookups
CREATE INDEX IF NOT EXISTS idx_vector_clocks_document_id ON vector_clocks(document_id);
CREATE INDEX IF NOT EXISTS idx_vector_clocks_updated_at ON vector_clocks(updated_at DESC);

-- =============================================================================
-- DELTAS TABLE (Optional - for audit trail and replication)
-- =============================================================================
-- Stores operation history for debugging and replication
CREATE TABLE IF NOT EXISTS deltas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id VARCHAR(255) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  operation_type VARCHAR(50) NOT NULL, -- 'set', 'delete', 'merge'
  field_path VARCHAR(500) NOT NULL,
  value JSONB,
  clock_value BIGINT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Indexes for delta queries
CREATE INDEX IF NOT EXISTS idx_deltas_document_id ON deltas(document_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_deltas_timestamp ON deltas(timestamp DESC);

-- =============================================================================
-- SESSIONS TABLE (Optional - for connection tracking)
-- =============================================================================
-- Tracks active WebSocket sessions across server restarts
CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  client_id VARCHAR(255),
  connected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Index for session lookups
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions(last_seen DESC);

-- =============================================================================
-- SNAPSHOTS TABLE (Optional - for document state snapshots)
-- =============================================================================
-- Stores point-in-time snapshots of document states
CREATE TABLE IF NOT EXISTS snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id VARCHAR(255) NOT NULL,
  state JSONB NOT NULL,
  version JSONB NOT NULL, -- Stores vector clock at time of snapshot
  size_bytes INTEGER NOT NULL,
  compressed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Indexes for snapshot queries
CREATE INDEX IF NOT EXISTS idx_snapshots_document_id ON snapshots(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_created_at ON snapshots(created_at DESC);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for documents table
DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Increment version on document update
CREATE OR REPLACE FUNCTION increment_document_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for version increment
DROP TRIGGER IF EXISTS increment_documents_version ON documents;
CREATE TRIGGER increment_documents_version
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION increment_document_version();

-- =============================================================================
-- VIEWS
-- =============================================================================

-- View for document with vector clock
CREATE OR REPLACE VIEW documents_with_clocks AS
SELECT 
  d.id,
  d.state,
  d.version,
  d.created_at,
  d.updated_at,
  json_object_agg(vc.client_id, vc.clock_value) FILTER (WHERE vc.client_id IS NOT NULL) as vector_clock
FROM documents d
LEFT JOIN vector_clocks vc ON d.id = vc.document_id
GROUP BY d.id, d.state, d.version, d.created_at, d.updated_at;

-- =============================================================================
-- CLEANUP FUNCTIONS
-- =============================================================================

-- Clean up old sessions (older than 24 hours)
CREATE OR REPLACE FUNCTION cleanup_old_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM sessions
  WHERE last_seen < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Clean up old deltas (optional - older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_deltas()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM deltas
  WHERE timestamp < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE documents IS 'Stores document states with JSONB for flexible schema';
COMMENT ON TABLE vector_clocks IS 'Tracks vector clock values for causality tracking';
COMMENT ON TABLE deltas IS 'Audit trail of all document operations (optional)';
COMMENT ON TABLE sessions IS 'Active WebSocket session tracking (optional)';
COMMENT ON TABLE snapshots IS 'Point-in-time snapshots of document states (optional)';

COMMENT ON COLUMN documents.state IS 'Document state stored as JSONB for flexibility';
COMMENT ON COLUMN documents.version IS 'Monotonically increasing version number';
COMMENT ON COLUMN vector_clocks.clock_value IS 'Lamport timestamp for this client';
COMMENT ON COLUMN deltas.operation_type IS 'Type of operation: set, delete, or merge';
COMMENT ON COLUMN snapshots.version IS 'Vector clock state at time of snapshot';
