/**
 * Chaos Testing Utilities
 *
 * Helper functions for multi-tab chaos testing scenarios including:
 * - Network partitioning (isolating tabs)
 * - Leader election testing
 * - State inspection across tabs
 */

import type { Page } from '@playwright/test'

export interface TabState {
  isLeader: boolean
  tabId: string
  documentText: string
  undoStackSize: number
  redoStackSize: number
}

/**
 * Get the current state of a tab by reading window.__synckit_* variables
 */
export async function getTabState(page: Page): Promise<TabState> {
  return await page.evaluate(() => {
    return {
      isLeader: (window as any).__synckit_isLeader || false,
      tabId: (window as any).__synckit_tabId || 'unknown',
      documentText: (window as any).__synckit_documentText || '',
      undoStackSize: (window as any).__synckit_undoStackSize || 0,
      redoStackSize: (window as any).__synckit_redoStackSize || 0,
    }
  })
}

/**
 * Isolate a tab by blocking BroadcastChannel messages
 *
 * This simulates a network partition where the tab can't communicate
 * with other tabs via BroadcastChannel.
 */
export async function isolateTab(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Override BroadcastChannel to prevent sending/receiving messages
    const originalBroadcastChannel = (window as any).BroadcastChannel

    ;(window as any).BroadcastChannel = class FakeBroadcastChannel {
      constructor() {
        // Don't call original constructor
      }

      postMessage() {
        // Drop messages
      }

      close() {
        // No-op
      }

      addEventListener() {
        // Ignore event listeners
      }

      removeEventListener() {
        // No-op
      }
    }

    // Store original for potential restoration
    ;(window as any).__original_BroadcastChannel = originalBroadcastChannel
  })
}

/**
 * Restore a tab's BroadcastChannel after isolation
 */
export async function restoreTab(page: Page): Promise<void> {
  await page.evaluate(() => {
    const originalBroadcastChannel = (window as any).__original_BroadcastChannel

    if (originalBroadcastChannel) {
      ;(window as any).BroadcastChannel = originalBroadcastChannel
      delete (window as any).__original_BroadcastChannel
    }
  })
}

/**
 * Wait for exactly N leaders across all pages
 */
export async function waitForLeaderCount(
  pages: Page[],
  expectedCount: number,
  timeout: number = 5000
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const states = await Promise.all(pages.map(getTabState))
    const leaderCount = states.filter(s => s.isLeader).length

    if (leaderCount === expectedCount) {
      return
    }

    await new Promise(resolve => setTimeout(resolve, 100))
  }

  throw new Error(`Timeout waiting for ${expectedCount} leader(s)`)
}

/**
 * Wait for a specific tab to become leader
 */
export async function waitForLeader(page: Page, timeout: number = 5000): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const state = await getTabState(page)

    if (state.isLeader) {
      return
    }

    await new Promise(resolve => setTimeout(resolve, 100))
  }

  throw new Error('Timeout waiting for tab to become leader')
}

/**
 * Wait for all tabs to have the same document text
 */
export async function waitForSync(pages: Page[], timeout: number = 5000): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const states = await Promise.all(pages.map(getTabState))
    const texts = states.map(s => s.documentText)

    // Check if all texts are the same
    if (texts.every(t => t === texts[0])) {
      return
    }

    await new Promise(resolve => setTimeout(resolve, 100))
  }

  throw new Error('Timeout waiting for tabs to sync')
}

/**
 * Type text into a tab's editor
 */
export async function typeInEditor(page: Page, text: string): Promise<void> {
  const editor = page.locator('[data-testid="editor"]')
  await editor.click()
  await editor.clear()
  await editor.fill(text)
}

/**
 * Click undo button in a tab
 */
export async function clickUndo(page: Page): Promise<void> {
  const undoBtn = page.locator('[data-testid="undo-btn"]')
  await undoBtn.click()
}

/**
 * Click redo button in a tab
 */
export async function clickRedo(page: Page): Promise<void> {
  const redoBtn = page.locator('[data-testid="redo-btn"]')
  await redoBtn.click()
}

/**
 * Get the leader page from a list of pages
 */
export async function getLeaderPage(pages: Page[]): Promise<Page | null> {
  for (const page of pages) {
    const state = await getTabState(page)
    if (state.isLeader) {
      return page
    }
  }
  return null
}

/**
 * Get all follower pages from a list of pages
 */
export async function getFollowerPages(pages: Page[]): Promise<Page[]> {
  const followers: Page[] = []

  for (const page of pages) {
    const state = await getTabState(page)
    if (!state.isLeader) {
      followers.push(page)
    }
  }

  return followers
}

/**
 * Heal network partition by restoring BroadcastChannel
 * Alias for restoreTab
 */
export async function healPartition(page: Page): Promise<void> {
  await restoreTab(page)
}

/**
 * Add packet loss to a tab by randomly dropping BroadcastChannel messages
 * @param page - The page to add packet loss to
 * @param lossPercentage - Percentage of messages to drop (0-100)
 */
export async function addPacketLoss(page: Page, lossPercentage: number): Promise<void> {
  await page.evaluate((percentage) => {
    const originalBroadcastChannel = (window as any).BroadcastChannel

    ;(window as any).BroadcastChannel = class PacketLossBroadcastChannel {
      private channel: any
      private messageListeners: Set<(event: MessageEvent) => void> = new Set()

      constructor(name: string) {
        this.channel = new originalBroadcastChannel(name)

        // Intercept incoming messages and randomly drop them
        this.channel.addEventListener('message', (event: MessageEvent) => {
          if (Math.random() * 100 >= percentage) {
            // Pass through message (not dropped)
            this.messageListeners.forEach(listener => {
              try {
                listener(event)
              } catch (error) {
                console.error('Message listener error:', error)
              }
            })
          }
          // else: drop message (packet loss)
        })
      }

      postMessage(message: any) {
        // Randomly drop outgoing messages
        if (Math.random() * 100 >= percentage) {
          this.channel.postMessage(message)
        }
        // else: drop message (packet loss)
      }

      close() {
        this.channel.close()
      }

      addEventListener(type: string, listener: any) {
        if (type === 'message') {
          this.messageListeners.add(listener)
        }
      }

      removeEventListener(type: string, listener: any) {
        if (type === 'message') {
          this.messageListeners.delete(listener)
        }
      }
    }

    // Store original for potential restoration
    ;(window as any).__original_BroadcastChannel = originalBroadcastChannel
  }, lossPercentage)
}
