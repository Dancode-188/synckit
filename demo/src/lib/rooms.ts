/**
 * Room management and routing utilities
 * Handles URL-based collaborative rooms and app-wide navigation
 */

// ============================================================================
// Route Detection
// ============================================================================

export type AppRoute = 'stage' | 'room' | 'wordwall' | 'playground';

/**
 * Determine the current route from the URL hash
 */
export function getRouteFromUrl(): AppRoute {
  const hash = window.location.hash;
  if (!hash || hash === '#' || hash === '#/') return 'stage';
  if (hash.match(/^#\/room\/[a-z0-9]+$/i)) return 'room';
  if (hash === '#/wordwall') return 'wordwall';
  if (hash === '#/playground') return 'playground';
  return 'stage';
}

// ============================================================================
// Navigation
// ============================================================================

export function navigateToStage(): void {
  window.location.hash = '/';
}

export function navigateToRoom(roomId: string): void {
  window.location.hash = `/room/${roomId}`;
}

export function navigateToWordWall(): void {
  window.location.hash = '/wordwall';
}

export function navigateToPlayground(): void {
  window.location.hash = '/playground';
}

/**
 * Leave room (go back to stage)
 */
export function leaveRoom(): void {
  navigateToStage();
}

// ============================================================================
// Room Utilities
// ============================================================================

/**
 * Generate a random room ID (6 alphanumeric chars)
 */
export function generateRoomId(): string {
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
  const match = hash.match(/^#\/room\/([a-z0-9]+)$/i);
  return match ? match[1] : null;
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
