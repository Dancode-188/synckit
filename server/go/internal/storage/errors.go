package storage

import (
	"errors"
	"fmt"
)

// Common storage errors
var (
	ErrNotConnected = errors.New("storage not connected")
	ErrNotFound     = errors.New("resource not found")
	ErrConflict     = errors.New("resource conflict")
)

// StorageError represents a storage operation error
type StorageError struct {
	Message string
	Code    string
	Cause   error
}

func (e *StorageError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Cause)
	}
	return e.Message
}

func (e *StorageError) Unwrap() error {
	return e.Cause
}

// NewStorageError creates a new storage error
func NewStorageError(message, code string, cause error) *StorageError {
	return &StorageError{
		Message: message,
		Code:    code,
		Cause:   cause,
	}
}

// ConnectionError represents a connection failure
type ConnectionError struct {
	StorageError
}

// NewConnectionError creates a new connection error
func NewConnectionError(message string, cause error) *ConnectionError {
	return &ConnectionError{
		StorageError: StorageError{
			Message: message,
			Code:    "CONNECTION_ERROR",
			Cause:   cause,
		},
	}
}

// QueryError represents a query execution failure
type QueryError struct {
	StorageError
}

// NewQueryError creates a new query error
func NewQueryError(message string, cause error) *QueryError {
	return &QueryError{
		StorageError: StorageError{
			Message: message,
			Code:    "QUERY_ERROR",
			Cause:   cause,
		},
	}
}

// NotFoundError represents a resource not found
type NotFoundError struct {
	Resource string
	ID       string
}

func (e *NotFoundError) Error() string {
	return fmt.Sprintf("%s not found: %s", e.Resource, e.ID)
}

// NewNotFoundError creates a new not found error
func NewNotFoundError(resource, id string) *NotFoundError {
	return &NotFoundError{
		Resource: resource,
		ID:       id,
	}
}

// ConflictError represents a resource conflict (e.g., duplicate key)
type ConflictError struct {
	Message string
}

func (e *ConflictError) Error() string {
	return e.Message
}

// NewConflictError creates a new conflict error
func NewConflictError(message string) *ConflictError {
	return &ConflictError{Message: message}
}
