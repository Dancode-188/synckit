"""PostgreSQL storage adapter - Full implementation matching TypeScript reference"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import asyncpg

from .interface import (
    StorageAdapter,
    DocumentState,
    DeltaEntry,
    SessionEntry,
    SnapshotEntry,
    TextDocumentState,
    CleanupOptions,
    CleanupResult,
)
from .errors import ConnectionError, QueryError, NotFoundError


class PostgresAdapter(StorageAdapter):
    """PostgreSQL storage adapter for persistent document storage

    Production-ready implementation with connection pooling,
    comprehensive error handling, and full feature parity with TypeScript.
    """

    def __init__(
        self,
        connection_string: str,
        pool_min: int = 2,
        pool_max: int = 10,
        connection_timeout: int = 5,
    ):
        self.connection_string = connection_string
        self.pool_min = pool_min
        self.pool_max = pool_max
        self.connection_timeout = connection_timeout
        self.pool: Optional[asyncpg.Pool] = None
        self._connected = False

    async def connect(self) -> None:
        """Connect to PostgreSQL"""
        try:
            self.pool = await asyncpg.create_pool(
                self.connection_string,
                min_size=self.pool_min,
                max_size=self.pool_max,
                command_timeout=60,
                timeout=self.connection_timeout,
            )
            self._connected = True
        except Exception as e:
            self._connected = False
            raise ConnectionError("Failed to connect to PostgreSQL", e)

    async def ensure_schema(self) -> None:
        """Ensure database schema exists by running schema.sql
        Safe to call multiple times (uses IF NOT EXISTS)
        """
        if not self.pool:
            return

        # Try multiple paths for schema file
        possible_paths = [
            Path(__file__).parent / "schema.sql",
            Path(os.getcwd()) / "src" / "synckit_server" / "storage" / "schema.sql",
        ]

        schema = None
        used_path = None

        for schema_path in possible_paths:
            try:
                schema = schema_path.read_text()
                used_path = schema_path
                break
            except (FileNotFoundError, IOError):
                continue

        if not schema:
            print("Warning: Could not find schema.sql at any expected path")
            return

        try:
            async with self.pool.acquire() as conn:
                await conn.execute(schema)
            print(f"Database schema verified (from {used_path})")
        except Exception as e:
            print(f"Warning: Failed to ensure database schema: {e}")

    async def disconnect(self) -> None:
        """Close the connection pool"""
        if self.pool:
            await self.pool.close()
            self._connected = False

    def is_connected(self) -> bool:
        """Check if connected"""
        return self._connected

    async def health_check(self) -> bool:
        """Health check"""
        try:
            if not self.pool:
                return False
            async with self.pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            return True
        except Exception:
            return False

    # ==========================================================================
    # DOCUMENT OPERATIONS
    # ==========================================================================

    async def get_document(self, id: str) -> Optional[DocumentState]:
        """Get document by ID"""
        if not self.pool:
            return None

        try:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    """SELECT id, state, version, created_at, updated_at
                       FROM documents WHERE id = $1""",
                    id
                )
                if not row:
                    return None
                return DocumentState(
                    id=row["id"],
                    state=row["state"],
                    version=row["version"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
        except Exception as e:
            raise QueryError(f"Failed to get document {id}", e)

    async def save_document(self, id: str, state: Any) -> DocumentState:
        """Save new document"""
        if not self.pool:
            raise ConnectionError("Not connected to database")

        try:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    """INSERT INTO documents (id, state, version)
                       VALUES ($1, $2, 1)
                       ON CONFLICT (id) DO UPDATE
                       SET state = $2, updated_at = NOW()
                       RETURNING id, state, version, created_at, updated_at""",
                    id,
                    json.dumps(state),
                )
                return DocumentState(
                    id=row["id"],
                    state=row["state"],
                    version=row["version"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
        except Exception as e:
            raise QueryError(f"Failed to save document {id}", e)

    async def update_document(self, id: str, state: Any) -> DocumentState:
        """Update existing document"""
        if not self.pool:
            raise ConnectionError("Not connected to database")

        try:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    """UPDATE documents
                       SET state = $2, updated_at = NOW()
                       WHERE id = $1
                       RETURNING id, state, version, created_at, updated_at""",
                    id,
                    json.dumps(state),
                )
                if not row:
                    raise NotFoundError("Document", id)
                return DocumentState(
                    id=row["id"],
                    state=row["state"],
                    version=row["version"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
        except NotFoundError:
            raise
        except Exception as e:
            raise QueryError(f"Failed to update document {id}", e)

    async def delete_document(self, id: str) -> bool:
        """Delete document"""
        if not self.pool:
            return False

        try:
            async with self.pool.acquire() as conn:
                result = await conn.execute(
                    "DELETE FROM documents WHERE id = $1", id
                )
                return result == "DELETE 1"
        except Exception as e:
            raise QueryError(f"Failed to delete document {id}", e)

    async def list_documents(self, limit: int = 100, offset: int = 0) -> list[DocumentState]:
        """List documents with pagination"""
        if not self.pool:
            return []

        try:
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(
                    """SELECT id, state, version, created_at, updated_at
                       FROM documents
                       ORDER BY updated_at DESC
                       LIMIT $1 OFFSET $2""",
                    limit,
                    offset,
                )
                return [
                    DocumentState(
                        id=row["id"],
                        state=row["state"],
                        version=row["version"],
                        created_at=row["created_at"],
                        updated_at=row["updated_at"],
                    )
                    for row in rows
                ]
        except Exception as e:
            raise QueryError("Failed to list documents", e)

    # ==========================================================================
    # VECTOR CLOCK OPERATIONS
    # ==========================================================================

    async def get_vector_clock(self, document_id: str) -> dict[str, int]:
        """Get vector clock for document"""
        if not self.pool:
            return {}

        try:
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(
                    "SELECT client_id, clock_value FROM vector_clocks WHERE document_id = $1",
                    document_id,
                )
                return {row["client_id"]: row["clock_value"] for row in rows}
        except Exception as e:
            raise QueryError(f"Failed to get vector clock for {document_id}", e)

    async def update_vector_clock(
        self, document_id: str, client_id: str, clock_value: int
    ) -> None:
        """Update vector clock entry"""
        if not self.pool:
            raise ConnectionError("Not connected to database")

        try:
            async with self.pool.acquire() as conn:
                await conn.execute(
                    """INSERT INTO vector_clocks (document_id, client_id, clock_value, updated_at)
                       VALUES ($1, $2, $3, NOW())
                       ON CONFLICT (document_id, client_id)
                       DO UPDATE SET clock_value = $3, updated_at = NOW()""",
                    document_id,
                    client_id,
                    clock_value,
                )
        except Exception as e:
            raise QueryError(f"Failed to update vector clock for {document_id}", e)

    async def merge_vector_clock(self, document_id: str, clock: dict[str, int]) -> None:
        """Merge vector clock (update multiple entries with GREATEST logic)"""
        if not self.pool:
            raise ConnectionError("Not connected to database")

        try:
            async with self.pool.acquire() as conn:
                async with conn.transaction():
                    for client_id, clock_value in clock.items():
                        await conn.execute(
                            """INSERT INTO vector_clocks (document_id, client_id, clock_value, updated_at)
                               VALUES ($1, $2, $3, NOW())
                               ON CONFLICT (document_id, client_id)
                               DO UPDATE SET
                                 clock_value = GREATEST(vector_clocks.clock_value, $3),
                                 updated_at = NOW()""",
                            document_id,
                            client_id,
                            clock_value,
                        )
        except Exception as e:
            raise QueryError(f"Failed to merge vector clock for {document_id}", e)

    # ==========================================================================
    # DELTA OPERATIONS (Audit Trail)
    # ==========================================================================

    async def save_delta(self, delta: DeltaEntry) -> DeltaEntry:
        """Save delta operation"""
        if not self.pool:
            raise ConnectionError("Not connected to database")

        try:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    """INSERT INTO deltas (document_id, client_id, operation_type, field_path, value, clock_value, timestamp)
                       VALUES ($1, $2, $3, $4, $5, $6, NOW())
                       RETURNING id, document_id, client_id, operation_type, field_path, value, clock_value, timestamp""",
                    delta.document_id,
                    delta.client_id,
                    delta.operation_type,
                    delta.field_path,
                    json.dumps(delta.value) if delta.value is not None else None,
                    delta.clock_value,
                )
                return DeltaEntry(
                    id=str(row["id"]),
                    document_id=row["document_id"],
                    client_id=row["client_id"],
                    operation_type=row["operation_type"],
                    field_path=row["field_path"],
                    value=json.loads(row["value"]) if row["value"] else None,
                    clock_value=row["clock_value"],
                    timestamp=row["timestamp"],
                )
        except Exception as e:
            raise QueryError("Failed to save delta", e)

    async def get_deltas(self, document_id: str, limit: int = 100) -> list[DeltaEntry]:
        """Get deltas for document"""
        if not self.pool:
            return []

        try:
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(
                    """SELECT id, document_id, client_id, operation_type, field_path, value, clock_value, timestamp
                       FROM deltas
                       WHERE document_id = $1
                       ORDER BY timestamp DESC
                       LIMIT $2""",
                    document_id,
                    limit,
                )
                return [
                    DeltaEntry(
                        id=str(row["id"]),
                        document_id=row["document_id"],
                        client_id=row["client_id"],
                        operation_type=row["operation_type"],
                        field_path=row["field_path"],
                        value=json.loads(row["value"]) if row["value"] else None,
                        clock_value=row["clock_value"],
                        timestamp=row["timestamp"],
                    )
                    for row in rows
                ]
        except Exception as e:
            raise QueryError(f"Failed to get deltas for {document_id}", e)

    # ==========================================================================
    # SESSION OPERATIONS
    # ==========================================================================

    async def save_session(self, session: SessionEntry) -> SessionEntry:
        """Save session"""
        if not self.pool:
            raise ConnectionError("Not connected to database")

        try:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    """INSERT INTO sessions (id, user_id, client_id, connected_at, last_seen, metadata)
                       VALUES ($1, $2, $3, NOW(), NOW(), $4)
                       ON CONFLICT (id) DO UPDATE
                       SET last_seen = NOW(), metadata = $4
                       RETURNING id, user_id, client_id, connected_at, last_seen, metadata""",
                    session.id,
                    session.user_id,
                    session.client_id,
                    json.dumps(session.metadata or {}),
                )
                return SessionEntry(
                    id=row["id"],
                    user_id=row["user_id"],
                    client_id=row["client_id"],
                    connected_at=row["connected_at"],
                    last_seen=row["last_seen"],
                    metadata=json.loads(row["metadata"]) if row["metadata"] else {},
                )
        except Exception as e:
            raise QueryError("Failed to save session", e)

    async def update_session(
        self, session_id: str, last_seen: datetime, metadata: Optional[dict] = None
    ) -> None:
        """Update session last seen"""
        if not self.pool:
            raise ConnectionError("Not connected to database")

        try:
            async with self.pool.acquire() as conn:
                await conn.execute(
                    """UPDATE sessions
                       SET last_seen = $2, metadata = COALESCE($3, metadata)
                       WHERE id = $1""",
                    session_id,
                    last_seen,
                    json.dumps(metadata) if metadata else None,
                )
        except Exception as e:
            raise QueryError(f"Failed to update session {session_id}", e)

    async def delete_session(self, session_id: str) -> bool:
        """Delete session"""
        if not self.pool:
            return False

        try:
            async with self.pool.acquire() as conn:
                result = await conn.execute(
                    "DELETE FROM sessions WHERE id = $1", session_id
                )
                return result == "DELETE 1"
        except Exception as e:
            raise QueryError(f"Failed to delete session {session_id}", e)

    async def get_sessions(self, user_id: str) -> list[SessionEntry]:
        """Get sessions for user"""
        if not self.pool:
            return []

        try:
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(
                    """SELECT id, user_id, client_id, connected_at, last_seen, metadata
                       FROM sessions
                       WHERE user_id = $1
                       ORDER BY last_seen DESC""",
                    user_id,
                )
                return [
                    SessionEntry(
                        id=row["id"],
                        user_id=row["user_id"],
                        client_id=row["client_id"],
                        connected_at=row["connected_at"],
                        last_seen=row["last_seen"],
                        metadata=json.loads(row["metadata"]) if row["metadata"] else {},
                    )
                    for row in rows
                ]
        except Exception as e:
            raise QueryError(f"Failed to get sessions for user {user_id}", e)

    # ==========================================================================
    # SNAPSHOT OPERATIONS
    # ==========================================================================

    async def save_snapshot(self, snapshot: SnapshotEntry) -> SnapshotEntry:
        """Save a snapshot"""
        if not self.pool:
            raise ConnectionError("Not connected to database")

        try:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    """INSERT INTO snapshots (document_id, state, version, size_bytes, compressed)
                       VALUES ($1, $2, $3, $4, $5)
                       RETURNING id, document_id, state, version, size_bytes, created_at, compressed""",
                    snapshot.document_id,
                    json.dumps(snapshot.state),
                    json.dumps(snapshot.version),
                    snapshot.size_bytes,
                    snapshot.compressed,
                )
                return SnapshotEntry(
                    id=str(row["id"]),
                    document_id=row["document_id"],
                    state=json.loads(row["state"]) if isinstance(row["state"], str) else row["state"],
                    version=json.loads(row["version"]) if isinstance(row["version"], str) else row["version"],
                    size_bytes=row["size_bytes"],
                    created_at=row["created_at"],
                    compressed=row["compressed"],
                )
        except Exception as e:
            raise QueryError(f"Failed to save snapshot for {snapshot.document_id}", e)

    async def get_snapshot(self, snapshot_id: str) -> Optional[SnapshotEntry]:
        """Get a specific snapshot by ID"""
        if not self.pool:
            return None

        try:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    """SELECT id, document_id, state, version, size_bytes, created_at, compressed
                       FROM snapshots
                       WHERE id = $1""",
                    snapshot_id,
                )
                if not row:
                    return None
                return SnapshotEntry(
                    id=str(row["id"]),
                    document_id=row["document_id"],
                    state=json.loads(row["state"]) if isinstance(row["state"], str) else row["state"],
                    version=json.loads(row["version"]) if isinstance(row["version"], str) else row["version"],
                    size_bytes=row["size_bytes"],
                    created_at=row["created_at"],
                    compressed=row["compressed"],
                )
        except Exception as e:
            raise QueryError(f"Failed to get snapshot {snapshot_id}", e)

    async def get_latest_snapshot(self, document_id: str) -> Optional[SnapshotEntry]:
        """Get the latest snapshot for a document"""
        if not self.pool:
            return None

        try:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    """SELECT id, document_id, state, version, size_bytes, created_at, compressed
                       FROM snapshots
                       WHERE document_id = $1
                       ORDER BY created_at DESC
                       LIMIT 1""",
                    document_id,
                )
                if not row:
                    return None
                return SnapshotEntry(
                    id=str(row["id"]),
                    document_id=row["document_id"],
                    state=json.loads(row["state"]) if isinstance(row["state"], str) else row["state"],
                    version=json.loads(row["version"]) if isinstance(row["version"], str) else row["version"],
                    size_bytes=row["size_bytes"],
                    created_at=row["created_at"],
                    compressed=row["compressed"],
                )
        except Exception as e:
            raise QueryError(f"Failed to get latest snapshot for {document_id}", e)

    async def list_snapshots(self, document_id: str, limit: int = 10) -> list[SnapshotEntry]:
        """List snapshots for a document"""
        if not self.pool:
            return []

        try:
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(
                    """SELECT id, document_id, state, version, size_bytes, created_at, compressed
                       FROM snapshots
                       WHERE document_id = $1
                       ORDER BY created_at DESC
                       LIMIT $2""",
                    document_id,
                    limit,
                )
                return [
                    SnapshotEntry(
                        id=str(row["id"]),
                        document_id=row["document_id"],
                        state=json.loads(row["state"]) if isinstance(row["state"], str) else row["state"],
                        version=json.loads(row["version"]) if isinstance(row["version"], str) else row["version"],
                        size_bytes=row["size_bytes"],
                        created_at=row["created_at"],
                        compressed=row["compressed"],
                    )
                    for row in rows
                ]
        except Exception as e:
            raise QueryError(f"Failed to list snapshots for {document_id}", e)

    async def delete_snapshot(self, snapshot_id: str) -> bool:
        """Delete a snapshot"""
        if not self.pool:
            return False

        try:
            async with self.pool.acquire() as conn:
                result = await conn.execute(
                    "DELETE FROM snapshots WHERE id = $1", snapshot_id
                )
                return result == "DELETE 1"
        except Exception as e:
            raise QueryError(f"Failed to delete snapshot {snapshot_id}", e)

    # ==========================================================================
    # TEXT DOCUMENT OPERATIONS (SyncText/Fugue CRDT)
    # ==========================================================================

    async def save_text_document(
        self, id: str, content: str, crdt_state: str, clock: int
    ) -> TextDocumentState:
        """Save text document with Fugue CRDT state
        Uses the existing documents table with a special state format for text
        """
        if not self.pool:
            raise ConnectionError("Not connected to database")

        try:
            state = {
                "type": "text",
                "content": content,
                "crdt": crdt_state,
                "clock": clock,
            }

            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    """INSERT INTO documents (id, state, version)
                       VALUES ($1, $2, 1)
                       ON CONFLICT (id) DO UPDATE
                       SET state = $2, updated_at = NOW()
                       RETURNING id, state, created_at, updated_at""",
                    id,
                    json.dumps(state),
                )
                parsed_state = json.loads(row["state"]) if isinstance(row["state"], str) else row["state"]
                return TextDocumentState(
                    id=row["id"],
                    content=parsed_state.get("content", ""),
                    crdt_state=parsed_state.get("crdt", ""),
                    clock=parsed_state.get("clock", 0),
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
        except Exception as e:
            raise QueryError(f"Failed to save text document {id}", e)

    async def get_text_document(self, id: str) -> Optional[TextDocumentState]:
        """Get text document by ID
        Returns None if document doesn't exist or is not a text document
        """
        if not self.pool:
            return None

        try:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    """SELECT id, state, created_at, updated_at
                       FROM documents WHERE id = $1""",
                    id,
                )
                if not row:
                    return None

                state = json.loads(row["state"]) if isinstance(row["state"], str) else row["state"]

                # Check if this is a text document
                if state.get("type") != "text" or "crdt" not in state:
                    return None

                return TextDocumentState(
                    id=row["id"],
                    content=state.get("content", ""),
                    crdt_state=state.get("crdt", ""),
                    clock=state.get("clock", 0),
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
        except Exception as e:
            raise QueryError(f"Failed to get text document {id}", e)

    # ==========================================================================
    # MAINTENANCE
    # ==========================================================================

    async def cleanup(self, options: Optional[CleanupOptions] = None) -> CleanupResult:
        """Cleanup old data"""
        if not self.pool:
            raise ConnectionError("Not connected to database")

        opts = options or CleanupOptions()
        sessions_hours = opts.old_sessions_hours
        deltas_days = opts.old_deltas_days
        snapshots_days = opts.old_snapshots_days
        max_snapshots = opts.max_snapshots_per_document

        try:
            async with self.pool.acquire() as conn:
                # Clean sessions
                sessions_result = await conn.execute(
                    f"DELETE FROM sessions WHERE last_seen < NOW() - INTERVAL '{sessions_hours} hours'"
                )
                sessions_deleted = int(sessions_result.split()[-1]) if sessions_result else 0

                # Clean deltas
                deltas_result = await conn.execute(
                    f"DELETE FROM deltas WHERE timestamp < NOW() - INTERVAL '{deltas_days} days'"
                )
                deltas_deleted = int(deltas_result.split()[-1]) if deltas_result else 0

                # Clean old snapshots (keep only max_snapshots recent snapshots per document)
                snapshots_result = await conn.execute(
                    f"""DELETE FROM snapshots
                        WHERE id IN (
                          SELECT id FROM (
                            SELECT id, ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY created_at DESC) as rn
                            FROM snapshots
                          ) ranked
                          WHERE rn > $1 OR created_at < NOW() - INTERVAL '{snapshots_days} days'
                        )""",
                    max_snapshots,
                )
                snapshots_deleted = int(snapshots_result.split()[-1]) if snapshots_result else 0

                return CleanupResult(
                    sessions_deleted=sessions_deleted,
                    deltas_deleted=deltas_deleted,
                    snapshots_deleted=snapshots_deleted,
                )
        except Exception as e:
            raise QueryError("Failed to cleanup old data", e)
