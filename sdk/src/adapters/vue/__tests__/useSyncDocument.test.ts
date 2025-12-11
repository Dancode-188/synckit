/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useSyncDocument, SyncKitSymbol } from '../index'
import type { SyncKit } from '../../../synckit'

describe('useSyncDocument', () => {
  let mockDoc: any
  let mockSyncKit: SyncKit
  let subscribers: Array<(data: any) => void>

  beforeEach(() => {
    subscribers = []

    mockDoc = {
      init: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockReturnValue({ name: 'Alice', age: 30 }),
      set: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn((callback) => {
        subscribers.push(callback)
        callback({ name: 'Alice', age: 30 })
        return vi.fn() // unsubscribe
      }),
    }

    mockSyncKit = {
      document: vi.fn().mockReturnValue(mockDoc),
      getAwareness: vi.fn(),
      getNetworkStatus: vi.fn(),
    } as unknown as SyncKit
  })

  it('should initialize and return document data', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { data } = useSyncDocument('doc-123')
        return { data }
      },
      template: '<div>{{ data.name }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    expect(mockSyncKit.document).toHaveBeenCalledWith('doc-123')
    expect(mockDoc.init).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Alice')
  })

  it('should update document data reactively', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { data } = useSyncDocument('doc-123')
        return { data }
      },
      template: '<div>{{ data.name }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()
    expect(wrapper.text()).toContain('Alice')

    // Simulate document update
    subscribers.forEach((cb) => cb({ name: 'Bob', age: 25 }))
    await flushPromises()

    expect(wrapper.text()).toContain('Bob')
  })

  it('should handle loading state', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { loading } = useSyncDocument('doc-123')
        return { loading }
      },
      template: '<div>{{ loading ? "loading" : "loaded" }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    // Initially loading
    expect(wrapper.text()).toBe('loading')

    await flushPromises()

    // After init, not loading
    expect(wrapper.text()).toBe('loaded')
  })

  it('should handle errors gracefully', async () => {
    const errorDoc = {
      ...mockDoc,
      init: vi.fn().mockRejectedValue(new Error('Init failed')),
    }

    mockSyncKit.document = vi.fn().mockReturnValue(errorDoc)

    const TestComponent = defineComponent({
      setup() {
        const { error } = useSyncDocument('doc-123')
        return { error }
      },
      template: '<div>{{ error ? error.message : "no error" }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Init failed')
  })
})
