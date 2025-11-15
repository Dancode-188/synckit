import type { TokenPayload } from './jwt';

/**
 * Permission levels
 */
export enum PermissionLevel {
  NONE = 'none',
  READ = 'read',
  WRITE = 'write',
  ADMIN = 'admin',
}

/**
 * Check if user can read a document
 */
export function canReadDocument(payload: TokenPayload, documentId: string): boolean {
  // Admins can read everything
  if (payload.permissions.isAdmin) {
    return true;
  }
  
  // Check explicit read permission
  return payload.permissions.canRead.includes(documentId);
}

/**
 * Check if user can write to a document
 */
export function canWriteDocument(payload: TokenPayload, documentId: string): boolean {
  // Admins can write everything
  if (payload.permissions.isAdmin) {
    return true;
  }
  
  // Check explicit write permission
  return payload.permissions.canWrite.includes(documentId);
}

/**
 * Check if user is admin
 */
export function isAdmin(payload: TokenPayload): boolean {
  return payload.permissions.isAdmin;
}

/**
 * Get permission level for document
 */
export function getPermissionLevel(
  payload: TokenPayload,
  documentId: string
): PermissionLevel {
  if (payload.permissions.isAdmin) {
    return PermissionLevel.ADMIN;
  }
  
  if (payload.permissions.canWrite.includes(documentId)) {
    return PermissionLevel.WRITE;
  }
  
  if (payload.permissions.canRead.includes(documentId)) {
    return PermissionLevel.READ;
  }
  
  return PermissionLevel.NONE;
}

/**
 * Create admin permissions (access to all documents)
 */
export function createAdminPermissions() {
  return {
    canRead: [],
    canWrite: [],
    isAdmin: true,
  };
}

/**
 * Create user permissions with specific document access
 */
export function createUserPermissions(
  readDocs: string[] = [],
  writeDocs: string[] = []
) {
  return {
    canRead: readDocs,
    canWrite: writeDocs,
    isAdmin: false,
  };
}

/**
 * Create read-only permissions
 */
export function createReadOnlyPermissions(documentIds: string[]) {
  return {
    canRead: documentIds,
    canWrite: [],
    isAdmin: false,
  };
}
