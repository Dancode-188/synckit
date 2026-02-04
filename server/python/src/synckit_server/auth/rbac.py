"""
Role-Based Access Control

Matches TypeScript reference: server/typescript/src/auth/rbac.ts
"""

from .jwt import TokenPayload, DocumentPermissions


def can_read_document(payload: TokenPayload, document_id: str) -> bool:
    """
    Check if user can read a document.

    Args:
        payload: Verified token payload
        document_id: Document to check access for

    Returns:
        True if user has read access
    """
    # Admins can read everything
    if payload.permissions.is_admin:
        return True

    # Wildcard means access to all
    if "*" in payload.permissions.can_read:
        return True

    # Check specific document access
    return document_id in payload.permissions.can_read


def can_write_document(payload: TokenPayload, document_id: str) -> bool:
    """
    Check if user can write to a document.

    Args:
        payload: Verified token payload
        document_id: Document to check access for

    Returns:
        True if user has write access
    """
    # Admins can write everything
    if payload.permissions.is_admin:
        return True

    # Wildcard means access to all
    if "*" in payload.permissions.can_write:
        return True

    # Check specific document access
    return document_id in payload.permissions.can_write


def create_user_permissions(
    can_read: list[str],
    can_write: list[str],
) -> DocumentPermissions:
    """
    Create non-admin user permissions.

    Args:
        can_read: List of document IDs user can read
        can_write: List of document IDs user can write

    Returns:
        DocumentPermissions instance
    """
    return DocumentPermissions(
        can_read=can_read,
        can_write=can_write,
        is_admin=False,
    )


def create_admin_permissions() -> DocumentPermissions:
    """
    Create admin permissions with full access.

    Returns:
        DocumentPermissions instance with admin privileges
    """
    return DocumentPermissions(
        can_read=["*"],
        can_write=["*"],
        is_admin=True,
    )
