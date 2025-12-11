/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { provideSyncKit, useSyncKit, tryUseSyncKit, SyncKitSymbol } from '../index'
import type { SyncKit } from '../../../synckit'

describe('useSyncKit', () => {
  const mockSyncKit = {
    document: vi.fn(),
    getAwareness: vi.fn(),
    getNetworkStatus: vi.fn(),
  } as unknown as SyncKit

  it('should provide and inject SyncKit instance', () => {
    const TestComponent = defineComponent({
      setup() {
        const synckit = useSyncKit()
        return { synckit }
      },
      template: '<div>{{ synckit ? "has synckit" : "no synckit" }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    expect(wrapper.text()).toBe('has synckit')
  })

  it('should work in nested components', () => {
    const ChildComponent = defineComponent({
      setup() {
        const synckit = useSyncKit()
        return { synckit }
      },
      template: '<div>{{ synckit ? "child has synckit" : "child no synckit" }}</div>',
    })

    const ParentComponent = defineComponent({
      components: { ChildComponent },
      setup() {
        provideSyncKit(mockSyncKit)
        return {}
      },
      template: '<div><child-component /></div>',
    })

    const wrapper = mount(ParentComponent)
    expect(wrapper.text()).toContain('child has synckit')
  })

  it('should throw error when SyncKit not provided', () => {
    const TestComponent = defineComponent({
      setup() {
        useSyncKit()
        return {}
      },
      template: '<div>test</div>',
    })

    expect(() => mount(TestComponent)).toThrow('[SyncKit] useSyncKit: No SyncKit instance found')
  })

  it('should return null with tryUseSyncKit when not provided', () => {
    const TestComponent = defineComponent({
      setup() {
        const synckit = tryUseSyncKit()
        return { synckit }
      },
      template: '<div>{{ synckit ? "has" : "no" }}</div>',
    })

    const wrapper = mount(TestComponent)
    expect(wrapper.text()).toBe('no')
  })

  it('should return instance with tryUseSyncKit when provided', () => {
    const TestComponent = defineComponent({
      setup() {
        const synckit = tryUseSyncKit()
        return { synckit }
      },
      template: '<div>{{ synckit ? "has" : "no" }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    expect(wrapper.text()).toBe('has')
  })
})
