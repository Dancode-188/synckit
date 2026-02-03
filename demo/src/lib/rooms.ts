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
  // Both public rooms (#/room/...) and private rooms (#/proom/...) use 'room' route
  if (hash.match(/^#\/p?room\/[a-z0-9]+$/i)) return 'room';
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

export function navigateToRoom(roomId: string, isPrivate: boolean = false): void {
  window.location.hash = isPrivate ? `/proom/${roomId}` : `/room/${roomId}`;
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
 * Format: #/room/abc123 (public) or #/proom/abc123 (private)
 */
export function getRoomIdFromUrl(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/^#\/p?room\/([a-z0-9]+)$/i);
  return match ? match[1] : null;
}

/**
 * Check if current URL is a private room
 */
export function isPrivateRoomUrl(): boolean {
  return window.location.hash.startsWith('#/proom/');
}

/**
 * Get shareable room URL
 */
export function getRoomUrl(roomId: string, isPrivate: boolean = false): string {
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}#/${isPrivate ? 'proom' : 'room'}/${roomId}`;
}

/**
 * Convert room ID to document ID for SyncKit
 * Uses 'room:' prefix for public rooms, 'proom:' for private rooms
 */
export function roomToDocumentId(roomId: string, isPrivate: boolean = false): string {
  return isPrivate ? `proom:${roomId}` : `room:${roomId}`;
}

/**
 * Check if currently in a room
 */
export function isInRoom(): boolean {
  return getRoomIdFromUrl() !== null;
}

// ============================================================================
// Recent Rooms (localStorage)
// ============================================================================

const RECENT_ROOMS_KEY = 'localwrite-recent-rooms';
const MAX_RECENT_ROOMS = 10;

export interface RecentRoom {
  id: string;
  isPrivate: boolean;
  visitedAt: number;
}

/**
 * Get list of recently visited rooms from localStorage
 */
export function getRecentRooms(): RecentRoom[] {
  if (typeof localStorage === 'undefined') return [];
  const stored = localStorage.getItem(RECENT_ROOMS_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Add or update a room in the recent rooms list
 */
export function addRecentRoom(room: Omit<RecentRoom, 'visitedAt'>): void {
  if (typeof localStorage === 'undefined') return;
  const rooms = getRecentRooms().filter(r => r.id !== room.id);
  rooms.unshift({ ...room, visitedAt: Date.now() });
  if (rooms.length > MAX_RECENT_ROOMS) rooms.pop();
  localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(rooms));
}

/**
 * Remove a room from the recent rooms list
 */
export function removeRecentRoom(roomId: string): void {
  if (typeof localStorage === 'undefined') return;
  const rooms = getRecentRooms().filter(r => r.id !== roomId);
  localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(rooms));
}
