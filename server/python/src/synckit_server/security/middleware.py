"""
Security Middleware

Provides rate limiting, input validation, and access control.
Matches TypeScript reference: server/typescript/src/security/middleware.ts
"""

import asyncio
import re
import time
from typing import Optional, Tuple


# Constants matching TypeScript SECURITY_LIMITS
SECURITY_LIMITS = {
    "MAX_CONNECTIONS_PER_IP": 50,
    "MAX_MESSAGES_PER_MINUTE": 500,
    "MAX_BLOCKS_PER_DOC": 1000,
    "MAX_BLOCK_SIZE": 10_000,  # 10KB
    "MAX_DOC_SIZE": 10_485_760,  # 10MB
    "MAX_DOCS_PER_IP": 20,
    "MAX_DOCS_PER_HOUR": 10,
    "MAX_MESSAGE_SIZE": 2_000_000,  # 2MB
    "PLAYGROUND_DOC_ID": "playground",
}

# Valid message types
VALID_MESSAGE_TYPES = {
    "connect",
    "auth",
    "auth_success",
    "auth_error",
    "subscribe",
    "unsubscribe",
    "sync_request",
    "sync_response",
    "sync_step1",
    "sync_step2",
    "delta",
    "delta_batch",
    "ack",
    "awareness_update",
    "awareness_subscribe",
    "awareness_state",
    "snapshot_request",
    "snapshot_upload",
    "ping",
    "pong",
    "error",
}

# Document ID validation pattern
DOCUMENT_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_:-]+$")


class ConnectionLimiter:
    """
    Per-IP connection rate limiter.

    Tracks the number of active connections from each IP address
    and enforces a maximum limit.
    """

    def __init__(self):
        self._connections: dict[str, int] = {}
        self._cleanup_task: Optional[asyncio.Task] = None

    def start_cleanup(self):
        """Start periodic cleanup (every 5 minutes)"""
        if self._cleanup_task is None:
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def _cleanup_loop(self):
        """Cleanup loop that runs every 5 minutes"""
        while True:
            await asyncio.sleep(300)  # 5 minutes
            self._cleanup()

    def _cleanup(self):
        """Remove zero-count entries"""
        to_remove = [ip for ip, count in self._connections.items() if count <= 0]
        for ip in to_remove:
            del self._connections[ip]

    def can_connect(self, ip: str) -> bool:
        """Check if IP can create a new connection"""
        count = self._connections.get(ip, 0)
        return count < SECURITY_LIMITS["MAX_CONNECTIONS_PER_IP"]

    def add_connection(self, ip: str):
        """Record a new connection from IP"""
        self._connections[ip] = self._connections.get(ip, 0) + 1

    def remove_connection(self, ip: str):
        """Remove a connection from IP"""
        count = self._connections.get(ip, 0)
        if count <= 1:
            self._connections.pop(ip, None)
        else:
            self._connections[ip] = count - 1

    def get_connection_count(self, ip: str) -> int:
        """Get current connection count for IP"""
        return self._connections.get(ip, 0)

    def dispose(self):
        """Cleanup resources"""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            self._cleanup_task = None
        self._connections.clear()


