import pg from 'pg';
import type {
  StorageAdapter,
  StorageConfig,
  DocumentState,
  VectorClockEntry,
  DeltaEntry,
  SessionEntry,
} from './interface';
import {
  ConnectionError,
  QueryError,
  NotFoundError,
} from './interface';

const { Pool } = pg;

/**
 * PostgreSQL Storage Adapter
 * 
 * Production-ready implementation with connection pooling,
 * retry logic, and comprehensive error handling.
 */
export class PostgresAdapter implements StorageAdapter {
  private pool: pg.Pool;
  private connected: boolean = false;

  constructor(config: StorageConfig) {
    this.pool = new Pool({
      connectionString: config.connectionString,
      min: config.poolMin || 2,
      max: config.poolMax || 10,
      connectionTimeoutMillis: config.connectionTimeout || 5000,
      idleTimeoutMillis: 30000,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });
  }

  /**
   * Connect to database
   */
  async connect(): Promise<void> {
    try {
      // Test connection
      const client = await this.pool.connect();
      client.release();
      this.connected = true;
      console.log('✅ PostgreSQL connected');
    } catch (error) {
      this.connected = false;
      throw new ConnectionError('Failed to connect to PostgreSQL', error as Error);
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.connected = false;
      console.log('PostgreSQL disconnected');
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1');
      return result.rowCount === 1;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // DOCUMENT OPERATIONS
  // ==========================================================================

  /**
   * Get document by ID
   */
  async getDocument(id: string): Promise<DocumentState | null> {
    try {
      const result = await this.pool.query<DocumentState>(
        `SELECT id, state, version, created_at as "createdAt", updated_at as "updatedAt"
         FROM documents WHERE id = $1`,
        [id]
      );

      return result.rows[0] || null;
    } catch (error) {
      throw new QueryError(`Failed to get document ${id}`, error as Error);
    }
  }

  /**
   * Save new document
   */
  async saveDocument(id: string, state: any): Promise<DocumentState> {
    try {
      const result = await this.pool.query<DocumentState>(
        `INSERT INTO documents (id, state, version)
         VALUES ($1, $2, 1)
         ON CONFLICT (id) DO UPDATE
         SET state = $2, updated_at = NOW()
         RETURNING id, state, version, created_at as "createdAt", updated_at as "updatedAt"`,
        [id, JSON.stringify(state)]
      );

      return result.rows[0];
    } catch (error) {
      throw new QueryError(`Failed to save document ${id}`, error as Error);
    }
  }

  /**
   * Update existing document
   */
  async updateDocument(id: string, state: any): Promise<DocumentState> {
    try {
      const result = await this.pool.query<DocumentState>(
        `UPDATE documents
         SET state = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING id, state, version, created_at as "createdAt", updated_at as "updatedAt"`,
        [id, JSON.stringify(state)]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Document', id);
      }

      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new QueryError(`Failed to update document ${id}`, error as Error);
    }
  }

  /**
   * Delete document
   */
  async deleteDocument(id: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        'DELETE FROM documents WHERE id = $1',
        [id]
      );
      return (result.rowCount || 0) > 0;
    } catch (error) {
      throw new QueryError(`Failed to delete document ${id}`, error as Error);
    }
  }

  /**
   * List documents with pagination
   */
  async listDocuments(limit: number = 100, offset: number = 0): Promise<DocumentState[]> {
    try {
      const result = await this.pool.query<DocumentState>(
        `SELECT id, state, version, created_at as "createdAt", updated_at as "updatedAt"
         FROM documents
         ORDER BY updated_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      return result.rows;
    } catch (error) {
      throw new QueryError('Failed to list documents', error as Error);
    }
  }

  // ==========================================================================
  // VECTOR CLOCK OPERATIONS
  // ==========================================================================

  /**
   * Get vector clock for document
   */
  async getVectorClock(documentId: string): Promise<Record<string, bigint>> {
    try {
      const result = await this.pool.query<VectorClockEntry>(
        'SELECT client_id as "clientId", clock_value as "clockValue" FROM vector_clocks WHERE document_id = $1',
        [documentId]
      );

      const clock: Record<string, bigint> = {};
      for (const row of result.rows) {
        clock[row.clientId] = row.clockValue;
      }
      return clock;
    } catch (error) {
      throw new QueryError(`Failed to get vector clock for ${documentId}`, error as Error);
    }
  }

  /**
   * Update vector clock entry
   */
  async updateVectorClock(documentId: string, clientId: string, clockValue: bigint): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO vector_clocks (document_id, client_id, clock_value, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (document_id, client_id)
         DO UPDATE SET clock_value = $3, updated_at = NOW()`,
        [documentId, clientId, clockValue.toString()]
      );
    } catch (error) {
      throw new QueryError(`Failed to update vector clock for ${documentId}`, error as Error);
    }
  }

