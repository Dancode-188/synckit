/**
 * Basic CRUD Operations Test
 * 
 * Tests fundamental Create, Read, Update, Delete operations
 * on a single client (no synchronization)
 */

import { describe, it, expect } from 'bun:test';
import {
  setupTestSuite,
  createClient,
  assertDocumentState,
  assertFieldValue,
  assertFieldExists,
  assertFieldNotExists,
  assertDocumentEmpty,
  TEST_CONFIG,
} from '../setup';
import { generateTestId, sleep } from '../config';

describe('E2E Sync - Basic CRUD', () => {
  setupTestSuite();

  it('should create document with single field', async () => {
    const docId = generateTestId('crud');
    const client = await createClient();

    await client.setField(docId, 'name', 'Alice');

    await assertFieldValue(client, docId, 'name', 'Alice');
  });

  it('should read field value', async () => {
    const docId = generateTestId('crud');
    const client = await createClient();

    await client.setField(docId, 'status', 'active');
    const value = await client.getField(docId, 'status');

    expect(value).toBe('active');
  });

  it('should update field value', async () => {
    const docId = generateTestId('crud');
    const client = await createClient();

    await client.setField(docId, 'counter', 0);
    await client.setField(docId, 'counter', 1);
    await client.setField(docId, 'counter', 2);

    await assertFieldValue(client, docId, 'counter', 2);
  });

  it('should delete field', async () => {
    const docId = generateTestId('crud');
    const client = await createClient();

    await client.setField(docId, 'temp', 'value');
    await assertFieldExists(client, docId, 'temp');

    await client.deleteField(docId, 'temp');
    await assertFieldNotExists(client, docId, 'temp');
  });

  it('should handle multiple fields', async () => {
    const docId = generateTestId('crud');
    const client = await createClient();

    await client.setField(docId, 'firstName', 'John');
    await client.setField(docId, 'lastName', 'Doe');
    await client.setField(docId, 'age', 30);
    await client.setField(docId, 'email', 'john@example.com');

    await assertDocumentState(client, docId, {
      firstName: 'John',
      lastName: 'Doe',
      age: 30,
      email: 'john@example.com',
    });
  });

  it('should handle different data types', async () => {
    const docId = generateTestId('crud');
    const client = await createClient();

    await client.setField(docId, 'string', 'hello');
    await client.setField(docId, 'number', 42);
    await client.setField(docId, 'boolean', true);
    await client.setField(docId, 'null', null);

    const state = await client.getDocumentState(docId);

    expect(state.string).toBe('hello');
    expect(state.number).toBe(42);
    expect(state.boolean).toBe(true);
    expect(state.null).toBe(null);
  });

  it('should handle nested objects', async () => {
    const docId = generateTestId('crud');
    const client = await createClient();

    await client.setField(docId, 'user', {
      name: 'Alice',
      age: 25,
      address: {
        city: 'New York',
        zip: '10001',
      },
    });

    const value = await client.getField(docId, 'user');

    expect(value).toEqual({
      name: 'Alice',
      age: 25,
      address: {
        city: 'New York',
        zip: '10001',
      },
    });
  });

  it('should handle arrays', async () => {
    const docId = generateTestId('crud');
    const client = await createClient();

    await client.setField(docId, 'tags', ['javascript', 'typescript', 'rust']);
    await client.setField(docId, 'numbers', [1, 2, 3, 4, 5]);

    const tags = await client.getField(docId, 'tags');
    const numbers = await client.getField(docId, 'numbers');

    expect(tags).toEqual(['javascript', 'typescript', 'rust']);
    expect(numbers).toEqual([1, 2, 3, 4, 5]);
  });

  it('should handle empty strings', async () => {
    const docId = generateTestId('crud');
    const client = await createClient();

    await client.setField(docId, 'empty', '');

    await assertFieldValue(client, docId, 'empty', '');
  });

  it('should handle zero values', async () => {
    const docId = generateTestId('crud');
    const client = await createClient();

    await client.setField(docId, 'zero', 0);
    await client.setField(docId, 'falsy', false);

    await assertFieldValue(client, docId, 'zero', 0);
    await assertFieldValue(client, docId, 'falsy', false);
  });

  it('should overwrite existing field', async () => {
    const docId = generateTestId('crud');
    const client = await createClient();

    await client.setField(docId, 'value', 'first');
    await client.setField(docId, 'value', 'second');
    await client.setField(docId, 'value', 'third');

    await assertFieldValue(client, docId, 'value', 'third');
  });

  it('should delete multiple fields', async () => {
    const docId = generateTestId('crud');
    const client = await createClient();

    await client.setField(docId, 'a', 1);
    await client.setField(docId, 'b', 2);
    await client.setField(docId, 'c', 3);

    await client.deleteField(docId, 'a');
    await client.deleteField(docId, 'c');

    const state = await client.getDocumentState(docId);

    expect(state).toEqual({ b: 2 });
  });

  it('should handle rapid updates', async () => {
    const docId = generateTestId('crud');
    const client = await createClient();

    for (let i = 0; i < 100; i++) {
      await client.setField(docId, 'counter', i);
    }

    // Small delay to ensure final delta is processed (binary protocol batching)
    await sleep(100);

    await assertFieldValue(client, docId, 'counter', 99);
  });

  it('should get entire document state', async () => {
    const docId = generateTestId('crud');
    const client = await createClient();

    await client.setField(docId, 'x', 10);
    await client.setField(docId, 'y', 20);
    await client.setField(docId, 'z', 30);

    const state = await client.getDocumentState(docId);

    expect(state).toEqual({
      x: 10,
      y: 20,
      z: 30,
    });
  });

  it('should start with empty document', async () => {
    const client = await createClient();
    
    await assertDocumentEmpty(client, 'new-empty-doc');
  });

  it('should handle special characters in field names', async () => {
    const docId = generateTestId('crud');
    const client = await createClient();

    await client.setField(docId, 'field-with-dashes', 'value1');
    await client.setField(docId, 'field_with_underscores', 'value2');
    await client.setField(docId, 'field.with.dots', 'value3');

    await assertFieldValue(client, docId, 'field-with-dashes', 'value1');
    await assertFieldValue(client, docId, 'field_with_underscores', 'value2');
    await assertFieldValue(client, docId, 'field.with.dots', 'value3');
  });

  it('should handle unicode values', async () => {
    const docId = generateTestId('crud');
    const client = await createClient();

    await client.setField(docId, 'emoji', '🚀🎉✨');
    await client.setField(docId, 'chinese', '你好世界');
    await client.setField(docId, 'arabic', 'مرحبا بالعالم');

    await assertFieldValue(client, docId, 'emoji', '🚀🎉✨');
    await assertFieldValue(client, docId, 'chinese', '你好世界');
    await assertFieldValue(client, docId, 'arabic', 'مرحبا بالعالم');
  });

  it('should handle large strings', async () => {
    const docId = generateTestId('crud');
    const client = await createClient();

    const largeString = 'a'.repeat(10000);
    await client.setField(docId, 'large', largeString);

    await assertFieldValue(client, docId, 'large', largeString);
  });

  it('should handle many fields', async () => {
    const docId = generateTestId('crud');
    const client = await createClient();

    // Create 100 fields
    for (let i = 0; i < 100; i++) {
      await client.setField(docId, `field${i}`, i);
    }

    // Verify all fields exist
    const state = await client.getDocumentState(docId);
    expect(Object.keys(state).length).toBe(100);

    // Verify a few random fields
    await assertFieldValue(client, docId, 'field0', 0);
    await assertFieldValue(client, docId, 'field50', 50);
    await assertFieldValue(client, docId, 'field99', 99);
  });
});
