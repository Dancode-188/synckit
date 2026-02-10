"""
WebSocket handler for real-time synchronization
"""

import asyncio
import time
import uuid
from typing import Any
from fastapi import WebSocket, WebSocketDisconnect

from .protocol import decode_message, encode_message, MessageType
from .auth import TokenPayload, DocumentPermissions, verify_token, can_read_document, can_write_document
from .security.middleware import validate_document_id, validate_message, can_access_document, security_manager


class Connection:
    """Represents a single WebSocket connection"""

    def __init__(self, websocket: WebSocket, connection_id: str):
        self.websocket = websocket
        self.connection_id = connection_id
        self.user_id: str | None = None
        self.client_id: str | None = None
        self.authenticated = False
        self.token_payload: TokenPayload | None = None  # Verified token payload for RBAC
        self.subscriptions: set[str] = set()  # Document IDs
        self.awareness_subscriptions: set[str] = set()  # Document IDs for awareness
        self.connected_at = time.time()

    async def send(self, message_type: str, payload: dict[str, Any]):
        """Send a message to the client"""
        timestamp = int(time.time() * 1000)
        data = encode_message(message_type, payload, timestamp)
        await self.websocket.send_bytes(data)

    async def send_error(self, error_message: str, error_code: str = "INTERNAL_ERROR"):
        """Send an error message"""
        await self.send(
            MessageType.ERROR,
            {
                "type": MessageType.ERROR,
                "id": str(uuid.uuid4()),
                "timestamp": int(time.time() * 1000),
                "error": error_message,
                "code": error_code,
            },
        )


class ConnectionManager:
    """Manages all active WebSocket connections"""

    # Cleanup constants matching TypeScript
    AWARENESS_TIMEOUT = 30.0  # 30 seconds
    AWARENESS_CLEANUP_INTERVAL = 30.0  # 30 seconds

    def __init__(self):
        self.connections: dict[str, Connection] = {}
        self.document_subscribers: dict[str, set[str]] = {}  # docId -> set of connection_ids
        self.documents: dict[str, dict[str, Any]] = {}  # In-memory document storage
        self.awareness_states: dict[str, dict[str, Any]] = {}  # docId -> {clientId -> state}
        self._cleanup_task: asyncio.Task | None = None

    def start_cleanup_tasks(self):
        """Start periodic cleanup tasks"""
        if self._cleanup_task is None:
            self._cleanup_task = asyncio.create_task(self._awareness_cleanup_loop())

    async def _awareness_cleanup_loop(self):
        """Clean up stale awareness clients every 30 seconds"""
        while True:
            await asyncio.sleep(self.AWARENESS_CLEANUP_INTERVAL)
            await self._cleanup_stale_awareness()

    async def _cleanup_stale_awareness(self):
        """Remove awareness states older than AWARENESS_TIMEOUT"""
        now = time.time()
        removed_clients: list[tuple[str, str]] = []  # (doc_id, client_id)

        for doc_id, states in list(self.awareness_states.items()):
            for client_id, state in list(states.items()):
                # Check _lastSeen timestamp if present
                last_seen = state.get("_lastSeen", 0) if isinstance(state, dict) else 0
                if now - last_seen > self.AWARENESS_TIMEOUT:
                    del self.awareness_states[doc_id][client_id]
                    removed_clients.append((doc_id, client_id))

            # Clean up empty document entries
            if not self.awareness_states[doc_id]:
                del self.awareness_states[doc_id]

        # Broadcast removal notifications
        for doc_id, client_id in removed_clients:
            await self._broadcast_awareness_removal(doc_id, client_id)

    async def _broadcast_awareness_removal(self, doc_id: str, client_id: str):
        """Broadcast client removal to awareness subscribers"""
        if doc_id not in self.document_subscribers:
            return

        timestamp = int(time.time() * 1000)
        for conn_id in self.document_subscribers[doc_id]:
            conn = self.connections.get(conn_id)
            if conn:
                try:
                    await conn.send(
                        MessageType.AWARENESS_UPDATE,
                        {
                            "type": MessageType.AWARENESS_UPDATE,
                            "id": str(uuid.uuid4()),
                            "timestamp": timestamp,
                            "docId": doc_id,
                            "clientId": client_id,
                            "state": None,  # null indicates removal
                        },
                    )
                except Exception:
                    pass

    def dispose(self):
        """Cleanup all resources"""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            self._cleanup_task = None

    async def connect(self, websocket: WebSocket) -> Connection:
        """Register a new connection"""
        await websocket.accept()
        connection_id = str(uuid.uuid4())
        connection = Connection(websocket, connection_id)
        self.connections[connection_id] = connection
        return connection

    def disconnect(self, connection_id: str):
        """Unregister a connection"""
        if connection_id in self.connections:
            connection = self.connections[connection_id]

            # Remove from all subscriptions
            for doc_id in connection.subscriptions:
                if doc_id in self.document_subscribers:
                    self.document_subscribers[doc_id].discard(connection_id)
                    if not self.document_subscribers[doc_id]:
                        del self.document_subscribers[doc_id]

            # Clean up awareness states
            for doc_id in connection.awareness_subscriptions:
                if doc_id in self.awareness_states and connection.client_id:
                    self.awareness_states[doc_id].pop(connection.client_id, None)
                    if not self.awareness_states[doc_id]:
                        del self.awareness_states[doc_id]

            del self.connections[connection_id]

    async def subscribe(self, connection: Connection, doc_id: str):
        """Subscribe a connection to document updates"""
        connection.subscriptions.add(doc_id)
        if doc_id not in self.document_subscribers:
            self.document_subscribers[doc_id] = set()
        self.document_subscribers[doc_id].add(connection.connection_id)

    async def broadcast_delta(self, doc_id: str, delta: dict[str, Any], sender_id: str):
        """Broadcast a delta to all subscribed connections except sender"""
        if doc_id not in self.document_subscribers:
            return

        for connection_id in self.document_subscribers[doc_id]:
            if connection_id == sender_id:
                continue  # Don't send back to sender

            connection = self.connections.get(connection_id)
            if connection:
                try:
                    await connection.send(MessageType.DELTA, delta)
                except Exception as e:
                    print(f"Error broadcasting to {connection_id}: {e}")

    def get_stats(self) -> dict[str, Any]:
        """Get server statistics"""
        return {
            "connections": len(self.connections),
            "documents": len(self.documents),
            "active_subscriptions": sum(len(subs) for subs in self.document_subscribers.values()),
        }