class MessageRateLimiter:
    """
    Per-IP message rate limiter using sliding window.

    Tracks message timestamps per IP and enforces rate limits.
    """

    def __init__(self):
        self._messages: dict[str, list[float]] = {}
        self._cleanup_task: Optional[asyncio.Task] = None

    def start_cleanup(self):
        """Start periodic cleanup (every 1 minute)"""
        if self._cleanup_task is None:
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def _cleanup_loop(self):
        """Cleanup loop that runs every 1 minute"""
        while True:
            await asyncio.sleep(60)  # 1 minute
            self._cleanup()

    def _cleanup(self):
        """Remove old timestamps and empty entries"""
        now = time.time()
        for ip in list(self._messages.keys()):
            recent = [ts for ts in self._messages[ip] if now - ts < 60]
            if not recent:
                del self._messages[ip]
            else:
                self._messages[ip] = recent

    def can_send_message(self, ip: str) -> bool:
        """Check if IP can send a message (within rate limit)"""
        now = time.time()
        timestamps = self._messages.get(ip, [])
        recent = [ts for ts in timestamps if now - ts < 60]
        return len(recent) < SECURITY_LIMITS["MAX_MESSAGES_PER_MINUTE"]

    def record_message(self, ip: str):
        """Record a message from IP"""
        now = time.time()
        if ip not in self._messages:
            self._messages[ip] = []
        self._messages[ip].append(now)
        # Keep only last minute
        self._messages[ip] = [ts for ts in self._messages[ip] if now - ts < 60]

    def dispose(self):
        """Cleanup resources"""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            self._cleanup_task = None
        self._messages.clear()


class ConnectionRateLimiter:
    """
    Per-connection message rate limiter using sliding window.

    Tracks message timestamps per connection ID to avoid shared-IP issues.
    """

    def __init__(self):
        self._messages: dict[str, list[float]] = {}
        self._cleanup_task: Optional[asyncio.Task] = None

    def start_cleanup(self):
        """Start periodic cleanup (every 1 minute)"""
        if self._cleanup_task is None:
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def _cleanup_loop(self):
        """Cleanup loop that runs every 1 minute"""
        while True:
            await asyncio.sleep(60)  # 1 minute
            self._cleanup()

    def _cleanup(self):
        """Remove old timestamps and empty entries"""
        now = time.time()
        for conn_id in list(self._messages.keys()):
            recent = [ts for ts in self._messages[conn_id] if now - ts < 60]
            if not recent:
                del self._messages[conn_id]
            else:
                self._messages[conn_id] = recent

    def can_send_message(self, connection_id: str) -> bool:
        """Check if connection can send a message (within rate limit)"""
        now = time.time()
        timestamps = self._messages.get(connection_id, [])
        recent = [ts for ts in timestamps if now - ts < 60]
        return len(recent) < SECURITY_LIMITS["MAX_MESSAGES_PER_MINUTE"]

    def record_message(self, connection_id: str):
        """Record a message from connection"""
        now = time.time()
        if connection_id not in self._messages:
            self._messages[connection_id] = []
        self._messages[connection_id].append(now)
        # Keep only last minute
        self._messages[connection_id] = [
            ts for ts in self._messages[connection_id] if now - ts < 60
        ]

    def remove_connection(self, connection_id: str):
        """Remove connection tracking data"""
        self._messages.pop(connection_id, None)

    def dispose(self):
        """Cleanup resources"""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            self._cleanup_task = None
        self._messages.clear()


class DocumentLimiter:
    """
    Per-IP document creation rate limiter.

    Tracks document creation per IP with both total and hourly limits.
    """

    def __init__(self):
        self._documents: dict[str, dict] = {}  # ip -> {total: int, hourly: list[float]}
        self._cleanup_task: Optional[asyncio.Task] = None

    def start_cleanup(self):
        """Start periodic cleanup (every 1 hour)"""
        if self._cleanup_task is None:
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def _cleanup_loop(self):
        """Cleanup loop that runs every 1 hour"""
        while True:
            await asyncio.sleep(3600)  # 1 hour
            self._cleanup()

    def _cleanup(self):
        """Remove old hourly timestamps"""
        now = time.time()
        hour_ago = now - 3600

        for ip in list(self._documents.keys()):
            data = self._documents[ip]
            # Filter hourly to last hour only
            data["hourly"] = [ts for ts in data.get("hourly", []) if ts > hour_ago]

            # If no recent activity and total is 0, remove entry
            if not data["hourly"] and data.get("total", 0) == 0:
                del self._documents[ip]

    def can_create_document(self, ip: str) -> Tuple[bool, Optional[str]]:
        """
        Check if IP can create a document.

        Returns:
            Tuple of (allowed, error_message)
        """
        data = self._documents.get(ip, {"total": 0, "hourly": []})

        # Check total limit
        if data["total"] >= SECURITY_LIMITS["MAX_DOCS_PER_IP"]:
            return False, "Maximum documents per IP reached"

        # Check hourly limit
        now = time.time()
        hour_ago = now - 3600
        recent = [ts for ts in data.get("hourly", []) if ts > hour_ago]
        if len(recent) >= SECURITY_LIMITS["MAX_DOCS_PER_HOUR"]:
            return False, "Hourly document creation limit reached"

        return True, None

    def record_document(self, ip: str):
        """Record a document creation from IP"""
        now = time.time()

        if ip not in self._documents:
            self._documents[ip] = {"total": 0, "hourly": []}

        self._documents[ip]["total"] += 1
        self._documents[ip]["hourly"].append(now)

        # Keep only last hour
        hour_ago = now - 3600
        self._documents[ip]["hourly"] = [
            ts for ts in self._documents[ip]["hourly"] if ts > hour_ago
        ]

    def dispose(self):
        """Cleanup resources"""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            self._cleanup_task = None
        self._documents.clear()


