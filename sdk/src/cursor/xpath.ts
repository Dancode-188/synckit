/**
 * XPath utilities for DOM Range serialization
 *
 * This module provides lightweight XPath generation and evaluation
 * for serializing/deserializing DOM Ranges in collaborative selection sharing.
 */

/**
 * Generate XPath for an element node
 * Uses element ID if available for faster lookup, otherwise generates path-based XPath
 *
 * @example
 * getXPathForElement(document.querySelector('p'))
 * // Returns: "/html/body/div[1]/p[1]"
 */
export function getXPathForElement(element: Element): string {
  // Fast path: use ID if available
  if (element.id) {
    return `//*[@id="${element.id}"]`
  }

  const segments: string[] = []
  let currentNode: Element | null = element

  while (currentNode && currentNode.nodeType === Node.ELEMENT_NODE) {
    // Count position among siblings with same tag name
    let index = 1
    let sibling = currentNode.previousSibling

    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE &&
          sibling.nodeName === currentNode.nodeName) {
        index++
      }
      sibling = sibling.previousSibling
    }

    const tagName = currentNode.nodeName.toLowerCase()
    const segment = index > 1 ? `${tagName}[${index}]` : tagName
    segments.unshift(segment)

    currentNode = currentNode.parentElement
  }

  return '/' + segments.join('/')
}

/**
 * Generate XPath for a text node
 *
 * @example
 * getXPathForTextNode(textNode)
 * // Returns: "/html/body/div[1]/p[1]/text()[1]"
 */
export function getXPathForTextNode(textNode: Text): string {
  const parent = textNode.parentElement
  if (!parent) {
    throw new Error('[XPath] Text node has no parent element')
  }

  const parentXPath = getXPathForElement(parent)

  // Count position among text node siblings
  let index = 1
  let sibling = textNode.previousSibling

  while (sibling) {
    if (sibling.nodeType === Node.TEXT_NODE) {
      index++
    }
    sibling = sibling.previousSibling
  }

  return `${parentXPath}/text()[${index}]`
}

/**
 * Generate XPath for any node (element or text)
 *
 * @param node - DOM node to generate XPath for
 * @returns XPath string
 * @throws Error if node type is not supported
 */
export function getXPathForNode(node: Node): string {
  if (node.nodeType === Node.ELEMENT_NODE) {
    return getXPathForElement(node as Element)
  } else if (node.nodeType === Node.TEXT_NODE) {
    return getXPathForTextNode(node as Text)
  } else {
    throw new Error(`[XPath] Unsupported node type: ${node.nodeType}`)
  }
}

/**
 * Evaluate XPath and return the first matching node
 *
 * @param xpath - XPath string to evaluate
 * @param doc - Document to evaluate against (defaults to global document)
 * @returns Matching node or null if not found
 */
export function getNodeFromXPath(xpath: string, doc: Document = document): Node | null {
  try {
    const result = doc.evaluate(
      xpath,
      doc,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    )
    return result.singleNodeValue
  } catch (error) {
    console.warn('[XPath] Failed to evaluate:', xpath, error)
    return null
  }
}

/**
 * Check if two XPaths point to the same node
 *
 * @param xpath1 - First XPath
 * @param xpath2 - Second XPath
 * @param doc - Document to evaluate against
 * @returns True if both XPaths resolve to the same node
 */
export function isSameNode(xpath1: string, xpath2: string, doc: Document = document): boolean {
  const node1 = getNodeFromXPath(xpath1, doc)
  const node2 = getNodeFromXPath(xpath2, doc)
  return node1 === node2 && node1 !== null
}

/**
 * Validate that an XPath can be resolved
 *
 * @param xpath - XPath to validate
 * @param doc - Document to validate against
 * @returns True if XPath resolves to a node
 */
export function isValidXPath(xpath: string, doc: Document = document): boolean {
  return getNodeFromXPath(xpath, doc) !== null
}
