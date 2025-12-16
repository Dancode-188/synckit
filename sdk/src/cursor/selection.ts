/**
 * Selection utilities - Text selection capture and visualization
 * @module cursor/selection
 */

import type { SelectionRange, SelectionBounds, SelectionRect, CursorMode, SerializedRange } from './types'
import { getXPathForNode, getNodeFromXPath } from './xpath'

/**
 * Get current text selection from DOM
 * Converts DOM selection to our coordinate format
 *
 * @param mode - Positioning mode (viewport or container)
 * @param container - Container element (required for container mode)
 * @returns Selection range with rectangles, or null if no selection
 *
 * @example
 * ```ts
 * // Viewport mode
 * const selection = getSelectionFromDOM('viewport')
 *
 * // Container mode
 * const selection = getSelectionFromDOM('container', containerElement)
 * ```
 */
export function getSelectionFromDOM(
  mode: CursorMode = 'viewport',
  container?: HTMLElement
): SelectionRange | null {
  const selection = window.getSelection()

  // No selection or collapsed (just cursor, no text selected)
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  const domRects = range.getClientRects()

  // No rectangles (shouldn't happen, but be defensive)
  if (domRects.length === 0) {
    return null
  }

  // Convert DOMRectList to our SelectionRect format
  const rects: SelectionRect[] = []

  for (let i = 0; i < domRects.length; i++) {
    const domRect = domRects[i]
    if (!domRect) continue

    // Skip zero-width or zero-height rectangles (can happen at line breaks)
    if (domRect.width === 0 || domRect.height === 0) {
      continue
    }

    if (mode === 'container' && container) {
      // Container mode: add scroll offset
      const containerRect = container.getBoundingClientRect()
      rects.push({
        x: Math.round(domRect.left - containerRect.left + container.scrollLeft),
        y: Math.round(domRect.top - containerRect.top + container.scrollTop),
        width: Math.round(domRect.width),
        height: Math.round(domRect.height)
      })
    } else {
      // Viewport mode: use directly
      rects.push({
        x: Math.round(domRect.left),
        y: Math.round(domRect.top),
        width: Math.round(domRect.width),
        height: Math.round(domRect.height)
      })
    }
  }

  // If all rects were filtered out, return null
  if (rects.length === 0) {
    return null
  }

  return {
    rects,
    timestamp: Date.now()
  }
}

/**
 * Check if selection is empty
 *
 * @param selection - Selection range to check
 * @returns True if selection is null or has no rectangles
 */
export function isSelectionEmpty(selection: SelectionRange | null): boolean {
  return !selection || selection.rects.length === 0
}

/**
 * Get total bounds of selection (bounding box containing all rectangles)
 * Useful for visibility checks and positioning
 *
 * @param selection - Selection range
 * @returns Bounding box containing all selection rectangles
 */
export function getSelectionBounds(selection: SelectionRange): SelectionBounds {
  if (selection.rects.length === 0) {
    return { left: 0, top: 0, width: 0, height: 0 }
  }

  const lefts = selection.rects.map(r => r.x)
  const tops = selection.rects.map(r => r.y)
  const rights = selection.rects.map(r => r.x + r.width)
  const bottoms = selection.rects.map(r => r.y + r.height)

  const left = Math.min(...lefts)
  const top = Math.min(...tops)
  const right = Math.max(...rights)
  const bottom = Math.max(...bottoms)

  return {
    left,
    top,
    width: right - left,
    height: bottom - top
  }
}

/**
 * Check if two selection ranges overlap
 * Useful for collision detection or visual optimization
 *
 * @param a - First selection range
 * @param b - Second selection range
 * @returns True if selections overlap
 */
export function selectionsOverlap(
  a: SelectionRange,
  b: SelectionRange
): boolean {
  const boundsA = getSelectionBounds(a)
  const boundsB = getSelectionBounds(b)

  // Check if bounding boxes overlap
  // Use <= to treat edge-touching as non-overlapping
  return !(
    boundsA.left + boundsA.width <= boundsB.left ||
    boundsB.left + boundsB.width <= boundsA.left ||
    boundsA.top + boundsA.height <= boundsB.top ||
    boundsB.top + boundsB.height <= boundsA.top
  )
}

// ============================================================================
// Semantic Selection Serialization (XPath-based)
// ============================================================================