class SecurityManager:
    """
    Centralized security manager.

    Coordinates all security components including rate limiters and validators.
    """

    def __init__(self):
        self.connection_limiter = ConnectionLimiter()
        self.message_rate_limiter = MessageRateLimiter()
        self.connection_rate_limiter = ConnectionRateLimiter()
        self.document_limiter = DocumentLimiter()
        self._started = False

    def start(self):
        """Start all cleanup tasks"""
        if not self._started:
            self.connection_limiter.start_cleanup()
            self.message_rate_limiter.start_cleanup()
            self.connection_rate_limiter.start_cleanup()
            self.document_limiter.start_cleanup()
            self._started = True

    def dispose(self):
        """Cleanup all resources"""
        self.connection_limiter.dispose()
        self.message_rate_limiter.dispose()
        self.connection_rate_limiter.dispose()
        self.document_limiter.dispose()
        self._started = False


def validate_message(message: dict) -> Tuple[bool, Optional[str]]:
    """
    Validate WebSocket message format.

    Args:
        message: Message dict to validate

    Returns:
        Tuple of (valid, error_message)
    """
    if not message or not isinstance(message, dict):
        return False, "Invalid message format"

    # Check message type
    msg_type = message.get("type")
    if msg_type not in VALID_MESSAGE_TYPES:
        return False, f"Invalid message type: {msg_type}"

    return True, None


def validate_document_id(doc_id: str) -> Tuple[bool, Optional[str]]:
    """
    Validate document ID format.

    Args:
        doc_id: Document ID to validate

    Returns:
        Tuple of (valid, error_message)
    """
    if not doc_id or not isinstance(doc_id, str):
        return False, "Invalid document ID"

    if len(doc_id) > 256:
        return False, "Document ID too long (max 256 characters)"

    if not DOCUMENT_ID_PATTERN.match(doc_id):
        return False, "Document ID contains invalid characters"

    return True, None


def can_access_document(doc_id: str) -> bool:
    """
    Check if document is publicly accessible.

    Implements access rules for playground, wordwall, room, and page documents.

    Args:
        doc_id: Document ID to check

    Returns:
        True if document is publicly accessible
    """
    # Playground documents
    playground_id = SECURITY_LIMITS["PLAYGROUND_DOC_ID"]
    if doc_id == playground_id or doc_id.startswith(f"{playground_id}:"):
        return True

    # Wordwall documents
    if doc_id == "wordwall" or doc_id.startswith("wordwall:"):
        return True

    # Room documents
    if doc_id.startswith("room:"):
        return True

    # Page documents (timestamp IDs - 13+ digits)
    parts = doc_id.split(":")
    if parts[0].isdigit() and len(parts[0]) >= 13:
        return True

    return False


# Global security manager instance
security_manager = SecurityManager()
