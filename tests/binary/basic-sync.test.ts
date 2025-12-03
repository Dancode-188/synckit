/**
 * Binary Protocol - Basic Sync Tests
 *
 * First integration tests using binary protocol.
 * Tests the same scenarios as JSON protocol tests but with BinaryAdapter.
 *
 * This proves that:
 * 1. BinaryAdapter correctly encodes messages
 * 2. Server correctly parses binary messages
 * 3. Server correctly sends binary responses
 * 4. BinaryAdapter correctly decodes server responses
 * 5. End-to-end binary protocol works
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { setupTestServer, teardownTestServer } from '../integration/helpers/test-server'
import { TestClient } from '../integration/helpers/test-client'
import { BinaryAdapter } from '../integration/helpers/binary-adapter'
import { TEST_CONFIG, generateTestId, sleep } from '../integration/config'

describe('Binary Protocol - Basic Sync', () => {
  beforeAll(async () => {
    await setupTestServer()
  })

  afterAll(async () => {
    await teardownTestServer()
  })

  /**
   * Factory function to create test client with binary protocol
   */
  const createBinaryClient = (config = {}) => {
    return new TestClient({
      ...config,
      adapter: new BinaryAdapter(),
    })
  }

  test('should connect with binary protocol', async () => {
    const client = createBinaryClient()

    await client.init()
    await client.connect()

    expect(client.isConnected).toBe(true)

    await client.cleanup()
  })

  test('should sync single field between two clients', async () => {
    const clientA = createBinaryClient()
    const clientB = createBinaryClient()

    await clientA.init()
    await clientB.init()
    await clientA.connect()
    await clientB.connect()

    const docId = generateTestId('doc')

    // Client A sets a field
    await clientA.setField(docId, 'title', 'Binary Protocol Test')

    // Client B should receive the update
    await clientB.waitForField(docId, 'title', 'Binary Protocol Test', 5000)

    // Verify both clients have the same state
    const stateA = await clientA.getDocumentState(docId)
    const stateB = await clientB.getDocumentState(docId)

    expect(stateA.title).toBe('Binary Protocol Test')
    expect(stateB.title).toBe('Binary Protocol Test')

    await clientA.cleanup()
    await clientB.cleanup()
  })

  test('should handle multiple field updates', async () => {
    const clientA = createBinaryClient()
    const clientB = createBinaryClient()

    await clientA.init()
    await clientB.init()
    await clientA.connect()
    await clientB.connect()

    const docId = generateTestId('doc')

    // Client A sets multiple fields
    await clientA.setField(docId, 'title', 'Test Document')
    await clientA.setField(docId, 'content', 'This is test content')
    await clientA.setField(docId, 'status', 'draft')

    // Client B should receive all updates
    await clientB.waitForState(
      docId,
      {
        title: 'Test Document',
        content: 'This is test content',
        status: 'draft',
      },
      5000
    )

    const stateB = await clientB.getDocumentState(docId)
    expect(stateB).toEqual({
      title: 'Test Document',
      content: 'This is test content',
      status: 'draft',
    })

    await clientA.cleanup()
    await clientB.cleanup()
  })

  test('should handle bidirectional sync', async () => {
    const clientA = createBinaryClient()
    const clientB = createBinaryClient()

    await clientA.init()
    await clientB.init()
    await clientA.connect()
    await clientB.connect()

    const docId = generateTestId('doc')

    // Client A sets field
    await clientA.setField(docId, 'field1', 'from-A')

    // Client B should receive it
    await clientB.waitForField(docId, 'field1', 'from-A', 5000)

    // Client B sets different field
    await clientB.setField(docId, 'field2', 'from-B')

    // Client A should receive it
    await clientA.waitForField(docId, 'field2', 'from-B', 5000)

    // Both clients should have both fields
    const stateA = await clientA.getDocumentState(docId)
    const stateB = await clientB.getDocumentState(docId)

    expect(stateA).toEqual({
      field1: 'from-A',
      field2: 'from-B',
    })
    expect(stateB).toEqual({
      field1: 'from-A',
      field2: 'from-B',
    })

    await clientA.cleanup()
    await clientB.cleanup()
  })

  test('should handle delete operations', async () => {
    const clientA = createBinaryClient()
    const clientB = createBinaryClient()

    await clientA.init()
    await clientB.init()
    await clientA.connect()
    await clientB.connect()

    const docId = generateTestId('doc')

    // Client A sets fields
    await clientA.setField(docId, 'field1', 'value1')
    await clientA.setField(docId, 'field2', 'value2')

    // Wait for Client B to sync
    await clientB.waitForState(
      docId,
      {
        field1: 'value1',
        field2: 'value2',
      },
      5000
    )

    // Client A deletes field1
    await clientA.deleteField(docId, 'field1')

    // Give time for delete to propagate
    await sleep(500)

    // Client B should reflect the deletion
    const stateB = await clientB.getDocumentState(docId)
    expect(stateB.field1).toBeUndefined()
    expect(stateB.field2).toBe('value2')

    await clientA.cleanup()
    await clientB.cleanup()
  })

  test('should handle multiple clients syncing', async () => {
    const clients = [
      createBinaryClient(),
      createBinaryClient(),
      createBinaryClient(),
    ]

    // Initialize and connect all clients
    for (const client of clients) {
      await client.init()
      await client.connect()
    }

    const docId = generateTestId('doc')

    // Client 0 sets field
    await clients[0].setField(docId, 'author', 'client-0')

    // All other clients should receive it
    for (let i = 1; i < clients.length; i++) {
      await clients[i].waitForField(docId, 'author', 'client-0', 5000)
    }

    // Each client sets its own field
    for (let i = 0; i < clients.length; i++) {
      await clients[i].setField(docId, `field${i}`, `value${i}`)
    }

    // All clients should eventually have all fields
    const expectedState: any = { author: 'client-0' }
    for (let i = 0; i < clients.length; i++) {
      expectedState[`field${i}`] = `value${i}`
    }

    for (const client of clients) {
      await client.waitForState(docId, expectedState, 5000)
    }

    // Cleanup
    for (const client of clients) {
      await client.cleanup()
    }
  })

  test('should handle reconnection with binary protocol', async () => {
    const client = createBinaryClient()

    await client.init()
    await client.connect()

    const docId = generateTestId('doc')

    // Set field before disconnect
    await client.setField(docId, 'before', 'disconnect')

    // Disconnect
    await client.disconnect()
    expect(client.isConnected).toBe(false)

    // Reconnect
    await client.connect()
    expect(client.isConnected).toBe(true)

    // Set field after reconnect
    await client.setField(docId, 'after', 'reconnect')

    // Verify both fields exist
    const state = await client.getDocumentState(docId)
    expect(state.before).toBe('disconnect')
    expect(state.after).toBe('reconnect')

    await client.cleanup()
  })
})
