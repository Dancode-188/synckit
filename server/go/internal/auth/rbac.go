package auth

// CanReadDocument checks if user can read a document.
func CanReadDocument(payload *TokenPayload, documentID string) bool {
	if payload == nil {
		return false
	}

	// Admins can read everything
	if payload.Permissions.IsAdmin {
		return true
	}

	// Wildcard means access to all
	for _, id := range payload.Permissions.CanRead {
		if id == "*" || id == documentID {
			return true
		}
	}

	return false
}

// CanWriteDocument checks if user can write to a document.
func CanWriteDocument(payload *TokenPayload, documentID string) bool {
	if payload == nil {
		return false
	}

	// Admins can write everything
	if payload.Permissions.IsAdmin {
		return true
	}

	// Wildcard means access to all
	for _, id := range payload.Permissions.CanWrite {
		if id == "*" || id == documentID {
			return true
		}
	}

	return false
}

// CreateUserPermissions creates non-admin user permissions.
func CreateUserPermissions(canRead, canWrite []string) DocumentPermissions {
	return DocumentPermissions{
		CanRead:  canRead,
		CanWrite: canWrite,
		IsAdmin:  false,
	}
}

// CreateAdminPermissions creates admin permissions with full access.
func CreateAdminPermissions() DocumentPermissions {
	return DocumentPermissions{
		CanRead:  []string{"*"},
		CanWrite: []string{"*"},
		IsAdmin:  true,
	}
}
