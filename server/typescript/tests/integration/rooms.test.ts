import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import { createRoomRoutes } from '../../src/routes/rooms';

// Mock wsServer with getStats()
function createMockWsServer(documents: Array<{ id: string; subscribers: number; lastModified: number }>) {
  return {
    getStats() {
      return {
        connections: {
          totalConnections: documents.reduce((sum, d) => sum + d.subscribers, 0),
          totalUsers: 0,
          totalClients: 0,
        },
        documents: {
          totalDocuments: documents.length,
          documents,
        },
      };
    },
  } as any;
}

describe('GET /rooms', () => {
  test('should return empty rooms when no documents exist', async () => {
    const wsServer = createMockWsServer([]);
    const app = new Hono();
    app.route('/rooms', createRoomRoutes(wsServer));

    const res = await app.request('/rooms');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.rooms).toEqual([]);
    expect(data.totalConnections).toBe(0);
    expect(data.totalRooms).toBe(0);
    expect(data.wordwall).toBeNull();
  });

  test('should return room documents filtered by room: prefix', async () => {
    const wsServer = createMockWsServer([
      { id: 'room:abc123', subscribers: 5, lastModified: 1000 },
      { id: 'room:def456', subscribers: 12, lastModified: 2000 },
      { id: 'playground', subscribers: 3, lastModified: 500 },
    ]);
    const app = new Hono();
    app.route('/rooms', createRoomRoutes(wsServer));

    const res = await app.request('/rooms');
    const data = await res.json();

    expect(data.rooms).toHaveLength(2);
    expect(data.rooms[0].id).toBe('abc123');
    expect(data.rooms[0].subscriberCount).toBe(5);
    expect(data.rooms[1].id).toBe('def456');
    expect(data.rooms[1].subscriberCount).toBe(12);
    expect(data.totalRooms).toBe(2);
    expect(data.totalConnections).toBe(20);
  });

  test('should exclude room text child documents', async () => {
    const wsServer = createMockWsServer([
      { id: 'room:abc123', subscribers: 5, lastModified: 1000 },
      { id: 'room:abc123:text:block-1', subscribers: 5, lastModified: 1000 },
      { id: 'room:abc123:text:block-2', subscribers: 5, lastModified: 1000 },
    ]);
    const app = new Hono();
    app.route('/rooms', createRoomRoutes(wsServer));

    const res = await app.request('/rooms');
    const data = await res.json();

    expect(data.rooms).toHaveLength(1);
    expect(data.rooms[0].id).toBe('abc123');
  });

  test('should include wordwall document when present', async () => {
    const wsServer = createMockWsServer([
      { id: 'wordwall', subscribers: 8, lastModified: 3000 },
      { id: 'room:abc123', subscribers: 5, lastModified: 1000 },
    ]);
    const app = new Hono();
    app.route('/rooms', createRoomRoutes(wsServer));

    const res = await app.request('/rooms');
    const data = await res.json();

    expect(data.wordwall).not.toBeNull();
    expect(data.wordwall.id).toBe('wordwall');
    expect(data.wordwall.subscriberCount).toBe(8);
  });
});
