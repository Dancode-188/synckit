/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useNetworkStatus, SyncKitSymbol } from '../index'
import type { SyncKit } from '../../../synckit'
import type { NetworkStatus } from '../../../types'

describe('useNetworkStatus', () => {
  let mockSyncKit: SyncKit
  let statusSubscribers: Array<(status: NetworkStatus) => void>
  let initialStatus: NetworkStatus

  beforeEach(() => {
    statusSubscribers = []
    initialStatus = {
      networkState: 'online',
      connectionState: 'connected',
      queueSize: 0,
      failedOperations: 0,
      oldestOperation: null,
    }

    mockSyncKit = {
      document: vi.fn(),
      getAwareness: vi.fn(),
      getNetworkStatus: vi.fn().mockReturnValue(initialStatus),
      onNetworkStatusChange: vi.fn((callback) => {
        statusSubscribers.push(callback)
        return vi.fn() // unsubscribe
      }),
    } as unknown as SyncKit
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it('should initialize and return network status', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { status } = useNetworkStatus()
        return { status }
      },
      template: '<div>{{ status?.connectionState }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    expect(mockSyncKit.getNetworkStatus).toHaveBeenCalled()
    expect(wrapper.text()).toBe('connected')
  })

  it('should provide computed connection state', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { connected } = useNetworkStatus()
        return { connected }
      },
      template: '<div>{{ connected ? "online" : "offline" }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toBe('online')
  })

  it('should update when status changes', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { status } = useNetworkStatus()
        return { status }
      },
      template: '<div>{{ status?.connectionState }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()
    expect(wrapper.text()).toBe('connected')

    // Simulate status change
    const newStatus: NetworkStatus = {
      networkState: 'online',
      connectionState: 'disconnected',
      queueSize: 0,
      failedOperations: 0,
      oldestOperation: null,
    }
    statusSubscribers.forEach((cb) => cb(newStatus))
    await flushPromises()

    expect(wrapper.text()).toBe('disconnected')
  })

  it('should handle null status (offline mode)', async () => {
    mockSyncKit.getNetworkStatus = vi.fn().mockReturnValue(null)

    const TestComponent = defineComponent({
      setup() {
        const { status, connected } = useNetworkStatus()
        return { status, connected }
      },
      template: '<div>{{ status === null ? "offline-mode" : status.connectionState }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toBe('offline-mode')
  })

  it('should provide refresh method', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { refresh } = useNetworkStatus()
        return { refresh }
      },
      template: '<div>test</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    const callCount = (mockSyncKit.getNetworkStatus as any).mock.calls.length

    const vm = wrapper.vm as any
    vm.refresh()

    expect((mockSyncKit.getNetworkStatus as any).mock.calls.length).toBe(callCount + 1)
  })

  it('should support polling with pollInterval', async () => {
    vi.useFakeTimers()

    const TestComponent = defineComponent({
      setup() {
        useNetworkStatus({ pollInterval: 1000 })
        return {}
      },
      template: '<div>test</div>',
    })

    mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    const initialCallCount = (mockSyncKit.getNetworkStatus as any).mock.calls.length

    // Advance time by 1 second
    vi.advanceTimersByTime(1000)
    await flushPromises()

    expect((mockSyncKit.getNetworkStatus as any).mock.calls.length).toBeGreaterThan(
      initialCallCount
    )

    // Advance time by another 2 seconds
    vi.advanceTimersByTime(2000)
    await flushPromises()

    expect((mockSyncKit.getNetworkStatus as any).mock.calls.length).toBeGreaterThan(
      initialCallCount + 1
    )

    vi.useRealTimers()
  })

  it('should provide peerCount', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { peerCount } = useNetworkStatus()
        return { peerCount }
      },
      template: '<div>{{ peerCount }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    // Currently returns 0 as per implementation
    expect(wrapper.text()).toBe('0')
  })
})
