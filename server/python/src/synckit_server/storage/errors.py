"""Storage error types matching TypeScript reference"""


class StorageError(Exception):
    """Base storage error"""
    def __init__(self, message: str, code: str | None = None, cause: Exception | None = None):
        super().__init__(message)
        self.code = code
        self.cause = cause


class ConnectionError(StorageError):
    """Database connection error"""
    def __init__(self, message: str, cause: Exception | None = None):
        super().__init__(message, "CONNECTION_ERROR", cause)


class QueryError(StorageError):
    """Database query error"""
    def __init__(self, message: str, cause: Exception | None = None):
        super().__init__(message, "QUERY_ERROR", cause)


class NotFoundError(StorageError):
    """Resource not found error"""
    def __init__(self, resource: str, id: str):
        super().__init__(f"{resource} not found: {id}", "NOT_FOUND")
        self.resource = resource
        self.resource_id = id


class ConflictError(StorageError):
    """Conflict error (e.g., version mismatch)"""
    def __init__(self, message: str):
        super().__init__(message, "CONFLICT")