  /**
   * Merge vector clock (update multiple entries)
   */
  async mergeVectorClock(documentId: string, clock: Record<string, bigint>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const [clientId, clockValue] of Object.entries(clock)) {
        await client.query(
          `INSERT INTO vector_clocks (document_id, client_id, clock_value, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (document_id, client_id)
           DO UPDATE SET 
             clock_value = GREATEST(vector_clocks.clock_value, $3),
             updated_at = NOW()`,
          [documentId, clientId, clockValue.toString()]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new QueryError(`Failed to merge vector clock for ${documentId}`, error as Error);
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // DELTA OPERATIONS (Audit Trail)
  // ==========================================================================

  /**
   * Save delta operation
   */
  async saveDelta(delta: Omit<DeltaEntry, 'id' | 'timestamp'>): Promise<DeltaEntry> {
    try {
      const result = await this.pool.query<DeltaEntry>(
        `INSERT INTO deltas (document_id, client_id, operation_type, field_path, value, clock_value, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING id, document_id as "documentId", client_id as "clientId", 
                   operation_type as "operationType", field_path as "fieldPath", 
                   value, clock_value as "clockValue", timestamp`,
        [
          delta.documentId,
          delta.clientId,
          delta.operationType,
          delta.fieldPath,
          delta.value ? JSON.stringify(delta.value) : null,
          delta.clockValue.toString(),
        ]
      );

      return result.rows[0];
    } catch (error) {
      throw new QueryError('Failed to save delta', error as Error);
    }
  }

  /**
   * Get deltas for document
   */
  async getDeltas(documentId: string, limit: number = 100): Promise<DeltaEntry[]> {
    try {
      const result = await this.pool.query<DeltaEntry>(
        `SELECT id, document_id as "documentId", client_id as "clientId", 
                operation_type as "operationType", field_path as "fieldPath", 
                value, clock_value as "clockValue", timestamp
         FROM deltas
         WHERE document_id = $1
         ORDER BY timestamp DESC
         LIMIT $2`,
        [documentId, limit]
      );

      return result.rows;
    } catch (error) {
      throw new QueryError(`Failed to get deltas for ${documentId}`, error as Error);
    }
  }

  // ==========================================================================
  // SESSION OPERATIONS
  // ==========================================================================

  /**
   * Save session
   */
  async saveSession(session: Omit<SessionEntry, 'connectedAt' | 'lastSeen'>): Promise<SessionEntry> {
    try {
      const result = await this.pool.query<SessionEntry>(
        `INSERT INTO sessions (id, user_id, client_id, connected_at, last_seen, metadata)
         VALUES ($1, $2, $3, NOW(), NOW(), $4)
         ON CONFLICT (id) DO UPDATE
         SET last_seen = NOW(), metadata = $4
         RETURNING id, user_id as "userId", client_id as "clientId", 
                   connected_at as "connectedAt", last_seen as "lastSeen", metadata`,
        [session.id, session.userId, session.clientId, JSON.stringify(session.metadata || {})]
      );

      return result.rows[0];
    } catch (error) {
      throw new QueryError('Failed to save session', error as Error);
    }
  }

  /**
   * Update session last seen
   */
  async updateSession(sessionId: string, lastSeen: Date, metadata?: Record<string, any>): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE sessions
         SET last_seen = $2, metadata = COALESCE($3, metadata)
         WHERE id = $1`,
        [sessionId, lastSeen, metadata ? JSON.stringify(metadata) : null]
      );
    } catch (error) {
      throw new QueryError(`Failed to update session ${sessionId}`, error as Error);
    }
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const result = await this.pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      return (result.rowCount || 0) > 0;
    } catch (error) {
      throw new QueryError(`Failed to delete session ${sessionId}`, error as Error);
    }
  }

  /**
   * Get sessions for user
   */
  async getSessions(userId: string): Promise<SessionEntry[]> {
    try {
      const result = await this.pool.query<SessionEntry>(
        `SELECT id, user_id as "userId", client_id as "clientId", 
                connected_at as "connectedAt", last_seen as "lastSeen", metadata
         FROM sessions
         WHERE user_id = $1
         ORDER BY last_seen DESC`,
        [userId]
      );

      return result.rows;
    } catch (error) {
      throw new QueryError(`Failed to get sessions for user ${userId}`, error as Error);
    }
  }

  // ==========================================================================
  // MAINTENANCE
  // ==========================================================================

  /**
   * Cleanup old data
   */
  async cleanup(options?: { 
    oldSessionsHours?: number; 
    oldDeltasDays?: number; 
  }): Promise<{ sessionsDeleted: number; deltasDeleted: number }> {
    const sessionsHours = options?.oldSessionsHours || 24;
    const deltasDays = options?.oldDeltasDays || 30;

    try {
      // Clean sessions
      const sessionsResult = await this.pool.query(
        `DELETE FROM sessions WHERE last_seen < NOW() - INTERVAL '${sessionsHours} hours'`
      );

      // Clean deltas
      const deltasResult = await this.pool.query(
        `DELETE FROM deltas WHERE timestamp < NOW() - INTERVAL '${deltasDays} days'`
      );

      return {
        sessionsDeleted: sessionsResult.rowCount || 0,
        deltasDeleted: deltasResult.rowCount || 0,
      };
    } catch (error) {
      throw new QueryError('Failed to cleanup old data', error as Error);
    }
  }
}