# Global connection manager
manager = ConnectionManager()


async def websocket_endpoint(websocket: WebSocket):
    """Main WebSocket endpoint handler"""
    connection = await manager.connect(websocket)

    try:
        while True:
            # Receive message
            data = await websocket.receive_bytes()

            try:
                message = decode_message(data)
                await handle_message(connection, message)
            except Exception as e:
                print(f"Error processing message: {e}")
                await connection.send_error(f"Invalid message: {e}")

    except WebSocketDisconnect:
        security_manager.connection_rate_limiter.remove_connection(connection.connection_id)
        manager.disconnect(connection.connection_id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        security_manager.connection_rate_limiter.remove_connection(connection.connection_id)
        manager.disconnect(connection.connection_id)


async def handle_message(connection: Connection, message: dict[str, Any]):
    """Handle incoming WebSocket message"""
    message_type = message.get("type")
    message_id = message.get("id", str(uuid.uuid4()))
    timestamp = int(time.time() * 1000)

    # Per-connection rate limiting
    if not security_manager.connection_rate_limiter.can_send_message(connection.connection_id):
        await connection.send_error("Too many messages. Please slow down.", "RATE_LIMIT_EXCEEDED")
        return
    security_manager.connection_rate_limiter.record_message(connection.connection_id)

    # Validate message format
    valid, error = validate_message(message)
    if not valid:
        await connection.send_error(error or "Invalid message format", "INVALID_MESSAGE")
        return

    if message_type == MessageType.PING:
        # Respond with pong
        await connection.send(
            MessageType.PONG,
            {
                "type": MessageType.PONG,
                "id": message_id,
                "timestamp": timestamp,
            },
        )

    elif message_type == MessageType.AUTH:
        # JWT token validation
        token = message.get("token")

        if token:
            # Validate JWT token
            decoded = verify_token(token)
            if not decoded:
                # Invalid or expired token
                await connection.send(
                    MessageType.AUTH_ERROR,
                    {
                        "type": MessageType.AUTH_ERROR,
                        "id": message_id,
                        "timestamp": timestamp,
                        "error": "Invalid or expired token",
                        "code": "INVALID_TOKEN",
                    },
                )
                return

            # Token valid - set connection state
            connection.authenticated = True
            connection.user_id = decoded.user_id
            connection.client_id = message.get("clientId", str(uuid.uuid4()))
            connection.token_payload = decoded
        else:
            # Anonymous connection - only allowed when auth is disabled
            import os
            auth_required = os.environ.get("SYNCKIT_AUTH_REQUIRED", "true") != "false"
            if auth_required:
                await connection.send(
                    MessageType.AUTH_ERROR,
                    {
                        "type": MessageType.AUTH_ERROR,
                        "id": message_id,
                        "timestamp": timestamp,
                        "error": "Authentication required",
                        "code": "AUTH_REQUIRED",
                    },
                )
                return
            connection.authenticated = True
            connection.user_id = message.get("userId", "anonymous")
            connection.client_id = message.get("clientId", str(uuid.uuid4()))
            connection.token_payload = TokenPayload(
                user_id=connection.user_id,
                permissions=DocumentPermissions(
                    can_read=["*"],
                    can_write=["*"],
                    is_admin=False,
                ),
            )

        # Send success response with permissions
        await connection.send(
            MessageType.AUTH_SUCCESS,
            {
                "type": MessageType.AUTH_SUCCESS,
                "id": message_id,
                "timestamp": timestamp,
                "userId": connection.user_id,
                "permissions": {
                    "canRead": connection.token_payload.permissions.can_read,
                    "canWrite": connection.token_payload.permissions.can_write,
                    "isAdmin": connection.token_payload.permissions.is_admin,
                },
            },
        )

    elif message_type == MessageType.SUBSCRIBE:
        # Subscribe to document updates
        doc_id = message.get("docId")
        if not doc_id:
            await connection.send_error("Missing docId", "INVALID_REQUEST")
            return

        # Check authentication
        if not connection.authenticated or not connection.token_payload:
            await connection.send_error("Not authenticated", "NOT_AUTHENTICATED")
            return

        # Validate document ID
        valid, error = validate_document_id(doc_id)
        if not valid:
            await connection.send_error(error or "Invalid document ID", "INVALID_DOCUMENT_ID")
            return

        # Check document access
        if not can_access_document(doc_id):
            await connection.send_error("Access denied to this document", "ACCESS_DENIED")
            return

        # Check read permission
        if not can_read_document(connection.token_payload, doc_id):
            await connection.send_error("Permission denied", "PERMISSION_DENIED")
            return

        await manager.subscribe(connection, doc_id)

        # Send current document state if it exists
        doc = manager.documents.get(doc_id)
        await connection.send(
            MessageType.SYNC_RESPONSE,
            {
                "type": MessageType.SYNC_RESPONSE,
                "id": message_id,
                "timestamp": timestamp,
                "docId": doc_id,
                "state": doc or {},
            },
        )

    elif message_type == MessageType.DELTA:
        # Apply delta and broadcast
        doc_id = message.get("docId")
        if not doc_id:
            await connection.send_error("Missing docId", "INVALID_REQUEST")
            return

        # Check authentication
        if not connection.authenticated or not connection.token_payload:
            await connection.send_error("Not authenticated", "NOT_AUTHENTICATED")
            return

        # Check write permission
        if not can_write_document(connection.token_payload, doc_id):
            await connection.send_error("Permission denied", "PERMISSION_DENIED")
            return

        # Apply delta to document
        if doc_id not in manager.documents:
            manager.documents[doc_id] = {}

        # Simple merge (LWW)
        changes = message.get("changes", {})
        manager.documents[doc_id].update(changes)

        # Broadcast to other subscribers
        await manager.broadcast_delta(doc_id, message, connection.connection_id)

        # Send ACK
        await connection.send(
            MessageType.ACK,
            {
                "type": MessageType.ACK,
                "id": message_id,
                "timestamp": timestamp,
                "docId": doc_id,
            },
        )

    elif message_type == MessageType.DELTA_BATCH:
        # Handle batched deltas
        doc_id = message.get("docId")
        deltas = message.get("deltas", [])

        if not doc_id:
            await connection.send_error("Missing docId", "INVALID_REQUEST")
            return

        # Check authentication
        if not connection.authenticated or not connection.token_payload:
            await connection.send_error("Not authenticated", "NOT_AUTHENTICATED")
            return

        # Check write permission
        if not can_write_document(connection.token_payload, doc_id):
            await connection.send_error("Permission denied", "PERMISSION_DENIED")
            return

        # Apply each delta
        if doc_id not in manager.documents:
            manager.documents[doc_id] = {}

        for delta in deltas:
            changes = delta.get("changes", {})
            manager.documents[doc_id].update(changes)

            # Broadcast individual delta
            await manager.broadcast_delta(doc_id, delta, connection.connection_id)

        # Send single ACK for the batch
        await connection.send(
            MessageType.ACK,
            {
                "type": MessageType.ACK,
                "id": message_id,
                "timestamp": timestamp,
                "docId": doc_id,
                "count": len(deltas),
            },
        )

    elif message_type == MessageType.AWARENESS_UPDATE:
        # Update awareness state
        doc_id = message.get("docId")
        state = message.get("state", {})

        if not doc_id or not connection.client_id:
            return

        # Add timestamp for cleanup tracking
        if isinstance(state, dict):
            state["_lastSeen"] = time.time()

        # Store awareness state
        if doc_id not in manager.awareness_states:
            manager.awareness_states[doc_id] = {}
        manager.awareness_states[doc_id][connection.client_id] = state

        # Track awareness subscription
        connection.awareness_subscriptions.add(doc_id)

        # Broadcast to other subscribers
        if doc_id in manager.document_subscribers:
            for conn_id in manager.document_subscribers[doc_id]:
                if conn_id == connection.connection_id:
                    continue

                conn = manager.connections.get(conn_id)
                if conn:
                    try:
                        await conn.send(
                            MessageType.AWARENESS_STATE,
                            {
                                "type": MessageType.AWARENESS_STATE,
                                "id": str(uuid.uuid4()),
                                "timestamp": timestamp,
                                "docId": doc_id,
                                "clientId": connection.client_id,
                                "state": state,
                            },
                        )
                    except Exception:
                        pass

    else:
        await connection.send_error(f"Unknown message type: {message_type}", "UNKNOWN_MESSAGE_TYPE")
