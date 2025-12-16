import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getSelectionFromDOM,
  serializeRange,
  deserializeToRange,
  deserializeRange,
  getSerializedSelectionFromDOM,
  isSelectionEmpty,
  getSelectionBounds,
  selectionsOverlap
} from '../../cursor/selection'
import type { SelectionRange, SerializedRange } from '../../cursor/types'

describe('Selection Utilities', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    // Create test container with realistic content
    container = document.createElement('div')
    container.innerHTML = `
      <p id="p1">Hello World</p>
      <p id="p2">This is a test paragraph</p>
      <p id="p3">Multiple lines of text</p>
    `
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
    window.getSelection()?.removeAllRanges()
  })

  describe('getSelectionFromDOM', () => {
    it('returns null when no selection', () => {
      const selection = getSelectionFromDOM('viewport')
      expect(selection).toBeNull()
    })

    it('returns null when selection is collapsed (cursor only)', () => {
      // Create collapsed selection (cursor position, no text selected)
      const range = document.createRange()
      const p1 = document.getElementById('p1')!
      range.setStart(p1.firstChild!, 5)
      range.setEnd(p1.firstChild!, 5) // Same position = collapsed

      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)

      const selection = getSelectionFromDOM('viewport')
      expect(selection).toBeNull()
    })

    it.skip('captures selection rectangles in viewport mode', () => {
      // Select "World" in paragraph 1
      const range = document.createRange()
      const p1 = document.getElementById('p1')!
      range.setStart(p1.firstChild!, 6) // After "Hello "
      range.setEnd(p1.firstChild!, 11)  // "World"

      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)

      const selection = getSelectionFromDOM('viewport')

      expect(selection).not.toBeNull()
      if (selection) {
        expect(selection.rects.length).toBeGreaterThan(0)
        expect(selection.rects[0]?.width).toBeGreaterThan(0)
        expect(selection.rects[0]?.height).toBeGreaterThan(0)
        expect(selection.timestamp).toBeDefined()
      }
    })

    it.skip('filters out zero-width rectangles', () => {
      // Select single character (less likely to produce zero-width rects)
      const range = document.createRange()
      const p1 = document.getElementById('p1')!
      range.setStart(p1.firstChild!, 0)
      range.setEnd(p1.firstChild!, 1)

      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)

      const selection = getSelectionFromDOM('viewport')

      // All rectangles should have positive width and height
      selection?.rects.forEach(rect => {
        expect(rect.width).toBeGreaterThan(0)
        expect(rect.height).toBeGreaterThan(0)
      })
    })
  })

  describe('serializeRange and deserializeToRange', () => {
    it('serializes a simple range to XPath format', () => {
      const range = document.createRange()
      const p1 = document.getElementById('p1')!
      range.setStart(p1.firstChild!, 0)
      range.setEnd(p1.firstChild!, 5) // "Hello"

      const serialized = serializeRange(range)

      expect(serialized).not.toBeNull()
      expect(serialized!.startXPath).toContain('p1')
      expect(serialized!.startOffset).toBe(0)
      expect(serialized!.endXPath).toContain('p1')
      expect(serialized!.endOffset).toBe(5)
      expect(serialized!.timestamp).toBeDefined()
    })

    it('deserializes XPath format back to DOM Range', () => {
      // First, get a valid XPath by serializing
      const originalRange = document.createRange()
      const p1 = document.getElementById('p1')!
      originalRange.setStart(p1.firstChild!, 0)
      originalRange.setEnd(p1.firstChild!, 5)

      const serialized = serializeRange(originalRange)
      expect(serialized).not.toBeNull()

      // Now deserialize it
      const range = deserializeToRange(serialized!)

      expect(range).not.toBeNull()
      expect(range!.toString()).toBe('Hello')
    })

    it('round-trips serialize -> deserialize correctly', () => {
      const originalRange = document.createRange()
      const p2 = document.getElementById('p2')!
      originalRange.setStart(p2.firstChild!, 8) // After "This is "
      originalRange.setEnd(p2.firstChild!, 12) // "a te"

      const originalText = originalRange.toString()

      // Serialize
      const serialized = serializeRange(originalRange)
      expect(serialized).not.toBeNull()

      // Deserialize
      const restoredRange = deserializeToRange(serialized!)
      expect(restoredRange).not.toBeNull()

      // Should select same text
      expect(restoredRange!.toString()).toBe(originalText)
    })

    it('handles cross-element selections', () => {
      const range = document.createRange()
      const p1 = document.getElementById('p1')!
      const p2 = document.getElementById('p2')!

      // Select from middle of p1 to middle of p2
      range.setStart(p1.firstChild!, 6) // "World"
      range.setEnd(p2.firstChild!, 4)   // "This"

      const serialized = serializeRange(range)
      expect(serialized).not.toBeNull()

      const restored = deserializeToRange(serialized!)
      expect(restored).not.toBeNull()

      // Text should include parts of both paragraphs
      const text = restored!.toString()
      expect(text).toContain('World')
      expect(text).toContain('This')
    })
  })

  describe('deserializeRange (visual)', () => {
    it.skip('converts serialized range to visual SelectionRange', () => {
      // First create and serialize a range
      const originalRange = document.createRange()
      const p1 = document.getElementById('p1')!
      originalRange.setStart(p1.firstChild!, 0)
      originalRange.setEnd(p1.firstChild!, 5)

      const serialized = serializeRange(originalRange)
      expect(serialized).not.toBeNull()

      // Now convert to visual
      const visual = deserializeRange(serialized!, 'viewport')

      expect(visual).not.toBeNull()
      if (visual) {
        expect(visual.rects.length).toBeGreaterThan(0)
        expect(visual.rects[0]?.x).toBeGreaterThanOrEqual(0)
        expect(visual.rects[0]?.y).toBeGreaterThanOrEqual(0)
        expect(visual.rects[0]?.width).toBeGreaterThan(0)
        expect(visual.rects[0]?.height).toBeGreaterThan(0)
      }
    })

    it('returns null for invalid XPath', () => {
      const serialized: SerializedRange = {
        startXPath: '//*[@id="nonexistent"]/text()[1]',
        startOffset: 0,
        endXPath: '//*[@id="nonexistent"]/text()[1]',
        endOffset: 5,
        timestamp: Date.now()
      }

      const visual = deserializeRange(serialized, 'viewport')
      expect(visual).toBeNull()
    })
  })

  describe('getSerializedSelectionFromDOM', () => {
    it('returns null when no selection', () => {
      const serialized = getSerializedSelectionFromDOM()
      expect(serialized).toBeNull()
    })

    it('returns serialized format for active selection', () => {
      const range = document.createRange()
      const p1 = document.getElementById('p1')!
      range.setStart(p1.firstChild!, 0)
      range.setEnd(p1.firstChild!, 5)

      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)

      const serialized = getSerializedSelectionFromDOM()

      expect(serialized).not.toBeNull()
      if (serialized) {
        expect(serialized.startXPath).toBeDefined()
        expect(serialized.endXPath).toBeDefined()
        expect(serialized.startOffset).toBe(0)
        expect(serialized.endOffset).toBe(5)
      }
    })
  })

  describe('isSelectionEmpty', () => {
    it('returns true for null selection', () => {
      expect(isSelectionEmpty(null)).toBe(true)
    })

    it('returns true for selection with no rects', () => {
      const emptySelection: SelectionRange = {
        rects: [],
        timestamp: Date.now()
      }
      expect(isSelectionEmpty(emptySelection)).toBe(true)
    })

    it('returns false for selection with rects', () => {
      const selection: SelectionRange = {
        rects: [{ x: 0, y: 0, width: 100, height: 20 }],
        timestamp: Date.now()
      }
      expect(isSelectionEmpty(selection)).toBe(false)
    })
  })

  describe('getSelectionBounds', () => {
    it('computes bounding box for single rect', () => {
      const selection: SelectionRange = {
        rects: [{ x: 10, y: 20, width: 100, height: 30 }],
        timestamp: Date.now()
      }

      const bounds = getSelectionBounds(selection)

      expect(bounds.left).toBe(10)
      expect(bounds.top).toBe(20)
      expect(bounds.width).toBe(100)
      expect(bounds.height).toBe(30)
    })

    it('computes bounding box for multiple rects', () => {
      const selection: SelectionRange = {
        rects: [
          { x: 10, y: 20, width: 100, height: 30 },
          { x: 5, y: 55, width: 120, height: 30 }
        ],
        timestamp: Date.now()
      }

      const bounds = getSelectionBounds(selection)

      expect(bounds.left).toBe(5) // Min x
      expect(bounds.top).toBe(20) // Min y
      expect(bounds.width).toBe(120) // 125 - 5 (max right - min left)
      expect(bounds.height).toBe(65) // 85 - 20 (max bottom - min top)
    })

    it('returns zero bounds for empty selection', () => {
      const selection: SelectionRange = {
        rects: [],
        timestamp: Date.now()
      }

      const bounds = getSelectionBounds(selection)

      expect(bounds.left).toBe(0)
      expect(bounds.top).toBe(0)
      expect(bounds.width).toBe(0)
      expect(bounds.height).toBe(0)
    })
  })

  describe('selectionsOverlap', () => {
    it('detects overlapping selections', () => {
      const sel1: SelectionRange = {
        rects: [{ x: 10, y: 10, width: 100, height: 30 }],
        timestamp: Date.now()
      }

      const sel2: SelectionRange = {
        rects: [{ x: 50, y: 20, width: 100, height: 30 }],
        timestamp: Date.now()
      }

      expect(selectionsOverlap(sel1, sel2)).toBe(true)
    })

    it('detects non-overlapping selections', () => {
      const sel1: SelectionRange = {
        rects: [{ x: 10, y: 10, width: 50, height: 30 }],
        timestamp: Date.now()
      }

      const sel2: SelectionRange = {
        rects: [{ x: 200, y: 200, width: 50, height: 30 }],
        timestamp: Date.now()
      }

      expect(selectionsOverlap(sel1, sel2)).toBe(false)
    })

    it('detects edge-adjacent selections as non-overlapping', () => {
      const sel1: SelectionRange = {
        rects: [{ x: 10, y: 10, width: 50, height: 30 }],
        timestamp: Date.now()
      }

      const sel2: SelectionRange = {
        // Starts exactly where sel1 ends
        rects: [{ x: 60, y: 10, width: 50, height: 30 }],
        timestamp: Date.now()
      }

      // Edge-touching selections don't overlap
      expect(selectionsOverlap(sel1, sel2)).toBe(false)
    })
  })
})
