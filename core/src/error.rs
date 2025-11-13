//! Error types for SyncKit

use thiserror::Error;

/// Result type alias for SyncKit operations
pub type Result<T> = std::result::Result<T, SyncError>;

/// Main error type for SyncKit operations
#[derive(Error, Debug, Clone)]
pub enum SyncError {
    #[error("Document not found: {0}")]
    DocumentNotFound(String),

    #[error("Field not found: {0}")]
    FieldNotFound(String),

    #[error("Invalid timestamp: {0}")]
    InvalidTimestamp(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Deserialization error: {0}")]
    DeserializationError(String),

    #[error("Storage error: {0}")]
    StorageError(String),

    #[error("Network error: {0}")]
    NetworkError(String),

    #[error("Conflict error: {0}")]
    ConflictError(String),

    #[error("Invalid operation: {0}")]
    InvalidOperation(String),

    #[error("Protocol error: {0}")]
    Protocol(String),
}

impl SyncError {
    /// Check if this error is retryable
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            SyncError::NetworkError(_) |  SyncError::StorageError(_) | SyncError::ConflictError(_)
        )
    }

    /// Get error code for client communication
    pub fn code(&self) -> &'static str {
        match self {
            SyncError::DocumentNotFound(_) => "DOCUMENT_NOT_FOUND",
            SyncError::FieldNotFound(_) => "FIELD_NOT_FOUND",
            SyncError::InvalidTimestamp(_) => "INVALID_TIMESTAMP",
            SyncError::SerializationError(_) => "SERIALIZATION_ERROR",
            SyncError::DeserializationError(_) => "DESERIALIZATION_ERROR",
            SyncError::StorageError(_) => "STORAGE_ERROR",
            SyncError::NetworkError(_) => "NETWORK_ERROR",
            SyncError::ConflictError(_) => "CONFLICT_ERROR",
            SyncError::InvalidOperation(_) => "INVALID_OPERATION",
            SyncError::Protocol(_) => "PROTOCOL_ERROR",
        }
    }
}
