/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useSyncField, SyncKitSymbol } from '../index'
import type { SyncKit } from '../../../synckit'

interface TestData extends Record<string, unknown> {
  name: string
  age: number
  email: string
}

describe('useSyncField', () => {
  let mockDoc: any
  let mockSyncKit: SyncKit
  let subscribers: Array<(data: any) => void>

  beforeEach(() => {
    subscribers = []

    mockDoc = {
      init: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockReturnValue({ name: 'Alice', age: 30, email: 'alice@example.com' }),
      set: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn((callback) => {
        subscribers.push(callback)
        callback({ name: 'Alice', age: 30, email: 'alice@example.com' })
        return vi.fn() // unsubscribe
      }),
    }

    mockSyncKit = {
      document: vi.fn().mockReturnValue(mockDoc),
      getAwareness: vi.fn(),
      getNetworkStatus: vi.fn(),
    } as unknown as SyncKit
  })

  it('should initialize and return field value', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { value } = useSyncField<TestData, 'name'>('doc-123', 'name')
        return { value }
      },
      template: '<div>{{ value }}</div>',
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

  it('should update reactively when field changes', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { value } = useSyncField<TestData, 'name'>('doc-123', 'name')
        return { value }
      },
      template: '<div>{{ value }}</div>',
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
    subscribers.forEach((cb) =>
      cb({ name: 'Charlie', age: 30, email: 'charlie@example.com' })
    )
    await flushPromises()

    expect(wrapper.text()).toContain('Charlie')
  })

  it('should handle loading state', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { loading } = useSyncField<TestData, 'name'>('doc-123', 'name')
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

  it('should handle undefined field values', async () => {
    mockDoc.get = vi.fn().mockReturnValue({ age: 30 })
    mockDoc.subscribe = vi.fn((callback) => {
      callback({ age: 30 })
      return vi.fn()
    })

    const TestComponent = defineComponent({
      setup() {
        const { value } = useSyncField<TestData, 'name'>('doc-123', 'name')
        return { value }
      },
      template: '<div>{{ value || "undefined" }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('undefined')
  })
})
