/**
 * Data Migration Tests
 * 
 * Tests database schema migrations and data transformations
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { setupTestServer, teardownTestServer, restartTestServer } from '../helpers/test-server';
import { TestClient } from '../helpers/test-client';
import { sleep } from '../config';

describe('Storage - Migrations', () => {
  beforeAll(async () => {
    await setupTestServer();
  });

  afterAll(async () => {
    await teardownTestServer();
  });

  const docId = 'migration-doc';

  it('should handle schema version upgrades', async () => {
    const clients: TestClient[] = [];
    
    try {
      console.log('Testing schema version upgrade...');
      
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      // Create data with "old schema"
      await client.setField(docId, 'legacyField', 'oldValue');
      await sleep(1000);
      
      // Simulate schema upgrade (restart)
      console.log('Simulating schema upgrade...');
      await restartTestServer();
      await sleep(2000);
      
      // Reconnect with "new schema"
      const client2 = new TestClient();
      await client2.init();
      await client2.connect();
      clients.push(client2);
      
      // Old data should still be accessible
      const state = await client2.getDocumentState(docId);
      expect(state.legacyField).toBe('oldValue');
      
      // New data should work
      await client2.setField(docId, 'newField', 'newValue');
      await sleep(500);
      
      const updatedState = await client2.getDocumentState(docId);
      expect(updatedState.newField).toBe('newValue');
      
      console.log('Schema version upgrade successful ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should migrate field type changes', async () => {
    const typeChangeDocId = 'type-change-doc';
    const clients: TestClient[] = [];
    
    try {
      console.log('Testing field type migration...');
      
      const client1 = new TestClient();
      await client1.init();
      await client1.connect();
      clients.push(client1);
      
      // Store as string initially
      await client1.setField(typeChangeDocId, 'counter', '42');
      await sleep(500);
      
      // "Migrate" by storing as number
      await client1.setField(typeChangeDocId, 'counter', 42);
      await sleep(500);
      
      // Verify type changed
      const state = await client1.getDocumentState(typeChangeDocId);
      expect(typeof state.counter).toBe('number');
      expect(state.counter).toBe(42);
      
      console.log('Field type migration successful ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle field rename migrations', async () => {
    const renameDocId = 'rename-migration-doc';
    const clients: TestClient[] = [];
    
    try {
      console.log('Testing field rename migration...');
      
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      // Old field name
      await client.setField(renameDocId, 'oldFieldName', 'importantData');
      await sleep(500);
      
      // Read old field
      const oldState = await client.getDocumentState(renameDocId);
      const oldValue = oldState.oldFieldName;
      
      // "Migrate" by creating new field and deleting old
      await client.setField(renameDocId, 'newFieldName', oldValue);
      await client.deleteField(renameDocId, 'oldFieldName');
      await sleep(500);
      
      // Verify migration
      const newState = await client.getDocumentState(renameDocId);
      expect(newState.oldFieldName).toBeUndefined();
      expect(newState.newFieldName).toBe('importantData');
      
      console.log('Field rename migration successful ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle data transformation migrations', async () => {
    const transformDocId = 'transform-migration-doc';
    const clients: TestClient[] = [];
    
    try {
      console.log('Testing data transformation migration...');
      
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      // Old format: comma-separated string
      await client.setField(transformDocId, 'tags', 'javascript,typescript,react');
      await sleep(500);
      
      // Transform to new format: array
      const oldState = await client.getDocumentState(transformDocId);
      const tagsArray = oldState.tags.split(',');
      await client.setField(transformDocId, 'tags', tagsArray);
      await sleep(500);
      
      // Verify transformation
      const newState = await client.getDocumentState(transformDocId);
      expect(Array.isArray(newState.tags)).toBe(true);
      expect(newState.tags).toEqual(['javascript', 'typescript', 'react']);
      
      console.log('Data transformation migration successful ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle backward compatibility', async () => {
    const backCompatDocId = 'backward-compat-doc';
    const clients: TestClient[] = [];
    
    try {
      console.log('Testing backward compatibility...');
      
      const client1 = new TestClient();
      await client1.init();
      await client1.connect();
      clients.push(client1);
      
      // New client writes with new field
      await client1.setField(backCompatDocId, 'newField', 'newData');
      await client1.setField(backCompatDocId, 'legacyField', 'legacyData');
      await sleep(1000);
      
      // Simulate old client reconnecting (still works with legacy fields)
      const client2 = new TestClient();
      await client2.init();
      await client2.connect();
      clients.push(client2);
      
      // Old client should still work
      const state = await client2.getDocumentState(backCompatDocId);
      expect(state.legacyField).toBe('legacyData');
      
      // Old client can still write
      await client2.setField(backCompatDocId, 'legacyUpdate', 'works');
      await sleep(500);
      
      const updatedState = await client2.getDocumentState(backCompatDocId);
      expect(updatedState.legacyUpdate).toBe('works');
      
      console.log('Backward compatibility maintained ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle forward compatibility', async () => {
    const forwardCompatDocId = 'forward-compat-doc';
    const clients: TestClient[] = [];
    
    try {
      console.log('Testing forward compatibility...');
      
      const client1 = new TestClient();
      await client1.init();
      await client1.connect();
      clients.push(client1);
      
      // Old client writes
      await client1.setField(forwardCompatDocId, 'oldField', 'oldData');
      await sleep(500);
      
      // New client adds new fields
      await client1.setField(forwardCompatDocId, 'futureField', 'futureData');
      await sleep(500);
      
      // Old fields still work alongside new fields
      const state = await client1.getDocumentState(forwardCompatDocId);
      expect(state.oldField).toBe('oldData');
      expect(state.futureField).toBe('futureData');
      
      console.log('Forward compatibility maintained ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should migrate multiple documents in batch', async () => {
    const clients: TestClient[] = [];
    
    try {
      console.log('Testing batch migration...');
      
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      // Create 20 documents with old format
      console.log('Creating 20 documents...');
      for (let i = 0; i < 20; i++) {
        await client.setField(`batch-doc-${i}`, 'version', 'v1');
        await client.setField(`batch-doc-${i}`, 'data', `data${i}`);
      }
      await sleep(2000);
      
      // Batch migrate to new format
      console.log('Batch migrating...');
      for (let i = 0; i < 20; i++) {
        await client.setField(`batch-doc-${i}`, 'version', 'v2');
        await client.setField(`batch-doc-${i}`, 'migratedAt', Date.now());
      }
      await sleep(2000);
      
      // Verify all migrated
      let migratedCount = 0;
      for (let i = 0; i < 20; i++) {
        const state = await client.getDocumentState(`batch-doc-${i}`);
        if (state.version === 'v2' && state.migratedAt) {
          migratedCount++;
        }
      }
      
      console.log(`Migrated ${migratedCount}/20 documents`);
      expect(migratedCount).toBeGreaterThan(15); // 75% success rate
      
      console.log('Batch migration successful ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle rollback scenarios', async () => {
    const rollbackDocId = 'rollback-doc';
    const clients: TestClient[] = [];
    
    try {
      console.log('Testing migration rollback...');
      
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      // Initial state (v1)
      await client.setField(rollbackDocId, 'version', 'v1');
      await client.setField(rollbackDocId, 'data', 'original');
      await sleep(500);
      
      // Backup for rollback
      const backup = await client.getDocumentState(rollbackDocId);
      
      // Attempt migration to v2
      await client.setField(rollbackDocId, 'version', 'v2');
      await client.setField(rollbackDocId, 'data', 'migrated');
      await sleep(500);
      
      // Simulate migration failure - rollback
      console.log('Rolling back migration...');
      await client.setField(rollbackDocId, 'version', backup.version);
      await client.setField(rollbackDocId, 'data', backup.data);
      await sleep(500);
      
      // Verify rollback
      const state = await client.getDocumentState(rollbackDocId);
      expect(state.version).toBe('v1');
      expect(state.data).toBe('original');
      
      console.log('Migration rollback successful ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle complex nested data migrations', async () => {
    const nestedDocId = 'nested-migration-doc';
    const clients: TestClient[] = [];
    
    try {
      console.log('Testing nested data migration...');
      
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      // Old nested format
      const oldFormat = {
        user: {
          name: 'Alice',
          contact: {
            email: 'alice@example.com',
            phone: '555-0100'
          }
        }
      };
      
      await client.setField(nestedDocId, 'userData', oldFormat);
      await sleep(500);
      
      // Migrate to flattened format
      const newFormat = {
        userName: oldFormat.user.name,
        userEmail: oldFormat.user.contact.email,
        userPhone: oldFormat.user.contact.phone
      };
      
      await client.setField(nestedDocId, 'userData', newFormat);
      await sleep(500);
      
      // Verify migration
      const state = await client.getDocumentState(nestedDocId);
      expect(state.userData.userName).toBe('Alice');
      expect(state.userData.userEmail).toBe('alice@example.com');
      
      console.log('Nested data migration successful ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should preserve data integrity during migration', async () => {
    const integrityDocId = 'integrity-migration-doc';
    const clients: TestClient[] = [];
    
    try {
      console.log('Testing data integrity during migration...');
      
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      // Create comprehensive data
      await client.setField(integrityDocId, 'id', 'rec123');
      await client.setField(integrityDocId, 'balance', 1000);
      await client.setField(integrityDocId, 'transactions', [
        { id: 1, amount: 100 },
        { id: 2, amount: 200 }
      ]);
      await sleep(1000);
      
      // Backup
      const beforeMigration = await client.getDocumentState(integrityDocId);
      
      // Simulate migration (add new field without breaking existing)
      await client.setField(integrityDocId, 'currency', 'USD');
      await sleep(500);
      
      // Verify integrity maintained
      const afterMigration = await client.getDocumentState(integrityDocId);
      expect(afterMigration.id).toBe(beforeMigration.id);
      expect(afterMigration.balance).toBe(beforeMigration.balance);
      expect(afterMigration.transactions).toEqual(beforeMigration.transactions);
      expect(afterMigration.currency).toBe('USD');
      
      console.log('Data integrity preserved during migration ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle incremental migrations', async () => {
    const incrementalDocId = 'incremental-migration-doc';
    const clients: TestClient[] = [];
    
    try {
      console.log('Testing incremental migrations...');
      
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      // Version 1
      await client.setField(incrementalDocId, 'version', 1);
      await client.setField(incrementalDocId, 'name', 'Product');
      await sleep(300);
      
      // Migrate to version 2 (add field)
      await client.setField(incrementalDocId, 'version', 2);
      await client.setField(incrementalDocId, 'description', 'Product description');
      await sleep(300);
      
      // Migrate to version 3 (add another field)
      await client.setField(incrementalDocId, 'version', 3);
      await client.setField(incrementalDocId, 'price', 99.99);
      await sleep(300);
      
      // Verify all migrations applied
      const state = await client.getDocumentState(incrementalDocId);
      expect(state.version).toBe(3);
      expect(state.name).toBe('Product');
      expect(state.description).toBe('Product description');
      expect(state.price).toBe(99.99);
      
      console.log('Incremental migrations successful ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should handle migration conflicts', async () => {
    const conflictDocId = 'conflict-migration-doc';
    const clients: TestClient[] = [];
    
    try {
      console.log('Testing migration conflicts...');
      
      // Create 2 clients
      const client1 = new TestClient();
      await client1.init();
      await client1.connect();
      clients.push(client1);
      
      const client2 = new TestClient();
      await client2.init();
      await client2.connect();
      clients.push(client2);
      
      // Both attempt migration simultaneously
      await Promise.all([
        client1.setField(conflictDocId, 'version', 'v2-client1'),
        client2.setField(conflictDocId, 'version', 'v2-client2')
      ]);
      
      await sleep(1000);
      
      // LWW should resolve the conflict
      const state = await client1.getDocumentState(conflictDocId);
      expect(state.version).toBeDefined();
      
      // Both clients should converge
      const state2 = await client2.getDocumentState(conflictDocId);
      expect(state).toEqual(state2);
      
      console.log('Migration conflicts resolved via LWW ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });

  it('should validate migrated data', async () => {
    const validationDocId = 'validation-migration-doc';
    const clients: TestClient[] = [];
    
    try {
      console.log('Testing migration validation...');
      
      const client = new TestClient();
      await client.init();
      await client.connect();
      clients.push(client);
      
      // Create data to migrate
      await client.setField(validationDocId, 'email', 'invalid-email');
      await sleep(500);
      
      // Migrate with validation (fix invalid data)
      const state = await client.getDocumentState(validationDocId);
      const validEmail = state.email.includes('@') 
        ? state.email 
        : 'default@example.com';
      
      await client.setField(validationDocId, 'email', validEmail);
      await client.setField(validationDocId, 'validated', true);
      await sleep(500);
      
      // Verify validation
      const validatedState = await client.getDocumentState(validationDocId);
      expect(validatedState.email).toBe('default@example.com');
      expect(validatedState.validated).toBe(true);
      
      console.log('Migration validation successful ✅');
    } finally {
      await Promise.all(clients.map(c => c.cleanup()));
    }
  });
});
