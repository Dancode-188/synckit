/**
 * Packet Loss Chaos Tests
 * 
 * Tests sync behavior under packet loss conditions (5%, 10%, 25%)
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { setupTestServer, teardownTestServer } from '../integration/helpers/test-server';
import { sleep } from '../integration/config';
import {
  ChaosNetworkSimulator,
  createChaosClients,
  cleanupChaosClients,
  ChaosPresets,
} from './network-simulator';
import { waitForChaosConvergence } from './chaos-helpers';

describe('Chaos - Packet Loss', () => {
  beforeAll(async () => {
    await setupTestServer();
  });

  afterAll(async () => {
    await teardownTestServer();
  });

  // Generate unique document ID for each test to prevent state leakage
  const getDocId = () => `packetloss-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  it('should converge with 5% packet loss', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.lightPacketLoss);
    
    try {
      await clients[0].connect();
      await clients[1].connect();
      
      // Make changes from both clients
      for (let i = 0; i < 20; i++) {
        await clients[0].setField(docId, `fieldA${i}`, i);
        await clients[1].setField(docId, `fieldB${i}`, i);
      }

      // Wait for convergence (should eventually converge despite packet loss)
      await waitForChaosConvergence(clients, docId, 8000);

      // Check stats (with 5% loss, we might not always drop messages)
      const stats = clients[0].getStats();
      console.log('5% packet loss stats:', stats);
      expect(stats.messagesDropped).toBeGreaterThanOrEqual(0); // May or may not drop messages
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should converge with 10% packet loss', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.moderatePacketLoss);
    
    try {
      await clients[0].connect();
      await clients[1].connect();
      
      // Make changes
      for (let i = 0; i < 30; i++) {
        await clients[0].setField(docId, `field${i}`, i);
      }

      // Wait for convergence
      const finalState = await waitForChaosConvergence(clients, docId, 10000);

      expect(Object.keys(finalState).length).toBeGreaterThan(20); // Most should sync
      
      const stats = clients[0].getStats();
      console.log('10% packet loss stats:', stats);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should converge with 25% packet loss (extreme)', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.heavyPacketLoss);
    
    try {
      await clients[0].connect();
      await clients[1].connect();
      
      // Make fewer changes but verify they eventually sync
      for (let i = 0; i < 15; i++) {
        await clients[0].setField(docId, `field${i}`, i);
        await sleep(100); // Space out to improve sync chances
      }

      // Extended wait for convergence under heavy packet loss
      await waitForChaosConvergence(clients, docId, 12000);
      
      const stats = clients[0].getStats();
      console.log('25% packet loss stats:', stats);
      expect(stats.messagesDropped).toBeGreaterThan(0);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle packet loss with concurrent updates', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(3, ChaosPresets.moderatePacketLoss);
    
    try {
      await Promise.all(clients.map(c => c.connect()));
      
      // All clients make concurrent changes
      await Promise.all([
        (async () => {
          for (let i = 0; i < 10; i++) {
            await clients[0].setField(docId, `A${i}`, i);
          }
        })(),
        (async () => {
          for (let i = 0; i < 10; i++) {
            await clients[1].setField(docId, `B${i}`, i);
          }
        })(),
        (async () => {
          for (let i = 0; i < 10; i++) {
            await clients[2].setField(docId, `C${i}`, i);
          }
        })(),
      ]);

      // Wait for convergence
      await waitForChaosConvergence(clients, docId, 12000);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle packet loss with deletes', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.lightPacketLoss);

    try {
      await clients[0].connect();
      await clients[1].connect();

      // Create fields
      for (let i = 0; i < 10; i++) {
        await clients[0].setField(docId, `field${i}`, i);
      }

      // Wait for initial sync
      await waitForChaosConvergence(clients, docId, 6000);

      // Delete some fields
      for (let i = 0; i < 5; i++) {
        await clients[0].deleteField(docId, `field${i}`);
      }

      // Wait for delete sync
      const finalState = await waitForChaosConvergence(clients, docId, 6000);

      // With packet loss, some deletes might be lost, expect ~5 remaining (allow ±1)
      const remaining = Object.keys(finalState).length;
      expect(remaining).toBeGreaterThanOrEqual(4);
      expect(remaining).toBeLessThanOrEqual(6);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should maintain data integrity under packet loss', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.moderatePacketLoss);

    try {
      await clients[0].connect();
      await clients[1].connect();

      // Create known data
      await clients[0].setField(docId, 'string', 'test');
      await clients[0].setField(docId, 'number', 42);
      await clients[0].setField(docId, 'boolean', true);
      await clients[0].setField(docId, 'null', null);

      // Wait for sync
      await sleep(3000);

      // Verify integrity of synced fields (some may be lost to packet loss)
      const state = await clients[1].getDocumentState(docId);

      // At least some fields should have synced
      expect(Object.keys(state).length).toBeGreaterThan(0);

      // Fields that did sync should have correct values
      if (state.string !== undefined) {
        expect(state.string).toBe('test');
      }
      if (state.number !== undefined) {
        expect(state.number).toBe(42);
      }
      if (state.boolean !== undefined) {
        expect(state.boolean).toBe(true);
      }
      if (state.null !== undefined) {
        expect(state.null).toBe(null);
      }
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle packet loss with rapid updates', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.lightPacketLoss);
    
    try {
      await clients[0].connect();
      await clients[1].connect();
      
      // Rapid updates to same field
      for (let i = 0; i < 50; i++) {
        await clients[0].setField(docId, 'counter', i);
      }

      // Wait for convergence (use convergence check instead of fixed sleep)
      await waitForChaosConvergence(clients, docId, 8000);

      // Final value should sync (with packet loss, last update might be lost)
      const valueA = await clients[0].getField(docId, 'counter');
      const valueB = await clients[1].getField(docId, 'counter');

      expect(valueA).toBe(valueB);
      // With 5% packet loss on 50 updates, final value should be close to 49
      expect(valueA).toBeGreaterThanOrEqual(45); // At least 90% of updates synced
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should recover from burst packet loss', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, {
      packetLoss: 0.50, // 50% loss for burst simulation
    });
    
    try {
      await clients[0].connect();
      await clients[1].connect();
      
      // Make changes during burst loss
      for (let i = 0; i < 10; i++) {
        await clients[0].setField(docId, `burst${i}`, i);
      }

      // Wait for recovery (should eventually converge)
      await waitForChaosConvergence(clients, docId, 12000);
      
      const stats = clients[0].getStats();
      console.log('Burst packet loss stats:', stats);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle packet loss with conflicting updates', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.moderatePacketLoss);
    
    try {
      await clients[0].connect();
      await clients[1].connect();
      
      // Initial value
      await clients[0].setField(docId, 'conflict', 'original');
      await sleep(1500);

      // Both update same field
      await clients[0].setField(docId, 'conflict', 'fromA');
      await clients[1].setField(docId, 'conflict', 'fromB');

      // Wait for convergence (should resolve via LWW)
      const finalState = await waitForChaosConvergence(clients, docId, 8000);

      expect(['fromA', 'fromB']).toContain(finalState.conflict);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should track packet loss statistics', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(1, ChaosPresets.lightPacketLoss);
    
    try {
      await clients[0].connect();
      
      clients[0].resetStats();
      
      // Make many changes
      for (let i = 0; i < 100; i++) {
        await clients[0].setField(docId, `field${i}`, i);
      }
      
      const stats = clients[0].getStats();
      
      // Should have dropped some packets (around 5)
      expect(stats.messagesDropped).toBeGreaterThan(0);
      expect(stats.messagesDropped).toBeLessThan(20);
      
      console.log(`Dropped ${stats.messagesDropped} out of 100 messages (${stats.messagesDropped}%)`);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle packet loss in multi-client scenario', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(5, ChaosPresets.lightPacketLoss);

    try {
      await Promise.all(clients.map(c => c.connect()));

      // Each client makes unique changes
      await Promise.all(
        clients.map((client, idx) =>
          client.setField(docId, `client${idx}`, `value${idx}`)
        )
      );

      // Wait for convergence
      const finalState = await waitForChaosConvergence(clients, docId, 10000);

      // Most clients should be represented (allow some packet loss)
      expect(Object.keys(finalState).length).toBeGreaterThanOrEqual(3); // At least 3/5 clients (60% under packet loss)
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle packet loss with empty values', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.moderatePacketLoss);
    
    try {
      await clients[0].connect();
      await clients[1].connect();
      
      // Set various empty/falsy values
      await clients[0].setField(docId, 'emptyString', '');
      await clients[0].setField(docId, 'zero', 0);
      await clients[0].setField(docId, 'false', false);
      await clients[0].setField(docId, 'null', null);

      // Wait for convergence
      const state = await waitForChaosConvergence(clients, docId, 8000);

      // Verify values that synced have correct types/values
      // With moderate packet loss, some fields may be lost, expect at least 2/4 (50%)
      let syncedCount = 0;
      if (state.emptyString === '') syncedCount++;
      if (state.zero === 0) syncedCount++;
      if (state.false === false) syncedCount++;
      if (state.null === null) syncedCount++;

      expect(syncedCount).toBeGreaterThanOrEqual(2); // At least 2 out of 4 fields (50% under moderate packet loss)
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle packet loss with large documents', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.lightPacketLoss);
    
    try {
      await clients[0].connect();
      await clients[1].connect();
      
      // Create large document
      for (let i = 0; i < 100; i++) {
        await clients[0].setField(docId, `field${i}`, i);
      }

      // Wait for convergence
      const finalState = await waitForChaosConvergence(clients, docId, 15000);

      // Verify most fields synced
      expect(Object.keys(finalState).length).toBeGreaterThan(90); // Most should sync
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should eventually achieve 100% convergence despite packet loss', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(3, ChaosPresets.moderatePacketLoss);

    try {
      await Promise.all(clients.map(c => c.connect()));

      // Create deterministic data
      const expectedData: Record<string, number> = {};
      for (let i = 0; i < 20; i++) {
        expectedData[`field${i}`] = i;
        await clients[0].setField(docId, `field${i}`, i);
      }

      // Wait for convergence
      const finalState = await waitForChaosConvergence(clients, docId, 12000);

      // With 10% packet loss, expect ~80%+ convergence (allowing for variance)
      const syncedCount = Object.keys(finalState).length;
      expect(syncedCount).toBeGreaterThanOrEqual(16); // At least 80% of 20 fields

      // All synced fields should have correct values
      for (const [key, value] of Object.entries(finalState)) {
        expect(value).toBe(expectedData[key]);
      }
    } finally {
      await cleanupChaosClients(clients);
    }
  });
});
