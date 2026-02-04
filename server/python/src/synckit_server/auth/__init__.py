"""
Authentication module for SyncKit server
"""

from .jwt import (
    TokenPayload,
    DocumentPermissions,
    verify_token,
    generate_access_token,
    generate_refresh_token,
    generate_tokens,
    decode_token,
)
from .rbac import (
    can_read_document,
    can_write_document,
    create_user_permissions,
    create_admin_permissions,
)

__all__ = [
    "TokenPayload",
    "DocumentPermissions",
    "verify_token",
    "generate_access_token",
    "generate_refresh_token",
    "generate_tokens",
    "decode_token",
    "can_read_document",
    "can_write_document",
    "create_user_permissions",
    "create_admin_permissions",
]
