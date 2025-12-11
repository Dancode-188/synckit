/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useRichText, SyncKitSymbol } from '../index'
import type { SyncKit } from '../../../synckit'
import type { FormatRange } from '../../../crdt/richtext'

describe('useRichText', () => {
  let mockRichText: any
  let mockDoc: any
  let mockSyncKit: SyncKit
  let textSubscribers: Array<(text: string) => void>
  let formatSubscribers: Array<(ranges: FormatRange[]) => void>

  beforeEach(() => {
    textSubscribers = []
    formatSubscribers = []

    mockRichText = {
      init: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockReturnValue('Hello World'),
      toString: vi.fn().mockReturnValue('Hello World'),
      getRanges: vi.fn().mockReturnValue([
        { text: 'Hello', attributes: { bold: true } },
        { text: ' World', attributes: {} },
      ]),
      subscribe: vi.fn((callback) => {
        textSubscribers.push(callback)
        callback('Hello World')
        return vi.fn() // unsubscribe
      }),
      subscribeFormats: vi.fn((callback) => {
        formatSubscribers.push(callback)
        callback([
          { text: 'Hello', attributes: { bold: true } },
          { text: ' World', attributes: {} },
        ])
        return vi.fn() // unsubscribe
      }),
      insert: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      format: vi.fn().mockResolvedValue(undefined),
      unformat: vi.fn().mockResolvedValue(undefined),
      clearFormats: vi.fn().mockResolvedValue(undefined),
      getFormats: vi.fn().mockReturnValue({ bold: true }),
    }

    mockDoc = {
      init: vi.fn().mockResolvedValue(undefined),
      getField: vi.fn().mockReturnValue(mockRichText),
      content: mockRichText,
    }

    mockSyncKit = {
      document: vi.fn().mockReturnValue(mockDoc),
      getAwareness: vi.fn(),
      getNetworkStatus: vi.fn(),
    } as unknown as SyncKit
  })

  it('should initialize and return text content', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { text, loading } = useRichText('doc-123', 'content')
        return { text, loading }
      },
      template: '<div>{{ loading ? "loading" : text }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    expect(wrapper.text()).toBe('loading')

    await flushPromises()

    expect(mockSyncKit.document).toHaveBeenCalledWith('doc-123')
    expect(mockDoc.init).toHaveBeenCalled()
    expect(wrapper.text()).toBe('Hello World')
  })

  it('should return formatted ranges', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { ranges } = useRichText('doc-123', 'content')
        return { ranges }
      },
      template: '<div>{{ ranges.length }}</div>',
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

  it('should insert text', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { insert } = useRichText('doc-123', 'content')
        return { insert }
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
    await vm.insert(5, ' Beautiful')

    expect(mockRichText.insert).toHaveBeenCalledWith(5, ' Beautiful')
  })

  it('should delete text', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { deleteText } = useRichText('doc-123', 'content')
        return { deleteText }
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
    await vm.deleteText(0, 5)

    expect(mockRichText.delete).toHaveBeenCalledWith(0, 5)
  })

  it('should apply formatting', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { format } = useRichText('doc-123', 'content')
        return { format }
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
    await vm.format(0, 5, { bold: true })

    expect(mockRichText.format).toHaveBeenCalledWith(0, 5, { bold: true })
  })

  it('should remove formatting', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { unformat } = useRichText('doc-123', 'content')
        return { unformat }
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
    await vm.unformat(0, 5, { bold: true })

    expect(mockRichText.unformat).toHaveBeenCalledWith(0, 5, { bold: true })
  })

  it('should clear all formats', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { clearFormats } = useRichText('doc-123', 'content')
        return { clearFormats }
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
    await vm.clearFormats(0, 11)

    expect(mockRichText.clearFormats).toHaveBeenCalledWith(0, 11)
  })

  it('should get formats at position', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { getFormats } = useRichText('doc-123', 'content')
        return { getFormats }
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
    const formats = vm.getFormats(2)

    expect(mockRichText.getFormats).toHaveBeenCalledWith(2)
    expect(formats).toEqual({ bold: true })
  })

  it('should provide length and isEmpty', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { length, isEmpty } = useRichText('doc-123', 'content')
        return { length, isEmpty }
      },
      template: '<div>{{ length }} - {{ isEmpty }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toBe('11 - false')
  })

  it('should handle empty text', async () => {
    mockRichText.get = vi.fn().mockReturnValue('')
    mockRichText.toString = vi.fn().mockReturnValue('')
    mockRichText.subscribe = vi.fn((callback) => {
      callback('')
      return vi.fn()
    })

    const TestComponent = defineComponent({
      setup() {
        const { isEmpty } = useRichText('doc-123', 'content')
        return { isEmpty }
      },
      template: '<div>{{ isEmpty ? "empty" : "not empty" }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toBe('empty')
  })

  it('should update reactively on text changes', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { text } = useRichText('doc-123', 'content')
        return { text }
      },
      template: '<div>{{ text }}</div>',
    })

    const wrapper = mount(TestComponent, {
      global: {
        provide: {
          [SyncKitSymbol as symbol]: mockSyncKit,
        },
      },
    })

    await flushPromises()
    expect(wrapper.text()).toBe('Hello World')

    // Simulate text change
    textSubscribers.forEach((cb) => cb('Hello Beautiful World'))
    await flushPromises()

    expect(wrapper.text()).toBe('Hello Beautiful World')
  })

  it('should update reactively on format changes', async () => {
    const TestComponent = defineComponent({
      setup() {
        const { ranges } = useRichText('doc-123', 'content')
        return { ranges }
      },
      template: '<div>{{ ranges.length }}</div>',
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

    // Simulate format change
    formatSubscribers.forEach((cb) =>
      cb([
        { text: 'Hello', attributes: { bold: true } },
        { text: ' ', attributes: {} },
        { text: 'World', attributes: { italic: true } },
      ])
    )
    await flushPromises()

    expect(wrapper.text()).toBe('3')
  })

  it('should handle errors gracefully', async () => {
    mockDoc.init = vi.fn().mockRejectedValue(new Error('Init failed'))

    const TestComponent = defineComponent({
      setup() {
        const { error } = useRichText('doc-123', 'content')
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
