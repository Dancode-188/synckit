/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useOthers, SyncKitSymbol } from '../index'
import type { SyncKit } from '../../../synckit'
import type { AwarenessState } from '../../../awareness'

describe('useOthers', () => {
  let mockAwareness: any
  let mockSyncKit: SyncKit
  let subscribers: Array<() => void>
  let localClientId: string
  let states: Map<string, AwarenessState>

  beforeEach(() => {
    subscribers = []
    localClientId = '1'
    states = new Map<string, AwarenessState>()

    // Set initial state with self and others
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
    states.set('3', {
      client_id: '3',
      state: { user: { name: 'Charlie', color: '#0000FF' } },
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

  it('should return only other users (excluding self)', async () => {
    const TestComponent = defineComponent({
      setup() {
        const others = useOthers('doc-123')
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

    // Should have 2 others (Bob and Charlie), excluding self (Alice)
    expect(wrapper.text()).toBe('2')
  })

  it('should update reactively when others change', async () => {
    const TestComponent = defineComponent({
      setup() {
        const others = useOthers('doc-123')
        return { others }
      },
      template: '<div>{{ others.map(o => o.state.user.name).join(", ") }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()
    expect(wrapper.text()).toBe('Bob, Charlie')

    // Add a new user
    states.set('4', {
      client_id: '4',
      state: { user: { name: 'David', color: '#FFFF00' } },
      clock: 1,
    })

    // Trigger update
    subscribers.forEach((cb) => cb())
    await flushPromises()

    expect(wrapper.text()).toBe('Bob, Charlie, David')
  })

  it('should handle when only self is present', async () => {
    // Remove others
    states.delete('2')
    states.delete('3')

    const TestComponent = defineComponent({
      setup() {
        const others = useOthers('doc-123')
        return { others }
      },
      template: '<div>{{ others.length === 0 ? "alone" : others.length }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toBe('alone')
  })

  it('should filter out self correctly', async () => {
    const TestComponent = defineComponent({
      setup() {
        const others = useOthers('doc-123')
        return { others }
      },
      template: '<div>{{ others.some(o => o.client_id === "1") ? "has-self" : "no-self" }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    // Should not include self (client_id 1)
    expect(wrapper.text()).toBe('no-self')
  })

  it('should provide access to other users state', async () => {
    const TestComponent = defineComponent({
      setup() {
        const others = useOthers('doc-123')
        return { others }
      },
      template: `
        <div>
          <span v-for="user in others" :key="user.client_id">
            {{ user.state.user.name }}:{{ user.state.user.color }}
          </span>
        </div>
      `,
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Bob:#00FF00')
    expect(wrapper.text()).toContain('Charlie:#0000FF')
    expect(wrapper.text()).not.toContain('Alice')
  })
})
