"""PostgreSQL storage adapter"""

import asyncpg
from typing import Any


class PostgresAdapter:
    """PostgreSQL storage adapter for persistent document storage"""

    def __init__(self, connection_string: str):
        self.connection_string = connection_string
        self.pool: asyncpg.Pool | None = None

    async def connect(self):
        """Connect to PostgreSQL"""
        self.pool = await asyncpg.create_pool(
            self.connection_string,
            min_size=2,
            max_size=10,
            command_timeout=60,
        )

        # Create tables if they don't exist
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    state JSONB NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
                """
            )

    async def close(self):
        """Close the connection pool"""
        if self.pool:
            await self.pool.close()

    async def get_document(self, doc_id: str) -> dict[str, Any] | None:
        """Get a document by ID"""
        if not self.pool:
            return None

        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT state FROM documents WHERE id = $1", doc_id)
            return dict(row["state"]) if row else None

    async def save_document(self, doc_id: str, state: dict[str, Any]):
        """Save or update a document"""
        if not self.pool:
            return

        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO documents (id, state, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (id) DO UPDATE
                SET state = $2, updated_at = NOW()
                """,
                doc_id,
                state,
            )

    async def delete_document(self, doc_id: str):
        """Delete a document"""
        if not self.pool:
            return

        async with self.pool.acquire() as conn:
            await conn.execute("DELETE FROM documents WHERE id = $1", doc_id)

    async def list_documents(self) -> list[str]:
        """List all document IDs"""
        if not self.pool:
            return []

        async with self.pool.acquire() as conn:
            rows = await conn.fetch("SELECT id FROM documents ORDER BY updated_at DESC")
            return [row["id"] for row in rows]
