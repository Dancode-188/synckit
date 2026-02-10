/**
 * Room sharding utilities
 * Auto-assigns users to rooms based on capacity
 */

export const ROOM_CAPACITY = 20;

export interface RoomInfo {
  id: string;
  subscriberCount: number;
  lastModified: number;
}

/**
 * Pick the best room to join.
 * Strategy: pick the most populated non-full room.
 * This fills rooms before creating new ones, so users
 * are more likely to find active collaborators.
 */
export function pickBestRoom(rooms: RoomInfo[]): string | null {
  const available = rooms
    .filter((r) => r.subscriberCount < ROOM_CAPACITY)
    .sort((a, b) => b.subscriberCount - a.subscriberCount);
  return available.length > 0 ? available[0].id : null;
}
