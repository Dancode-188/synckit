"""
Security module for SyncKit server

Provides rate limiting, input validation, and access control.
Matches TypeScript reference: server/typescript/src/security/middleware.ts
"""

from .middleware import (
    SECURITY_LIMITS,
    ConnectionLimiter,
    MessageRateLimiter,
    ConnectionRateLimiter,
    DocumentLimiter,
    SecurityManager,
    validate_message,
    validate_document_id,
    can_access_document,
    security_manager,
)

__all__ = [
    "SECURITY_LIMITS",
    "ConnectionLimiter",
    "MessageRateLimiter",
    "ConnectionRateLimiter",
    "DocumentLimiter",
    "SecurityManager",
    "validate_message",
    "validate_document_id",
    "can_access_document",
    "security_manager",
]
