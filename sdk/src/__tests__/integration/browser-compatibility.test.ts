import { test, expect } from '@playwright/test'
import {
  openTabs,
  closeTabs,
  getTabState,
  waitForConvergence,
  typeText,
} from './test-helpers'

/**
 * Browser compatibility tests for SyncKit
 *
 * Verifies that core functionality works across Chrome, Firefox, and Safari
 */
test.describe('Browser Compatibility', () => {
  test('BroadcastChannel works in Chromium', async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'Chromium-only test')

    const tabs = await openTabs(browser, 2)

    try {
      // Wait for leader election
      await new Promise(resolve => setTimeout(resolve, 1500))

      const tab1 = tabs[0]
      const tab2 = tabs[1]

      if (!tab1 || !tab2) {
        console.warn('Not all tabs opened - skipping test')
        return
      }

      // Verify BroadcastChannel is available
      const hasBroadcastChannel = await tab1.page.evaluate(() => {
        return typeof BroadcastChannel !== 'undefined'
      })
      expect(hasBroadcastChannel).toBe(true)

      // Test cross-tab communication
      await typeText(tab1, 'Chrome test')
      await waitForConvergence(tabs, 3000)

      const states = await Promise.all(tabs.map(getTabState))
      states.forEach(s => expect(s.text).toBe('Chrome test'))
    } finally {
      await closeTabs(tabs)
    }
  })

  test('BroadcastChannel works in Firefox', async ({ browser, browserName }) => {
    test.skip(browserName !== 'firefox', 'Firefox-only test')

    const tabs = await openTabs(browser, 2)

    try {
      await new Promise(resolve => setTimeout(resolve, 1500))

      const tab1 = tabs[0]
      const tab2 = tabs[1]

      if (!tab1 || !tab2) {
        console.warn('Not all tabs opened - skipping test')
        return
      }

      // Verify BroadcastChannel is available
      const hasBroadcastChannel = await tab1.page.evaluate(() => {
        return typeof BroadcastChannel !== 'undefined'
      })
      expect(hasBroadcastChannel).toBe(true)

      // Test cross-tab communication
      await typeText(tab1, 'Firefox test')
      await waitForConvergence(tabs, 3000)

      const states = await Promise.all(tabs.map(getTabState))
      states.forEach(s => expect(s.text).toBe('Firefox test'))
    } finally {
      await closeTabs(tabs)
    }
  })

  test('BroadcastChannel works in Safari', async ({ browser, browserName }) => {
    test.skip(browserName !== 'webkit', 'Safari-only test')

    const tabs = await openTabs(browser, 2)

    try {
      await new Promise(resolve => setTimeout(resolve, 1500))

      const tab1 = tabs[0]
      const tab2 = tabs[1]

      if (!tab1 || !tab2) {
        console.warn('Not all tabs opened - skipping test')
        return
      }

      // Verify BroadcastChannel is available
      const hasBroadcastChannel = await tab1.page.evaluate(() => {
        return typeof BroadcastChannel !== 'undefined'
      })
      expect(hasBroadcastChannel).toBe(true)

      // Test cross-tab communication
      await typeText(tab1, 'Safari test')
      await waitForConvergence(tabs, 3000)

      const states = await Promise.all(tabs.map(getTabState))
      states.forEach(s => expect(s.text).toBe('Safari test'))
    } finally {
      await closeTabs(tabs)
    }
  })

  test('IndexedDB works across all browsers', async ({ browser }) => {
    const tabs = await openTabs(browser, 1)

    try {
      const tab1 = tabs[0]

      if (!tab1) {
        console.warn('Tab not opened - skipping test')
        return
      }

      // Check IndexedDB support
      const hasIndexedDB = await tab1.page.evaluate(() => {
        return typeof indexedDB !== 'undefined'
      })
      expect(hasIndexedDB).toBe(true)

      // Test IndexedDB operations
      const canWriteToIndexedDB = await tab1.page.evaluate(async () => {
        try {
          const request = indexedDB.open('test-db', 1)
          return new Promise<boolean>((resolve) => {
            request.onsuccess = () => {
              const db = request.result
              db.close()
              resolve(true)
            }
            request.onerror = () => resolve(false)
          })
        } catch (e) {
          return false
        }
      })

      expect(canWriteToIndexedDB).toBe(true)
    } finally {
      await closeTabs(tabs)
    }
  })

  test('WASM loads correctly in all browsers', async ({ browser }) => {
    const tabs = await openTabs(browser, 1)

    try {
      const tab1 = tabs[0]

      if (!tab1) {
        console.warn('Tab not opened - skipping test')
        return
      }

      // Check WebAssembly support
      const hasWasm = await tab1.page.evaluate(() => {
        return typeof WebAssembly !== 'undefined'
      })
      expect(hasWasm).toBe(true)
    } finally {
      await closeTabs(tabs)
    }
  })

  test('Leader election works in all browsers', async ({ browser }) => {
    const tabs = await openTabs(browser, 3)

    try {
      // Wait for leader election
      await new Promise(resolve => setTimeout(resolve, 2000))

      const states = await Promise.all(tabs.map(getTabState))
      const leaders = states.filter(s => s.isLeader)

      // Exactly one leader should be elected
      expect(leaders.length).toBeGreaterThanOrEqual(1)
      expect(leaders.length).toBeLessThanOrEqual(1)
    } finally {
      await closeTabs(tabs)
    }
  })

  test('Text synchronization works in all browsers', async ({ browser, browserName }) => {
    const tabs = await openTabs(browser, 2)

    try {
      await new Promise(resolve => setTimeout(resolve, 1500))

      const tab1 = tabs[0]
      const tab2 = tabs[1]

      if (!tab1 || !tab2) {
        console.warn('Not all tabs opened - skipping test')
        return
      }

      // Tab1 types text
      await typeText(tab1, `${browserName} sync test`)
      await waitForConvergence(tabs, 3000)

      // Both tabs should see the same text
      const states = await Promise.all(tabs.map(getTabState))
      states.forEach(s => {
        expect(s.text).toBe(`${browserName} sync test`)
      })
    } finally {
      await closeTabs(tabs)
    }
  })
})