/**
 * Serialize a DOM Range to semantic format (XPath + offsets)
 * This enables sharing WHAT is selected, not just WHERE it appears visually
 *
 * @param range - DOM Range to serialize
 * @returns Serialized range data, or null if serialization fails
 *
 * @example
 * ```ts
 * const selection = window.getSelection()
 * const range = selection.getRangeAt(0)
 * const serialized = serializeRange(range)
 * // { startXPath: "/html/body/div[1]/p[1]", startOffset: 15, ... }
 * ```
 */
export function serializeRange(range: Range): SerializedRange | null {
  try {
    const { startContainer, startOffset, endContainer, endOffset } = range

    return {
      startXPath: getXPathForNode(startContainer),
      startOffset,
      endXPath: getXPathForNode(endContainer),
      endOffset,
      timestamp: Date.now()
    }
  } catch (error) {
    console.warn('[Selection] Failed to serialize range:', error)
    return null
  }
}

/**
 * Deserialize SerializedRange to a DOM Range object
 *
 * @param data - Serialized range data
 * @param doc - Document to create range in (defaults to global document)
 * @returns DOM Range, or null if deserialization fails
 *
 * @example
 * ```ts
 * const range = deserializeToRange(serializedData)
 * if (range) {
 *   const rects = range.getClientRects()
 * }
 * ```
 */
export function deserializeToRange(data: SerializedRange, doc: Document = document): Range | null {
  try {
    const startContainer = getNodeFromXPath(data.startXPath, doc)
    const endContainer = getNodeFromXPath(data.endXPath, doc)

    if (!startContainer || !endContainer) {
      console.warn('[Selection] Failed to find nodes from XPath:', {
        startXPath: data.startXPath,
        endXPath: data.endXPath
      })
      return null
    }

    const range = doc.createRange()
    range.setStart(startContainer, data.startOffset)
    range.setEnd(endContainer, data.endOffset)

    return range
  } catch (error) {
    console.warn('[Selection] Failed to deserialize range:', error)
    return null
  }
}

/**
 * Convert a DOM Range to visual SelectionRange
 * Computes visual rectangles from a Range object
 *
 * @param range - DOM Range
 * @param mode - Positioning mode
 * @param container - Container element (for container mode)
 * @returns Visual selection range with rectangles
 */
export function rangeToSelectionRange(
  range: Range,
  mode: CursorMode = 'viewport',
  container?: HTMLElement
): SelectionRange | null {
  try {
    const domRects = range.getClientRects()
    const rects: SelectionRect[] = []

    for (let i = 0; i < domRects.length; i++) {
      const domRect = domRects[i]
      if (!domRect) continue

      // Skip zero-width or zero-height rectangles
      if (domRect.width === 0 || domRect.height === 0) {
        continue
      }

      if (mode === 'container' && container) {
        const containerRect = container.getBoundingClientRect()
        rects.push({
          x: Math.round(domRect.left - containerRect.left + container.scrollLeft),
          y: Math.round(domRect.top - containerRect.top + container.scrollTop),
          width: Math.round(domRect.width),
          height: Math.round(domRect.height)
        })
      } else {
        rects.push({
          x: Math.round(domRect.left),
          y: Math.round(domRect.top),
          width: Math.round(domRect.width),
          height: Math.round(domRect.height)
        })
      }
    }

    if (rects.length === 0) {
      return null
    }

    return {
      rects,
      timestamp: Date.now()
    }
  } catch (error) {
    console.warn('[Selection] Failed to convert range to selection:', error)
    return null
  }
}

/**
 * Deserialize SerializedRange to visual SelectionRange (for rendering)
 * This is the main function used by components to render remote selections
 *
 * @param data - Serialized range data
 * @param mode - Positioning mode
 * @param container - Container element (for container mode)
 * @returns Visual selection range, or null if deserialization fails
 *
 * @example
 * ```ts
 * // Component receives SerializedRange from remote user
 * const visualSelection = deserializeRange(remoteSelection, 'viewport')
 * // Render visualSelection.rects as highlight boxes
 * ```
 */
export function deserializeRange(
  data: SerializedRange,
  mode: CursorMode = 'viewport',
  container?: HTMLElement
): SelectionRange | null {
  const range = deserializeToRange(data)
  if (!range) return null

  return rangeToSelectionRange(range, mode, container)
}

/**
 * Get current text selection as SerializedRange (for broadcasting)
 * This is what should be shared via awareness protocol
 *
 * @returns Serialized selection, or null if no selection
 *
 * @example
 * ```ts
 * const serializedSelection = getSerializedSelectionFromDOM()
 * updatePresence({ selection: serializedSelection })
 * ```
 */
export function getSerializedSelectionFromDOM(): SerializedRange | null {
  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  return serializeRange(range)
}
