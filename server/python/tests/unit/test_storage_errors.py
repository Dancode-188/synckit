"""Tests for storage error types"""

import pytest

from synckit_server.storage.errors import (
    StorageError,
    ConnectionError,
    QueryError,
    NotFoundError,
    ConflictError,
)


class TestStorageError:
    """Tests for StorageError base class"""

    def test_basic_error(self):
        err = StorageError("Something went wrong")
        assert str(err) == "Something went wrong"
        assert err.code is None
        assert err.cause is None

    def test_error_with_code(self):
        err = StorageError("Database error", code="DB_ERROR")
        assert err.code == "DB_ERROR"

    def test_error_with_cause(self):
        cause = ValueError("Original error")
        err = StorageError("Wrapper error", cause=cause)
        assert err.cause is cause


class TestConnectionError:
    """Tests for ConnectionError"""

    def test_creation(self):
        err = ConnectionError("Failed to connect")
        assert str(err) == "Failed to connect"
        assert err.code == "CONNECTION_ERROR"

    def test_with_cause(self):
        cause = OSError("Network unreachable")
        err = ConnectionError("Connection failed", cause=cause)
        assert err.cause is cause
        assert err.code == "CONNECTION_ERROR"


class TestQueryError:
    """Tests for QueryError"""

    def test_creation(self):
        err = QueryError("Query failed")
        assert str(err) == "Query failed"
        assert err.code == "QUERY_ERROR"

    def test_with_cause(self):
        cause = Exception("SQL syntax error")
        err = QueryError("Failed to execute query", cause=cause)
        assert err.cause is cause


class TestNotFoundError:
    """Tests for NotFoundError"""

    def test_creation(self):
        err = NotFoundError("Document", "doc-123")
        assert str(err) == "Document not found: doc-123"
        assert err.code == "NOT_FOUND"
        assert err.resource == "Document"
        assert err.resource_id == "doc-123"

    def test_different_resources(self):
        session_err = NotFoundError("Session", "sess-456")
        assert str(session_err) == "Session not found: sess-456"

        snapshot_err = NotFoundError("Snapshot", "snap-789")
        assert str(snapshot_err) == "Snapshot not found: snap-789"


class TestConflictError:
    """Tests for ConflictError"""

    def test_creation(self):
        err = ConflictError("Version mismatch")
        assert str(err) == "Version mismatch"
        assert err.code == "CONFLICT"

    def test_custom_message(self):
        err = ConflictError("Document already exists with same ID")
        assert "already exists" in str(err)


class TestErrorInheritance:
    """Tests for error class inheritance"""

    def test_inheritance(self):
        assert issubclass(ConnectionError, StorageError)
        assert issubclass(QueryError, StorageError)
        assert issubclass(NotFoundError, StorageError)
        assert issubclass(ConflictError, StorageError)
        assert issubclass(StorageError, Exception)

    def test_catching_base_class(self):
        errors = [
            ConnectionError("conn"),
            QueryError("query"),
            NotFoundError("Doc", "1"),
            ConflictError("conflict"),
        ]
        for err in errors:
            with pytest.raises(StorageError):
                raise err
