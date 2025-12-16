import { test, expect } from '@playwright/test'
import { openTabs, closeTabs } from './test-helpers'

test.describe('Selection Sharing Integration', () => {
  test('serializes and deserializes text selection', async ({ browser }) => {
    const tabs = await openTabs(browser, 1)

    try {
      await new Promise(resolve => setTimeout(resolve, 1000))

      const tab = tabs[0]
      if (!tab) {
        console.warn('Tab not opened - skipping test')
        return
      }

      // Create contenteditable element and select text
      const result = await tab.page.evaluate(() => {
        // Create editor
        const div = document.createElement('div')
        div.id = 'test-editor'
        div.contentEditable = 'true'
        div.textContent = 'Hello World! This is a test.'
        document.body.appendChild(div)

        // Select "World"
        const range = document.createRange()
        const textNode = div.firstChild!
        range.setStart(textNode, 6)  // After "Hello "
        range.setEnd(textNode, 11)   // "World"

        const sel = window.getSelection()!
        sel.removeAllRanges()
        sel.addRange(range)

        // Get selection utilities from window object (exposed by test harness)
        const { getSerializedSelectionFromDOM, deserializeRange } =
          (window as any).__synckit_selection

        // Serialize selection
        const serialized = getSerializedSelectionFromDOM()

        if (!serialized) {
          return { success: false, error: 'Failed to serialize selection' }
        }

        // Deserialize to visual
        const visual = deserializeRange(serialized, 'viewport')

        if (!visual) {
          return { success: false, error: 'Failed to deserialize selection' }
        }

        return {
          success: true,
          serialized,
          visual,
          selectedText: sel.toString()
        }
      })

      expect(result.success).toBe(true)
      expect(result.selectedText).toBe('World')
      expect(result.serialized).toBeDefined()
      expect(result.serialized.startXPath).toBeDefined()
      expect(result.serialized.endXPath).toBeDefined()
      expect(result.visual).toBeDefined()
      expect(result.visual.rects.length).toBeGreaterThan(0)
    } finally {
      await closeTabs(tabs)
    }
  })

  test('handles empty selection correctly', async ({ browser }) => {
    const tabs = await openTabs(browser, 1)

    try {
      await new Promise(resolve => setTimeout(resolve, 1000))

      const tab = tabs[0]
      if (!tab) {
        console.warn('Tab not opened - skipping test')
        return
      }

      const result = await tab.page.evaluate(() => {
        // Create editor
        const div = document.createElement('div')
        div.id = 'test-editor'
        div.contentEditable = 'true'
        div.textContent = 'Some text here'
        document.body.appendChild(div)

        // Don't select anything (or create collapsed selection)
        const range = document.createRange()
        const textNode = div.firstChild!
        range.setStart(textNode, 5)
        range.setEnd(textNode, 5) // Collapsed

        const sel = window.getSelection()!
        sel.removeAllRanges()
        sel.addRange(range)

        const { getSerializedSelectionFromDOM } =
          (window as any).__synckit_selection

        const serialized = getSerializedSelectionFromDOM()

        return {
          serialized,
          isEmpty: serialized === null
        }
      })

      // Collapsed selection should return null
      expect(result.isEmpty).toBe(true)
      expect(result.serialized).toBeNull()
    } finally {
      await closeTabs(tabs)
    }
  })

  test('handles cross-element selection', async ({ browser }) => {
    const tabs = await openTabs(browser, 1)

    try {
      await new Promise(resolve => setTimeout(resolve, 1000))

      const tab = tabs[0]
      if (!tab) {
        console.warn('Tab not opened - skipping test')
        return
      }

      const result = await tab.page.evaluate(() => {
        // Create multiple paragraphs
        const container = document.createElement('div')
        container.innerHTML = `
          <p id="p1">First paragraph</p>
          <p id="p2">Second paragraph</p>
        `
        document.body.appendChild(container)

        const p1 = document.getElementById('p1')!
        const p2 = document.getElementById('p2')!

        // Select from middle of p1 to middle of p2
        const range = document.createRange()
        range.setStart(p1.firstChild!, 6)  // "paragraph"
        range.setEnd(p2.firstChild!, 6)    // "Second"

        const sel = window.getSelection()!
        sel.removeAllRanges()
        sel.addRange(range)

        const { getSerializedSelectionFromDOM, deserializeRange } =
          (window as any).__synckit_selection

        const serialized = getSerializedSelectionFromDOM()
        const visual = serialized ? deserializeRange(serialized, 'viewport') : null

        return {
          success: serialized !== null && visual !== null,
          selectedText: sel.toString(),
          hasMultipleRects: visual ? visual.rects.length > 1 : false
        }
      })

      expect(result.success).toBe(true)
      expect(result.selectedText).toContain('paragraph')
      expect(result.selectedText).toContain('Second')
    } finally {
      await closeTabs(tabs)
    }
  })

  test('selection bounds calculation works correctly', async ({ browser }) => {
    const tabs = await openTabs(browser, 1)

    try {
      await new Promise(resolve => setTimeout(resolve, 1000))

      const tab = tabs[0]
      if (!tab) {
        console.warn('Tab not opened - skipping test')
        return
      }

      const result = await tab.page.evaluate(() => {
        const div = document.createElement('div')
        div.id = 'test-editor'
        div.contentEditable = 'true'
        div.textContent = 'Selection bounds test'
        document.body.appendChild(div)

        const range = document.createRange()
        const textNode = div.firstChild!
        range.setStart(textNode, 0)
        range.setEnd(textNode, 9) // "Selection"

        const sel = window.getSelection()!
        sel.removeAllRanges()
        sel.addRange(range)

        const { getSelectionFromDOM, getSelectionBounds } =
          (window as any).__synckit_selection

        const selection = getSelectionFromDOM('viewport')
        const bounds = selection ? getSelectionBounds(selection) : null

        return {
          success: bounds !== null,
          bounds,
          hasValidDimensions: bounds ?
            bounds.width > 0 && bounds.height > 0 : false
        }
      })

      expect(result.success).toBe(true)
      expect(result.hasValidDimensions).toBe(true)
      expect(result.bounds.left).toBeGreaterThanOrEqual(0)
      expect(result.bounds.top).toBeGreaterThanOrEqual(0)
      expect(result.bounds.width).toBeGreaterThan(0)
      expect(result.bounds.height).toBeGreaterThan(0)
    } finally {
      await closeTabs(tabs)
    }
  })
})
