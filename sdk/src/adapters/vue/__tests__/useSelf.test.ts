/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useSelf, SyncKitSymbol } from '../index'
import type { SyncKit } from '../../../synckit'
import type { AwarenessState } from '../../../awareness'

describe('useSelf', () => {
  let mockAwareness: any
  let mockSyncKit: SyncKit
  let subscribers: Array<() => void>
  let localClientId: string
  let states: Map<string, AwarenessState>

  beforeEach(() => {
    subscribers = []
    localClientId = '1'
    states = new Map<string, AwarenessState>()

    // Set initial state
    states.set('1', {
      client_id: '1',
      state: { user: { name: 'Alice', color: '#FF0000' } },
      clock: 1,
    })
    states.set('2', {
      client_id: '2',
      state: { user: { name: 'Bob', color: '#00FF00' } },
      clock: 1,
    })

    mockAwareness = {
      init: vi.fn().mockResolvedValue(undefined),
      getClientId: vi.fn(() => localClientId),
      getStates: vi.fn(() => states),
      setLocalState: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn((callback) => {
        subscribers.push(callback)
        callback() // Call immediately
        return vi.fn() // unsubscribe
      }),
      createLeaveUpdate: vi.fn(() => new Uint8Array()),
      applyUpdate: vi.fn(),
    }

    mockSyncKit = {
      document: vi.fn(),
      getAwareness: vi.fn().mockReturnValue(mockAwareness),
      getNetworkStatus: vi.fn(),
    } as unknown as SyncKit
  })

  it('should return only self state', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { self } = useSelf('doc-123')
        return { self }
      },
      template: '<div>{{ self?.state.user?.name }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toBe('Alice')
  })

  it('should update self state', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { self, updatePresence } = useSelf('doc-123')
        return { self, updatePresence }
      },
      template: '<div>{{ self?.state.user?.name }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    const vm = wrapper.vm as any
    await vm.updatePresence({ user: { name: 'Alice Updated', color: '#FF0000' } })

    expect(mockAwareness.setLocalState).toHaveBeenCalledWith({
      user: { name: 'Alice Updated', color: '#FF0000' },
    })
  })

  it('should set individual field', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { setField } = useSelf('doc-123')
        return { setField }
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

    const vm = wrapper.vm as any
    await vm.setField('cursor', { x: 100, y: 200 })

    expect(mockAwareness.setLocalState).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { x: 100, y: 200 },
      })
    )
  })

  it('should set initial state', async () => {
    const initialState = { user: { name: 'Test User', color: '#123456' } }

    const TestComponent = defineComponent({
      setup() {
        useSelf('doc-123', { initialState })
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

    expect(mockAwareness.setLocalState).toHaveBeenCalledWith(initialState)
  })

  it('should update reactively when self changes', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { self } = useSelf('doc-123')
        return { self }
      },
      template: '<div>{{ self?.state.cursor?.x || "no-cursor" }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()
    expect(wrapper.text()).toBe('no-cursor')

    // Update self state
    states.set('1', {
      client_id: '1',
      state: {
        user: { name: 'Alice', color: '#FF0000' },
        cursor: { x: 150, y: 250 },
      },
      clock: 2,
    })

    // Trigger update
    subscribers.forEach((cb) => cb())
    await flushPromises()

    expect(wrapper.text()).toBe('150')
  })

  it('should not include other users data', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { self } = useSelf('doc-123')
        return { self }
      },
      template: '<div>{{ self?.client_id }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    // Should only have self (client_id 1)
    expect(wrapper.text()).toBe('1')
  })

  it('should handle undefined self state', async () => {
    // Remove self from states
    states.delete('1')

    const TestComponent = defineComponent({
      setup() {
        const { self } = useSelf('doc-123')
        return { self }
      },
      template: '<div>{{ self ? "has-self" : "no-self" }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toBe('no-self')
  })

  it('should preserve user state when setting field', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { setField } = useSelf('doc-123')
        return { setField }
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

    const vm = wrapper.vm as any
    await vm.setField('status', 'typing')

    // Should preserve existing user state
    expect(mockAwareness.setLocalState).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { name: 'Alice', color: '#FF0000' },
        status: 'typing',
      })
    )
  })
})
