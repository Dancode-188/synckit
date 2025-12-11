/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { usePresence, SyncKitSymbol } from '../index'
import type { SyncKit } from '../../../synckit'
import type { AwarenessState } from '../../../awareness'

describe('usePresence', () => {
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

  it('should initialize and return self and others', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { self, others } = usePresence('doc-123')
        return { self, others }
      },
      template: '<div>{{ self?.state.user?.name }} - {{ others.length }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    expect(mockSyncKit.getAwareness).toHaveBeenCalledWith('doc-123')
    expect(mockAwareness.init).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.text()).toContain('1')
  })

  it('should update presence reactively', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { others } = usePresence('doc-123')
        return { others }
      },
      template: '<div>{{ others.length }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()
    expect(wrapper.text()).toBe('1')

    // Add a new user
    states.set('3', {
      client_id: '3',
      state: { user: { name: 'Charlie', color: '#0000FF' } },
      clock: 1,
    })

    // Trigger update
    subscribers.forEach((cb) => cb())
    await flushPromises()

    expect(wrapper.text()).toBe('2')
  })

  it('should provide computed counts', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { otherCount, totalCount } = usePresence('doc-123')
        return { otherCount, totalCount }
      },
      template: '<div>{{ otherCount }} / {{ totalCount }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toBe('1 / 2')
  })

  it('should update presence state', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { updatePresence } = usePresence('doc-123')
        return { updatePresence }
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
    await vm.updatePresence({ cursor: { x: 100, y: 200 } })

    expect(mockAwareness.setLocalState).toHaveBeenCalledWith({
      cursor: { x: 100, y: 200 },
    })
  })

  it('should set individual fields', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { setField } = usePresence('doc-123')
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
    await vm.setField('cursor', { x: 50, y: 75 })

    expect(mockAwareness.setLocalState).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { x: 50, y: 75 },
      })
    )
  })

  it('should handle leave', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { leave } = usePresence('doc-123')
        return { leave }
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
    vm.leave()

    expect(mockAwareness.createLeaveUpdate).toHaveBeenCalled()
    expect(mockAwareness.applyUpdate).toHaveBeenCalled()
  })

  it('should set initial state', async () => {
    const initialState = { user: { name: 'Test', color: '#123456' } }

    const TestComponent = defineComponent({
      setup() {
        usePresence('doc-123', { initialState })
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

  it('should provide all users array', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { all } = usePresence('doc-123')
        return { all }
      },
      template: '<div>{{ all.length }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toBe('2')
  })
})
