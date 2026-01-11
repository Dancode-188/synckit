/**
 * Room management utilities
 * Handles URL-based collaborative rooms
 */

/**
 * Generate a random room ID
 */
export function generateRoomId(): string {
  // Generate a short, memorable room ID (6 chars)
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Get room ID from URL hash
 * Format: #/room/abc123
 */
export function getRoomIdFromUrl(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/^#\/room\/([a-z0-9]+)$/);
  return match ? match[1] : null;
}

/**
 * Navigate to a room
 */
export function navigateToRoom(roomId: string): void {
  window.location.hash = `/room/${roomId}`;
}

/**
 * Leave room (go back to normal mode)
 */
export function leaveRoom(): void {
  window.location.hash = '';
}

/**
 * Get shareable room URL
 */
export function getRoomUrl(roomId: string): string {
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}#/room/${roomId}`;
}

/**
 * Convert room ID to document ID for SyncKit
 */
export function roomToDocumentId(roomId: string): string {
  return `room:${roomId}`;
}

/**
 * Check if currently in a room
 */
export function isInRoom(): boolean {
  return getRoomIdFromUrl() !== null;
}
