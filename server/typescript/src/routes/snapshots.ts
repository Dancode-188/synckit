/**
 * Snapshot Routes
 *
 * HTTP endpoints for document snapshot management
 */

import { Hono } from 'hono';
import type { StorageAdapter } from '../storage/interface';
import type { SyncWebSocketServer } from '../websocket/server';

export function createSnapshotRoutes(
  storage: StorageAdapter | undefined,
  wsServer: SyncWebSocketServer | undefined
) {
  const app = new Hono();

  // Middleware to check if storage is available
  const requireStorage = async (c: any, next: () => Promise<void>) => {
    if (!storage) {
      return c.json(
        { error: 'Snapshot storage not configured' },
        503 // Service Unavailable
      );
    }
    await next();
  };

  /**
   * POST /snapshots/:documentId
   * Create a snapshot of a document's current state
   */
  app.post('/:documentId', requireStorage, async (c) => {
    try {
      const documentId = c.req.param('documentId');

      // Get current document state from WebSocket server (in-memory)
      // If not in memory, fall back to storage
      let state: any;
      let version: Record<string, bigint> = {};

      if (wsServer) {
        const coordinator = wsServer.getCoordinator();
        try {
          const docState = await coordinator.getDocument(documentId);

          if (docState) {
            // Parse WASM document state
            const json = docState.wasmDoc.toJSON();
            const parsed = JSON.parse(json);
            state = parsed.fields || {};

            // Get vector clock
            version = docState.vectorClock.toObject();
          }
        } catch (error) {
          // Document not found in memory, will try storage
        }
      }

      // Fall back to storage if not in memory
      if (!state && storage) {
        const doc = await storage.getDocument(documentId);
        if (!doc) {
          return c.json({ error: 'Document not found' }, 404);
        }
        state = doc.state;
        version = await storage.getVectorClock(documentId);
      }

      if (!state) {
        return c.json({ error: 'Document not found' }, 404);
      }

      // Calculate size
      const stateJson = JSON.stringify(state);
      const sizeBytes = Buffer.byteLength(stateJson, 'utf8');

      // Save snapshot
      const snapshot = await storage!.saveSnapshot({
        documentId,
        state,
        version,
        sizeBytes,
        compressed: false,
      });

      return c.json({
        id: snapshot.id,
        documentId: snapshot.documentId,
        version: Object.fromEntries(
          Object.entries(snapshot.version).map(([k, v]) => [k, Number(v)])
        ),
        sizeBytes: snapshot.sizeBytes,
        createdAt: snapshot.createdAt.toISOString(),
        compressed: snapshot.compressed || false,
      });
    } catch (error) {
      console.error('[Snapshots] Error creating snapshot:', error);
      return c.json(
        { error: 'Failed to create snapshot' },
        500
      );
    }
  });

  /**
   * GET /snapshots/:documentId/latest
   * Get the latest snapshot for a document
   */
  app.get('/:documentId/latest', requireStorage, async (c) => {
    try {
      const documentId = c.req.param('documentId');
      const snapshot = await storage!.getLatestSnapshot(documentId);

      if (!snapshot) {
        return c.json({ error: 'No snapshots found' }, 404);
      }

      return c.json({
        id: snapshot.id,
        documentId: snapshot.documentId,
        state: snapshot.state,
        version: Object.fromEntries(
          Object.entries(snapshot.version).map(([k, v]) => [k, Number(v)])
        ),
        sizeBytes: snapshot.sizeBytes,
        createdAt: snapshot.createdAt.toISOString(),
        compressed: snapshot.compressed || false,
      });
    } catch (error) {
      console.error('[Snapshots] Error fetching latest snapshot:', error);
      return c.json(
        { error: 'Failed to fetch snapshot' },
        500
      );
    }
  });

  /**
   * GET /snapshots/:documentId
   * List all snapshots for a document
   */
  app.get('/:documentId', requireStorage, async (c) => {
    try {
      const documentId = c.req.param('documentId');
      const limit = parseInt(c.req.query('limit') || '10', 10);

      const snapshots = await storage!.listSnapshots(documentId, limit);

      return c.json({
        documentId,
        count: snapshots.length,
        snapshots: snapshots.map(s => ({
          id: s.id,
          documentId: s.documentId,
          version: Object.fromEntries(
            Object.entries(s.version).map(([k, v]) => [k, Number(v)])
          ),
          sizeBytes: s.sizeBytes,
          createdAt: s.createdAt.toISOString(),
          compressed: s.compressed || false,
        })),
      });
    } catch (error) {
      console.error('[Snapshots] Error listing snapshots:', error);
      return c.json(
        { error: 'Failed to list snapshots' },
        500
      );
    }
  });

  /**
   * GET /snapshots/id/:snapshotId
   * Get a specific snapshot by ID
   */
  app.get('/id/:snapshotId', requireStorage, async (c) => {
    try {
      const snapshotId = c.req.param('snapshotId');
      const snapshot = await storage!.getSnapshot(snapshotId);

      if (!snapshot) {
        return c.json({ error: 'Snapshot not found' }, 404);
      }

      return c.json({
        id: snapshot.id,
        documentId: snapshot.documentId,
        state: snapshot.state,
        version: Object.fromEntries(
          Object.entries(snapshot.version).map(([k, v]) => [k, Number(v)])
        ),
        sizeBytes: snapshot.sizeBytes,
        createdAt: snapshot.createdAt.toISOString(),
        compressed: snapshot.compressed || false,
      });
    } catch (error) {
      console.error('[Snapshots] Error fetching snapshot:', error);
      return c.json(
        { error: 'Failed to fetch snapshot' },
        500
      );
    }
  });

  /**
   * DELETE /snapshots/id/:snapshotId
   * Delete a specific snapshot
   */
  app.delete('/id/:snapshotId', requireStorage, async (c) => {
    try {
      const snapshotId = c.req.param('snapshotId');
      const deleted = await storage!.deleteSnapshot(snapshotId);

      if (!deleted) {
        return c.json({ error: 'Snapshot not found' }, 404);
      }

      return c.json({ success: true });
    } catch (error) {
      console.error('[Snapshots] Error deleting snapshot:', error);
      return c.json(
        { error: 'Failed to delete snapshot' },
        500
      );
    }
  });

  return app;
}
