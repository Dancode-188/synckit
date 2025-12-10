/**
 * Selection utilities - Text selection capture and visualization
 * @module cursor/selection
 */

import type { SelectionRange, SelectionBounds, SelectionRect, CursorMode } from './types'

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
  return !(
    boundsA.left + boundsA.width < boundsB.left ||
    boundsB.left + boundsB.width < boundsA.left ||
    boundsA.top + boundsA.height < boundsB.top ||
    boundsB.top + boundsB.height < boundsA.top
  )
}
