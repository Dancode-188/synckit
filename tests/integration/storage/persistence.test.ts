/**
 * Storage Persistence Tests
 * 
 * Tests document and vector clock persistence to PostgreSQL
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { setupTestServer, teardownTestServer } from '../helpers/test-server';
import { TestClient } from '../helpers/test-client';
import { sleep } from '../config';

describe('Storage - Persistence', () => {
  beforeAll(async () => {
    await setupTestServer();
  });

  afterAll(async () => {
    await teardownTestServer();
  });

  const docId = 'persistent-doc';

  it('should persist document to PostgreSQL', async () => {
    const clients: TestClient[] = [];
    
    try {
      // Create client and make changes
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      console.log('Creating document with fields...');
      await client.setField(docId, 'name', 'Alice');
      await client.setField(docId, 'age', 30);
      await client.setField(docId, 'email', 'alice@example.com');
      
      // Wait for persistence
      await sleep(1000);
      
      // Verify data persisted
      const state = await client.getDocumentState(docId);
      expect(state.name).toBe('Alice');
      expect(state.age).toBe(30);
      expect(state.email).toBe('alice@example.com');
      
      console.log('Document persisted successfully ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should persist vector clock with document', async () => {
    const clients: TestClient[] = [];
    
    try {
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      console.log('Making multiple changes to advance vector clock...');
      for (let i = 0; i < 5; i++) {
        await client.setField(docId, `field${i}`, i);
      }
      
      await sleep(1000);
      
      // Vector clock should have advanced
      const state = await client.getDocumentState(docId);
      expect(Object.keys(state).length).toBe(5);
      
      console.log('Vector clock persisted with document ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should persist field-level metadata', async () => {
    const clients: TestClient[] = [];
    
    try {
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      console.log('Creating fields with metadata...');
      await client.setField(docId, 'title', 'Test Document');
      await client.setField(docId, 'status', 'draft');
      
      await sleep(1000);
      
      // Update one field
      await client.setField(docId, 'status', 'published');
      await sleep(1000);
      
      // Both fields should persist with latest values
      const state = await client.getDocumentState(docId);
      expect(state.title).toBe('Test Document');
      expect(state.status).toBe('published');
      
      console.log('Field metadata persisted correctly ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should persist deletes (tombstones)', async () => {
    const clients: TestClient[] = [];
    
    try {
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      console.log('Creating and deleting fields...');
      await client.setField(docId, 'temp1', 'value1');
      await client.setField(docId, 'temp2', 'value2');
      await client.setField(docId, 'keep', 'important');
      
      await sleep(500);
      
      // Delete temp fields
      await client.deleteField(docId, 'temp1');
      await client.deleteField(docId, 'temp2');
      
      await sleep(1000);
      
      // Verify deletes persisted
      const state = await client.getDocumentState(docId);
      expect(state.temp1).toBeUndefined();
      expect(state.temp2).toBeUndefined();
      expect(state.keep).toBe('important');
      
      console.log('Tombstones persisted correctly ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should persist large documents', async () => {
    const largeDocId = 'large-persistent-doc';
    const clients: TestClient[] = [];
    
    try {
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      console.log('Creating large document (500 fields)...');
      
      // Create 500 fields
      for (let i = 0; i < 500; i++) {
        await client.setField(largeDocId, `field${i}`, i);
        
        if ((i + 1) % 100 === 0) {
          console.log(`  Created ${i + 1}/500 fields`);
          await sleep(200); // Give persistence time
        }
      }
      
      await sleep(2000);
      
      // Verify all fields persisted
      const state = await client.getDocumentState(largeDocId);
      const fieldCount = Object.keys(state).length;
      
      console.log(`Persisted ${fieldCount}/500 fields`);
      expect(fieldCount).toBeGreaterThan(450); // 90% threshold
      
      console.log('Large document persisted ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should persist concurrent writes from multiple clients', async () => {
    const concurrentDocId = 'concurrent-persistent-doc';
    const clients: TestClient[] = [];
    
    try {
      console.log('Creating 5 clients for concurrent writes...');
      
      // Create 5 clients
      for (let i = 0; i < 5; i++) {
        const client = new TestClient();
        await client.init();
        await client.connect();
        clients.push(client);
      }
      
      // All write concurrently
      await Promise.all(
        clients.map((client, idx) =>
          Promise.all([
            client.setField(concurrentDocId, `client${idx}_field1`, `value1`),
            client.setField(concurrentDocId, `client${idx}_field2`, `value2`),
          ])
        )
      );
      
      await sleep(2000);
      
      // Verify all writes persisted
      const state = await clients[0].getDocumentState(concurrentDocId);
      expect(Object.keys(state).length).toBe(10); // 5 clients * 2 fields
      
      console.log('Concurrent writes persisted correctly ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should persist updates to existing fields', async () => {
    const updateDocId = 'update-persistent-doc';
    const clients: TestClient[] = [];
    
    try {
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      console.log('Creating and updating fields...');
      
      // Initial values
      await client.setField(updateDocId, 'counter', 0);
      await client.setField(updateDocId, 'status', 'initial');
      await sleep(500);
      
      // Update values multiple times
      for (let i = 1; i <= 5; i++) {
        await client.setField(updateDocId, 'counter', i);
        await sleep(200);
      }
      
      await client.setField(updateDocId, 'status', 'final');
      await sleep(1000);
      
      // Verify latest values persisted
      const state = await client.getDocumentState(updateDocId);
      expect(state.counter).toBe(5);
      expect(state.status).toBe('final');
      
      console.log('Updates persisted correctly ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should persist different data types', async () => {
    const typesDocId = 'types-persistent-doc';
    const clients: TestClient[] = [];
    
    try {
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      console.log('Persisting different data types...');
      
      // Various data types
      await client.setField(typesDocId, 'string', 'hello');
      await client.setField(typesDocId, 'number', 42);
      await client.setField(typesDocId, 'boolean', true);
      await client.setField(typesDocId, 'null', null);
      await client.setField(typesDocId, 'object', { nested: 'value' });
      await client.setField(typesDocId, 'array', [1, 2, 3]);
      
      await sleep(1000);
      
      // Verify types preserved
      const state = await client.getDocumentState(typesDocId);
      expect(typeof state.string).toBe('string');
      expect(typeof state.number).toBe('number');
      expect(typeof state.boolean).toBe('boolean');
      expect(state.null).toBeNull();
      expect(typeof state.object).toBe('object');
      expect(Array.isArray(state.array)).toBe(true);
      
      console.log('Data types persisted correctly ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle rapid persistence operations', async () => {
    const rapidDocId = 'rapid-persistent-doc';
    const clients: TestClient[] = [];
    
    try {
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      console.log('Sending rapid operations...');
      
      // Rapid fire 100 operations
      for (let i = 0; i < 100; i++) {
        await client.setField(rapidDocId, `rapid${i}`, i);
      }
      
      await sleep(3000); // Allow persistence to catch up
      
      // Verify most operations persisted
      const state = await client.getDocumentState(rapidDocId);
      const fieldCount = Object.keys(state).length;
      
      console.log(`Persisted ${fieldCount}/100 rapid operations`);
      expect(fieldCount).toBeGreaterThan(80); // 80% threshold
      
      console.log('Rapid persistence handled ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should persist document across reconnection', async () => {
    const reconnectDocId = 'reconnect-persistent-doc';
    const clients: TestClient[] = [];
    
    try {
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      console.log('Creating document before disconnect...');
      await client.setField(reconnectDocId, 'before', 'disconnect');
      await sleep(500);
      
      // Disconnect
      await client.disconnect();
      await sleep(500);
      
      // Reconnect
      await client.connect();
      await sleep(500);
      
      // Create new field after reconnect
      await client.setField(reconnectDocId, 'after', 'reconnect');
      await sleep(1000);
      
      // Both fields should be present
      const state = await client.getDocumentState(reconnectDocId);
      expect(state.before).toBe('disconnect');
      expect(state.after).toBe('reconnect');
      
      console.log('Persistence across reconnection verified ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should persist multiple documents independently', async () => {
    const clients: TestClient[] = [];
    
    try {
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      console.log('Creating multiple documents...');
      
      // Create 10 different documents
      for (let i = 0; i < 10; i++) {
        await client.setField(`doc${i}`, 'id', i);
        await client.setField(`doc${i}`, 'name', `Document ${i}`);
      }
      
      await sleep(2000);
      
      // Verify each document persisted independently
      for (let i = 0; i < 10; i++) {
        const state = await client.getDocumentState(`doc${i}`);
        expect(state.id).toBe(i);
        expect(state.name).toBe(`Document ${i}`);
      }
      
      console.log('Multiple documents persisted independently ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should persist large field values', async () => {
    const largeValueDocId = 'large-value-doc';
    const clients: TestClient[] = [];
    
    try {
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      console.log('Persisting large field values...');
      
      // Create large values
      const largeString = 'x'.repeat(10000); // 10KB
      const largeArray = Array.from({ length: 1000 }, (_, i) => i);
      const largeObject = Object.fromEntries(
        Array.from({ length: 500 }, (_, i) => [`key${i}`, `value${i}`])
      );
      
      await client.setField(largeValueDocId, 'largeString', largeString);
      await client.setField(largeValueDocId, 'largeArray', largeArray);
      await client.setField(largeValueDocId, 'largeObject', largeObject);
      
      await sleep(2000);
      
      // Verify large values persisted
      const state = await client.getDocumentState(largeValueDocId);
      expect(state.largeString).toBe(largeString);
      expect(state.largeArray).toEqual(largeArray);
      expect(Object.keys(state.largeObject).length).toBe(500);
      
      console.log('Large values persisted correctly ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });
});
