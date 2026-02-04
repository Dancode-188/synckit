"""Storage interface definitions matching TypeScript reference"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional


@dataclass
class DocumentState:
    """Document state with metadata"""
    id: str
    state: Any
    version: int
    created_at: datetime
    updated_at: datetime


@dataclass
class VectorClockEntry:
    """Vector clock entry for a document/client pair"""
    document_id: str
    client_id: str
    clock_value: int
    updated_at: datetime


@dataclass
class DeltaEntry:
    """Delta operation for audit trail"""
    id: str
    document_id: str
    client_id: str
    operation_type: str  # 'set', 'delete', 'merge'
    field_path: str
    value: Optional[Any]
    clock_value: int
    timestamp: datetime


@dataclass
class SessionEntry:
    """Session tracking entry"""
    id: str
    user_id: str
    client_id: Optional[str]
    connected_at: datetime
    last_seen: datetime
    metadata: dict = field(default_factory=dict)


@dataclass
class SnapshotEntry:
    """Document state snapshot"""
    id: str
    document_id: str
    state: Any
    version: dict[str, int]  # Vector clock at time of snapshot
    size_bytes: int
    created_at: datetime
    compressed: bool = False


@dataclass
class TextDocumentState:
    """Text document state for SyncText/Fugue CRDT"""
    id: str
    content: str
    crdt_state: str
    clock: int
    created_at: datetime
    updated_at: datetime


@dataclass
class CleanupOptions:
    """Options for cleanup operation"""
    old_sessions_hours: int = 24
    old_deltas_days: int = 30
    old_snapshots_days: int = 7
    max_snapshots_per_document: int = 10


@dataclass
class CleanupResult:
    """Result of cleanup operation"""
    sessions_deleted: int
    deltas_deleted: int
    snapshots_deleted: int


class StorageAdapter(ABC):
    """Abstract storage adapter interface"""

    # Connection lifecycle
    @abstractmethod
    async def connect(self) -> None:
        pass

    @abstractmethod
    async def disconnect(self) -> None:
        pass

    @abstractmethod
    def is_connected(self) -> bool:
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        pass

    # Document operations
    @abstractmethod
    async def get_document(self, id: str) -> Optional[DocumentState]:
        pass

    @abstractmethod
    async def save_document(self, id: str, state: Any) -> DocumentState:
        pass

    @abstractmethod
    async def update_document(self, id: str, state: Any) -> DocumentState:
        pass

    @abstractmethod
    async def delete_document(self, id: str) -> bool:
        pass

    @abstractmethod
    async def list_documents(self, limit: int = 100, offset: int = 0) -> list[DocumentState]:
        pass

    # Vector clock operations
    @abstractmethod
    async def get_vector_clock(self, document_id: str) -> dict[str, int]:
        pass

    @abstractmethod
    async def update_vector_clock(self, document_id: str, client_id: str, clock_value: int) -> None:
        pass

    @abstractmethod
    async def merge_vector_clock(self, document_id: str, clock: dict[str, int]) -> None:
        pass

    # Delta operations (audit trail)
    @abstractmethod
    async def save_delta(self, delta: DeltaEntry) -> DeltaEntry:
        pass

    @abstractmethod
    async def get_deltas(self, document_id: str, limit: int = 100) -> list[DeltaEntry]:
        pass

    # Session operations
    @abstractmethod
    async def save_session(self, session: SessionEntry) -> SessionEntry:
        pass

    @abstractmethod
    async def update_session(self, session_id: str, last_seen: datetime, metadata: Optional[dict] = None) -> None:
        pass

    @abstractmethod
    async def delete_session(self, session_id: str) -> bool:
        pass

    @abstractmethod
    async def get_sessions(self, user_id: str) -> list[SessionEntry]:
        pass

    # Snapshot operations
    @abstractmethod
    async def save_snapshot(self, snapshot: SnapshotEntry) -> SnapshotEntry:
        pass

    @abstractmethod
    async def get_snapshot(self, snapshot_id: str) -> Optional[SnapshotEntry]:
        pass

    @abstractmethod
    async def get_latest_snapshot(self, document_id: str) -> Optional[SnapshotEntry]:
        pass

    @abstractmethod
    async def list_snapshots(self, document_id: str, limit: int = 10) -> list[SnapshotEntry]:
        pass

    @abstractmethod
    async def delete_snapshot(self, snapshot_id: str) -> bool:
        pass

    # Text document operations (SyncText/Fugue CRDT)
    @abstractmethod
    async def save_text_document(
        self, id: str, content: str, crdt_state: str, clock: int
    ) -> TextDocumentState:
        pass

    @abstractmethod
    async def get_text_document(self, id: str) -> Optional[TextDocumentState]:
        pass

    # Maintenance
    @abstractmethod
    async def cleanup(self, options: Optional[CleanupOptions] = None) -> CleanupResult:
        pass
