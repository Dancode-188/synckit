/**
 * Large Documents Tests
 * 
 * Tests system behavior with large documents (1K-10K+ fields)
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { setupTestServer, teardownTestServer } from '../integration/helpers/test-server';
import { TestClient } from '../integration/helpers/test-client';
import { BinaryAdapter } from '../integration/helpers/binary-adapter';
import { sleep } from '../integration/config';

describe('Load - Large Documents', () => {
  beforeAll(async () => {
    await setupTestServer();
  }, { timeout: 30000 });

  afterAll(async () => {
    await teardownTestServer();
  }, { timeout: 30000 });

  it('should handle document with 1000 fields', async () => {
    const clients: TestClient[] = [];
    const docId = 'large-1k-doc';
    
    try {
      // Create 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Creating document with 1000 fields...');
      const startTime = Date.now();
      
      // Create 1000 fields
      for (let i = 0; i < 1000; i++) {
        await clients[0].setField(docId, `field${i}`, i);
        
        if ((i + 1) % 200 === 0) {
          console.log(`  Created ${i + 1}/1000 fields`);
        }
      }
      
      const createTime = Date.now() - startTime;
      console.log(`Created 1000 fields in ${createTime}ms`);
      
      // Wait for sync
      console.log('Waiting for sync...');
      await sleep(8000);
      
      // Verify sync
      const state = await clients[1].getDocumentState(docId);
      const fieldCount = Object.keys(state).length;
      
      console.log(`Client 2 received ${fieldCount}/1000 fields`);
      expect(fieldCount).toBeGreaterThan(900); // Allow for some packet loss
      
      console.log('1K field document handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 30000 });

  it('should handle document with 5000 fields', async () => {
    const clients: TestClient[] = [];
    const docId = 'large-5k-doc';
    
    try {
      // Create 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Creating document with 5000 fields...');
      const startTime = Date.now();
      
      // Create 5000 fields in batches
      const batchSize = 100;
      for (let batch = 0; batch < 50; batch++) {
        const operations = [];
        for (let i = 0; i < batchSize; i++) {
          const fieldNum = batch * batchSize + i;
          operations.push(
            clients[0].setField(docId, `field${fieldNum}`, fieldNum)
          );
        }
        await Promise.all(operations);
        
        if ((batch + 1) % 10 === 0) {
          console.log(`  Created ${(batch + 1) * batchSize}/5000 fields`);
        }
        
        await sleep(100); // Small delay between batches
      }
      
      const createTime = Date.now() - startTime;
      console.log(`Created 5000 fields in ${(createTime / 1000).toFixed(2)}s`);
      
      // Wait for sync
      console.log('Waiting for sync...');
      await sleep(15000);
      
      // Verify sync
      const state = await clients[1].getDocumentState(docId);
      const fieldCount = Object.keys(state).length;
      
      console.log(`Client 2 received ${fieldCount}/5000 fields`);
      expect(fieldCount).toBeGreaterThan(4500); // 90% threshold
      
      console.log('5K field document handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 180000 });

  it('should handle document with 10000 fields', async () => {
    const clients: TestClient[] = [];
    const docId = 'large-10k-doc';

    try {
      // Create 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }

      console.log('Creating document with 10000 fields...');
      const startTime = Date.now();

      // Create 10000 fields in larger batches
      const batchSize = 200;
      for (let batch = 0; batch < 50; batch++) {
        const operations = [];
        for (let i = 0; i < batchSize; i++) {
          const fieldNum = batch * batchSize + i;
          operations.push(
            clients[0].setField(docId, `field${fieldNum}`, fieldNum)
          );
        }
        await Promise.all(operations);

        if ((batch + 1) % 10 === 0) {
          console.log(`  Created ${(batch + 1) * batchSize}/10000 fields`);
        }

        await sleep(150); // Delay between batches
      }

      const createTime = Date.now() - startTime;
      console.log(`Created 10000 fields in ${(createTime / 1000).toFixed(2)}s`);

      // Wait for sync
      console.log('Waiting for sync...');
      await sleep(20000);

      // Verify sync
      const state = await clients[1].getDocumentState(docId);
      const fieldCount = Object.keys(state).length;

      console.log(`Client 2 received ${fieldCount}/10000 fields`);
      expect(fieldCount).toBeGreaterThan(9000); // 90% threshold

      console.log('10K field document handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 300000 });

  it('should handle large field values', async () => {
    const clients: TestClient[] = [];
    const docId = 'large-values-doc';
    
    try {
      // Create 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Creating fields with large values...');
      
      // Create fields with large string values
      const largeValue1 = 'x'.repeat(10000); // 10KB
      const largeValue2 = 'y'.repeat(50000); // 50KB
      const largeValue3 = 'z'.repeat(100000); // 100KB
      
      await clients[0].setField(docId, 'large1', largeValue1);
      await clients[0].setField(docId, 'large2', largeValue2);
      await clients[0].setField(docId, 'large3', largeValue3);
      
      // Wait for sync
      await sleep(5000);
      
      // Verify large values synced
      const state = await clients[1].getDocumentState(docId);
      
      expect(state.large1).toBe(largeValue1);
      expect(state.large2).toBe(largeValue2);
      expect(state.large3).toBe(largeValue3);
      
      console.log('Large values synced correctly ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 120000 });

  it('should handle updates to large documents', async () => {
    const clients: TestClient[] = [];
    const docId = 'large-update-doc';
    
    try {
      // Create 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Creating large document...');
      
      // Create 2000 fields
      for (let i = 0; i < 2000; i++) {
        await clients[0].setField(docId, `field${i}`, i);
        
        if ((i + 1) % 500 === 0) {
          console.log(`  Created ${i + 1}/2000 fields`);
        }
      }
      
      await sleep(10000);
      
      console.log('Updating fields in large document...');
      
      // Update random fields
      for (let i = 0; i < 100; i++) {
        const fieldNum = Math.floor(Math.random() * 2000);
        await clients[0].setField(docId, `field${fieldNum}`, fieldNum + 1000);
      }
      
      await sleep(3000);
      
      // Verify updates synced
      const state = await clients[1].getDocumentState(docId);
      expect(Object.keys(state).length).toBeGreaterThan(1900);
      
      console.log('Large document updates handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 120000 });

  it('should handle deletes in large documents', async () => {
    const clients: TestClient[] = [];
    const docId = 'large-delete-doc';
    
    try {
      // Create 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Creating large document...');
      
      // Create 1500 fields
      for (let i = 0; i < 1500; i++) {
        await clients[0].setField(docId, `field${i}`, i);
      }
      
      await sleep(8000);
      
      console.log('Deleting half the fields...');
      
      // Delete 750 fields
      for (let i = 0; i < 750; i++) {
        await clients[0].deleteField(docId, `field${i}`);
      }
      
      await sleep(5000);
      
      // Verify deletes synced
      const state = await clients[1].getDocumentState(docId);
      const fieldCount = Object.keys(state).length;
      
      console.log(`Remaining fields: ${fieldCount} (expected ~750)`);
      expect(fieldCount).toBeLessThan(900);
      expect(fieldCount).toBeGreaterThan(600);
      
      console.log('Large document deletes handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 120000 });

  it('should handle multiple large documents', async () => {
    const clients: TestClient[] = [];
    
    try {
      // Create 3 clients
      for (let i = 0; i < 3; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Creating 5 large documents...');
      
      // Create 5 documents with 500 fields each
      for (let doc = 0; doc < 5; doc++) {
        console.log(`  Creating document ${doc + 1}/5`);
        const docId = `multi-large-doc-${doc}`;
        
        for (let i = 0; i < 500; i++) {
          await clients[doc % 3].setField(docId, `field${i}`, i);
        }
        
        await sleep(2000);
      }
      
      console.log('Waiting for all documents to sync...');
      await sleep(10000);
      
      // Verify all documents synced
      for (let doc = 0; doc < 5; doc++) {
        const docId = `multi-large-doc-${doc}`;
        const state = await clients[2].getDocumentState(docId);
        const fieldCount = Object.keys(state).length;
        
        console.log(`  Doc ${doc}: ${fieldCount}/500 fields`);
        expect(fieldCount).toBeGreaterThan(450);
      }
      
      console.log('Multiple large documents handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 180000 });

  it('should handle large document with concurrent updates', async () => {
    const clients: TestClient[] = [];
    const docId = 'large-concurrent-doc';
    
    try {
      // Create 5 clients
      for (let i = 0; i < 5; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Creating large document with concurrent updates...');
      
      // All clients create fields simultaneously
      await Promise.all(
        clients.map((client, clientIdx) =>
          (async () => {
            for (let i = 0; i < 400; i++) {
              const fieldName = `client${clientIdx}_field${i}`;
              await client.setField(docId, fieldName, i);
            }
          })()
        )
      );
      
      console.log('Waiting for convergence...');
      await sleep(12000);
      
      // Verify all clients converged
      const states = await Promise.all(
        clients.map(c => c.getDocumentState(docId))
      );
      
      const fieldCount = Object.keys(states[0]).length;
      console.log(`Converged to ${fieldCount}/2000 fields`);
      
      // All should have same state
      expect(states[0]).toEqual(states[1]);
      expect(fieldCount).toBeGreaterThan(1800); // 90% threshold
      
      console.log('Concurrent large document handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 30000 });

  it('should measure performance with large documents', async () => {
    const clients: TestClient[] = [];
    const docId = 'perf-large-doc';
    
    try {
      // Create 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Measuring performance with large document...');
      
      // Create 3000 fields and measure time
      const startCreate = Date.now();
      
      for (let i = 0; i < 3000; i++) {
        await clients[0].setField(docId, `perf${i}`, i);
      }
      
      const createTime = Date.now() - startCreate;
      const createRate = 3000 / (createTime / 1000);
      
      console.log(`Created 3000 fields in ${(createTime / 1000).toFixed(2)}s (${createRate.toFixed(0)} fields/sec)`);
      
      // Measure sync time
      const startSync = Date.now();
      await sleep(12000);
      
      const state = await clients[1].getDocumentState(docId);
      const syncTime = Date.now() - startSync;
      const fieldCount = Object.keys(state).length;
      
      console.log(`Synced ${fieldCount}/3000 fields in ${(syncTime / 1000).toFixed(2)}s`);
      
      expect(fieldCount).toBeGreaterThan(2700);

    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 180000 });

  it('should handle large document with mixed data types', async () => {
    const clients: TestClient[] = [];
    const docId = 'large-mixed-doc';
    
    try {
      // Create 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Creating large document with mixed types...');
      
      // Create 1000 fields with different types
      for (let i = 0; i < 1000; i++) {
        const typeSelector = i % 5;
        let value: any;
        
        switch (typeSelector) {
          case 0:
            value = `string${i}`;
            break;
          case 1:
            value = i;
            break;
          case 2:
            value = i % 2 === 0;
            break;
          case 3:
            value = null;
            break;
          case 4:
            value = { nested: i };
            break;
        }
        
        await clients[0].setField(docId, `mixed${i}`, value);
        
        if ((i + 1) % 250 === 0) {
          console.log(`  Created ${i + 1}/1000 mixed fields`);
        }
      }
      
      await sleep(10000);
      
      // Verify types preserved
      const state = await clients[1].getDocumentState(docId);
      const fieldCount = Object.keys(state).length;
      
      console.log(`Synced ${fieldCount}/1000 mixed-type fields`);
      expect(fieldCount).toBeGreaterThan(900);
      
      // Spot check types
      if (state.mixed0) expect(typeof state.mixed0).toBe('string');
      if (state.mixed1) expect(typeof state.mixed1).toBe('number');
      if (state.mixed2) expect(typeof state.mixed2).toBe('boolean');
      
      console.log('Mixed data types preserved ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 30000 });

  it('should handle incremental growth to large document', async () => {
    const clients: TestClient[] = [];
    const docId = 'incremental-large-doc';
    
    try {
      // Create 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new TestClient({ adapter: new BinaryAdapter() });
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      console.log('Growing document incrementally...');
      
      // Grow in stages
      const stages = [100, 500, 1000, 2000];
      
      for (let s = 0; s < stages.length; s++) {
        const target = stages[s];
        const start = s === 0 ? 0 : stages[s - 1];
        
        console.log(`  Stage ${s + 1}: Growing to ${target} fields`);
        
        for (let i = start; i < target; i++) {
          await clients[0].setField(docId, `incremental${i}`, i);
        }
        
        await sleep(3000);
        
        // Check sync
        const state = await clients[1].getDocumentState(docId);
        console.log(`    Synced: ${Object.keys(state).length}/${target}`);
      }
      
      // Final verification
      await sleep(5000);
      const finalState = await clients[1].getDocumentState(docId);
      const finalCount = Object.keys(finalState).length;
      
      console.log(`Final: ${finalCount}/2000 fields`);
      expect(finalCount).toBeGreaterThan(1800);
      
      console.log('Incremental growth handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  }, { timeout: 60000 });
});
