"""Tests for storage interface types"""

import pytest
from datetime import datetime, timezone

from synckit_server.storage.interface import (
    DocumentState,
    VectorClockEntry,
    DeltaEntry,
    SessionEntry,
    SnapshotEntry,
    TextDocumentState,
    CleanupOptions,
    CleanupResult,
)


class TestDocumentState:
    """Tests for DocumentState dataclass"""

    def test_creation(self):
        now = datetime.now(timezone.utc)
        doc = DocumentState(
            id="doc-1",
            state={"key": "value"},
            version=1,
            created_at=now,
            updated_at=now,
        )
        assert doc.id == "doc-1"
        assert doc.state == {"key": "value"}
        assert doc.version == 1
        assert doc.created_at == now
        assert doc.updated_at == now

    def test_nested_state(self):
        now = datetime.now(timezone.utc)
        doc = DocumentState(
            id="doc-nested",
            state={
                "level1": {
                    "level2": {
                        "data": [1, 2, 3]
                    }
                }
            },
            version=5,
            created_at=now,
            updated_at=now,
        )
        assert doc.state["level1"]["level2"]["data"] == [1, 2, 3]


class TestVectorClockEntry:
    """Tests for VectorClockEntry dataclass"""

    def test_creation(self):
        now = datetime.now(timezone.utc)
        entry = VectorClockEntry(
            document_id="doc-1",
            client_id="client-a",
            clock_value=42,
            updated_at=now,
        )
        assert entry.document_id == "doc-1"
        assert entry.client_id == "client-a"
        assert entry.clock_value == 42


class TestDeltaEntry:
    """Tests for DeltaEntry dataclass"""

    def test_set_operation(self):
        now = datetime.now(timezone.utc)
        delta = DeltaEntry(
            id="delta-1",
            document_id="doc-1",
            client_id="client-a",
            operation_type="set",
            field_path="user.name",
            value="Alice",
            clock_value=100,
            timestamp=now,
        )
        assert delta.operation_type == "set"
        assert delta.field_path == "user.name"
        assert delta.value == "Alice"

    def test_delete_operation(self):
        now = datetime.now(timezone.utc)
        delta = DeltaEntry(
            id="delta-2",
            document_id="doc-1",
            client_id="client-a",
            operation_type="delete",
            field_path="user.temp",
            value=None,
            clock_value=101,
            timestamp=now,
        )
        assert delta.operation_type == "delete"
        assert delta.value is None

    def test_merge_operation(self):
        now = datetime.now(timezone.utc)
        delta = DeltaEntry(
            id="delta-3",
            document_id="doc-1",
            client_id="client-a",
            operation_type="merge",
            field_path="user",
            value={"name": "Bob", "age": 30},
            clock_value=102,
            timestamp=now,
        )
        assert delta.operation_type == "merge"
        assert delta.value == {"name": "Bob", "age": 30}


class TestSessionEntry:
    """Tests for SessionEntry dataclass"""

    def test_creation_with_defaults(self):
        now = datetime.now(timezone.utc)
        session = SessionEntry(
            id="session-1",
            user_id="user-1",
            client_id="client-a",
            connected_at=now,
            last_seen=now,
        )
        assert session.id == "session-1"
        assert session.metadata == {}  # Default empty dict

    def test_creation_with_metadata(self):
        now = datetime.now(timezone.utc)
        session = SessionEntry(
            id="session-2",
            user_id="user-1",
            client_id="client-b",
            connected_at=now,
            last_seen=now,
            metadata={"device": "mobile", "os": "iOS"},
        )
        assert session.metadata == {"device": "mobile", "os": "iOS"}


class TestSnapshotEntry:
    """Tests for SnapshotEntry dataclass"""

    def test_creation(self):
        now = datetime.now(timezone.utc)
        snapshot = SnapshotEntry(
            id="snap-1",
            document_id="doc-1",
            state={"full": "state"},
            version={"client-a": 100, "client-b": 50},
            size_bytes=1024,
            created_at=now,
            compressed=False,
        )
        assert snapshot.id == "snap-1"
        assert snapshot.size_bytes == 1024
        assert snapshot.compressed is False
        assert snapshot.version == {"client-a": 100, "client-b": 50}

    def test_compressed_snapshot(self):
        now = datetime.now(timezone.utc)
        snapshot = SnapshotEntry(
            id="snap-2",
            document_id="doc-1",
            state="compressed_base64_data",
            version={"client-a": 200},
            size_bytes=512,
            created_at=now,
            compressed=True,
        )
        assert snapshot.compressed is True


class TestTextDocumentState:
    """Tests for TextDocumentState dataclass"""

    def test_creation(self):
        now = datetime.now(timezone.utc)
        text_doc = TextDocumentState(
            id="text-1",
            content="Hello, World!",
            crdt_state='{"fugue":"state"}',
            clock=42,
            created_at=now,
            updated_at=now,
        )
        assert text_doc.id == "text-1"
        assert text_doc.content == "Hello, World!"
        assert text_doc.crdt_state == '{"fugue":"state"}'
        assert text_doc.clock == 42


class TestCleanupOptions:
    """Tests for CleanupOptions dataclass"""

    def test_defaults(self):
        options = CleanupOptions()
        assert options.old_sessions_hours == 24
        assert options.old_deltas_days == 30
        assert options.old_snapshots_days == 7
        assert options.max_snapshots_per_document == 10

    def test_custom_values(self):
        options = CleanupOptions(
            old_sessions_hours=12,
            old_deltas_days=7,
            old_snapshots_days=3,
            max_snapshots_per_document=5,
        )
        assert options.old_sessions_hours == 12
        assert options.old_deltas_days == 7
        assert options.old_snapshots_days == 3
        assert options.max_snapshots_per_document == 5


class TestCleanupResult:
    """Tests for CleanupResult dataclass"""

    def test_creation(self):
        result = CleanupResult(
            sessions_deleted=5,
            deltas_deleted=100,
            snapshots_deleted=20,
        )
        assert result.sessions_deleted == 5
        assert result.deltas_deleted == 100
        assert result.snapshots_deleted == 20
