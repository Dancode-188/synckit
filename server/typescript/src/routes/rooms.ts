/**
 * Room Stats Routes
 *
 * Provides document statistics filtered for room-based documents.
 * Used by the demo Stage landing page to display live room info.
 */

import { Hono } from 'hono';
import type { SyncWebSocketServer } from '../websocket/server';

export function createRoomRoutes(wsServer: SyncWebSocketServer) {
  const app = new Hono();

  /**
   * GET /rooms
   *
   * Returns stats for room documents, total connections, and special documents.
   */
  app.get('/', (c) => {
    const stats = wsServer.getStats();

    const rooms = stats.documents.documents
      .filter((d) => d.id.startsWith('room:') && !d.id.includes(':text:'))
      .map((d) => ({
        id: d.id.replace('room:', ''),
        subscriberCount: d.subscribers,
        lastModified: d.lastModified,
      }));

    const wordwall = stats.documents.documents.find(
      (d) => d.id === 'wordwall'
    );

    return c.json({
      rooms,
      totalConnections: stats.connections.totalConnections,
      totalRooms: rooms.length,
      wordwall: wordwall
        ? {
            id: wordwall.id,
            subscriberCount: wordwall.subscribers,
            lastModified: wordwall.lastModified,
          }
        : null,
    });
  });

  return app;
}
