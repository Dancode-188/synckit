"""
JWT Authentication Module

Matches TypeScript reference: server/typescript/src/auth/jwt.ts
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import jwt, ExpiredSignatureError, JWTError

from ..config import settings


@dataclass
class DocumentPermissions:
    """Document-level permissions"""

    can_read: list[str] = field(default_factory=list)  # Document IDs user can read
    can_write: list[str] = field(default_factory=list)  # Document IDs user can write
    is_admin: bool = False  # Admin has access to all documents


@dataclass
class TokenPayload:
    """JWT Token Payload"""

    user_id: str
    permissions: DocumentPermissions
    email: Optional[str] = None
    iat: Optional[int] = None  # Issued at
    exp: Optional[int] = None  # Expiration


def verify_token(token: str) -> Optional[TokenPayload]:
    """
    Verify and decode JWT token.

    Must match TypeScript behavior exactly:
    - Validate signature with secret
    - Check expiration
    - Return None on any error (no exceptions propagated)

    Args:
        token: JWT token string

    Returns:
        TokenPayload if valid, None if invalid/expired
    """
    try:
        decoded = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )

        # Extract permissions
        perms_data = decoded.get("permissions", {})
        permissions = DocumentPermissions(
            can_read=perms_data.get("canRead", []),
            can_write=perms_data.get("canWrite", []),
            is_admin=perms_data.get("isAdmin", False),
        )

        return TokenPayload(
            user_id=decoded.get("userId", ""),
            email=decoded.get("email"),
            permissions=permissions,
            iat=decoded.get("iat"),
            exp=decoded.get("exp"),
        )
    except ExpiredSignatureError:
        # Token expired - matches TypeScript jwt.TokenExpiredError
        return None
    except JWTError:
        # Invalid token - matches TypeScript jwt.JsonWebTokenError
        return None
    except Exception:
        # Any other error
        return None


def generate_access_token(
    user_id: str,
    permissions: DocumentPermissions,
    email: Optional[str] = None,
    expires_in_hours: Optional[int] = None,
) -> str:
    """
    Generate JWT access token.

    Args:
        user_id: User identifier
        permissions: Document permissions
        email: Optional email address
        expires_in_hours: Token expiration in hours (default from config)

    Returns:
        JWT token string
    """
    if expires_in_hours is None:
        expires_in_hours = settings.jwt_expiration_hours

    now = datetime.now(timezone.utc)
    expire = now + timedelta(hours=expires_in_hours)

    payload = {
        "userId": user_id,
        "permissions": {
            "canRead": permissions.can_read,
            "canWrite": permissions.can_write,
            "isAdmin": permissions.is_admin,
        },
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }

    if email:
        payload["email"] = email

    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def generate_refresh_token(user_id: str, expires_in_days: int = 7) -> str:
    """
    Generate JWT refresh token.

    Args:
        user_id: User identifier
        expires_in_days: Token expiration in days (default 7)

    Returns:
        JWT token string
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=expires_in_days)

    payload = {
        "userId": user_id,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }

    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def generate_tokens(
    user_id: str,
    email: str,
    permissions: DocumentPermissions,
) -> dict[str, str]:
    """
    Generate both access and refresh tokens for a user.

    Args:
        user_id: User identifier
        email: User email
        permissions: Document permissions

    Returns:
        Dict with 'accessToken' and 'refreshToken'
    """
    return {
        "accessToken": generate_access_token(user_id, permissions, email),
        "refreshToken": generate_refresh_token(user_id),
    }


def decode_token(token: str) -> Optional[TokenPayload]:
    """
    Decode token without verification (for debugging).

    Args:
        token: JWT token string

    Returns:
        TokenPayload if decodable, None otherwise
    """
    try:
        # Decode without verification
        decoded = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"verify_signature": False, "verify_exp": False},
        )

        perms_data = decoded.get("permissions", {})
        permissions = DocumentPermissions(
            can_read=perms_data.get("canRead", []),
            can_write=perms_data.get("canWrite", []),
            is_admin=perms_data.get("isAdmin", False),
        )

        return TokenPayload(
            user_id=decoded.get("userId", ""),
            email=decoded.get("email"),
            permissions=permissions,
            iat=decoded.get("iat"),
            exp=decoded.get("exp"),
        )
    except Exception:
        return None
