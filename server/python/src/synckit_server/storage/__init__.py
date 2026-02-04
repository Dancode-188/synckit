"""Storage adapters for persistence"""

from .interface import (
    StorageAdapter,
    DocumentState,
    VectorClockEntry,
    DeltaEntry,
    SessionEntry,
    SnapshotEntry,
    TextDocumentState,
    CleanupOptions,
    CleanupResult,
)
from .errors import (
    StorageError,
    ConnectionError,
    QueryError,
    NotFoundError,
    ConflictError,
)
from .postgres import PostgresAdapter
from .redis import RedisPubSub, PubSubStats

__all__ = [
    # Interface
    "StorageAdapter",
    "DocumentState",
    "VectorClockEntry",
    "DeltaEntry",
    "SessionEntry",
    "SnapshotEntry",
    "TextDocumentState",
    "CleanupOptions",
    "CleanupResult",
    # Errors
    "StorageError",
    "ConnectionError",
    "QueryError",
    "NotFoundError",
    "ConflictError",
    # Adapters
    "PostgresAdapter",
    "RedisPubSub",
    "PubSubStats",
]
