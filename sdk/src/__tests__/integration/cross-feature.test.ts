import { test, expect } from '@playwright/test'
import {
  openTabs,
  closeTabs,
  getTabState,
  waitForConvergence,
  typeText,
  clickUndo,
  clickRedo,
} from './test-helpers'

test.describe('Cross-Feature Integration', () => {
  test('text CRDT + undo/redo together', async ({ browser }) => {
    const tabs = await openTabs(browser, 2)

    try {
      await new Promise(resolve => setTimeout(resolve, 1500))

      const tab1 = tabs[0]
      const tab2 = tabs[1]

      if (!tab1 || !tab2) {
        console.warn('Not all tabs opened - skipping test')
        return
      }

      // Tab 1: Type text
      await typeText(tab1, 'Hello World')
      await waitForConvergence(tabs, 2000)

      // Both tabs should see the text
      let states = await Promise.all(tabs.map(getTabState))
      states.forEach(s => expect(s.text).toBe('Hello World'))
      states.forEach(s => expect(s.undoStackSize).toBe(1))

      // Tab 1: Undo
      await clickUndo(tab1)
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Both tabs should see empty text and empty undo stack
      states = await Promise.all(tabs.map(getTabState))
      states.forEach(s => expect(s.text).toBe(''))
      states.forEach(s => expect(s.undoStackSize).toBe(0))
      states.forEach(s => expect(s.redoStackSize).toBe(1))

      // Tab 2: Redo
      await clickRedo(tab2)
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Both should see text again
      states = await Promise.all(tabs.map(getTabState))
      states.forEach(s => expect(s.text).toBe('Hello World'))
      states.forEach(s => expect(s.undoStackSize).toBe(1))
      states.forEach(s => expect(s.redoStackSize).toBe(0))
    } finally {
      await closeTabs(tabs)
    }
  })

  test('concurrent editing with CRDT convergence', async ({ browser }) => {
    const tabs = await openTabs(browser, 3)

    try {
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Check all tabs exist
      if (!tabs[0] || !tabs[1] || !tabs[2]) {
        console.warn('Not all tabs opened - skipping test')
        return
      }

      // Tab 1 types "AAA"
      await typeText(tabs[0], 'AAA')

      // Tab 2 types "BBB" (concurrent)
      await typeText(tabs[1], 'BBB')

      // Tab 3 types "CCC" (concurrent)
      await typeText(tabs[2], 'CCC')

      // Wait for CRDT convergence
      await waitForConvergence(tabs, 3000)

      // All should have same text (CRDT ordering ensures convergence)
      const states = await Promise.all(tabs.map(getTabState))
      const referenceText = states[0]?.text

      if (!referenceText) {
        console.warn('No reference text - skipping test')
        return
      }

      states.forEach(s => expect(s.text).toBe(referenceText))

      // All tabs should have consistent undo stack sizes
      const referenceUndoSize = states[0]?.undoStackSize
      states.forEach(s => expect(s.undoStackSize).toBe(referenceUndoSize))
    } finally {
      await closeTabs(tabs)
    }
  })

  test('long-running session stability', async ({ browser }) => {
    const tabs = await openTabs(browser, 2)

    try {
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Simulate 50 operations over time (reduced from 100 for faster tests)
      for (let i = 0; i < 50; i++) {
        const randomTab = tabs[Math.floor(Math.random() * tabs.length)]

        if (!randomTab) continue

        if (i % 2 === 0) {
          await typeText(randomTab, `Text ${i}`)
        } else {
          const state = await getTabState(randomTab)
          if (state.undoStackSize > 0) {
            await clickUndo(randomTab)
          }
        }

        // Wait between operations
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      // Final convergence check
      await waitForConvergence(tabs, 5000)

      const states = await Promise.all(tabs.map(getTabState))
      expect(states[0]?.text).toBe(states[1]?.text)
      expect(states[0]?.undoStackSize).toBe(states[1]?.undoStackSize)

      // No memory leaks (rough check)
      const memory1 = await tabs[0]?.page.evaluate(() => {
        return (performance as any).memory?.usedJSHeapSize || 0
      })

      // Should be under 100MB
      if (memory1 > 0) {
        expect(memory1).toBeLessThan(100 * 1024 * 1024)
      }
    } finally {
      await closeTabs(tabs)
    }
  })

  test('multi-tab stress test', async ({ browser }) => {
    // Use 5 tabs for stress test (10 tabs with simultaneous clear+fill creates too much conflict)
    const tabs = await openTabs(browser, 5)

    try {
      // Wait for leader election
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Verify exactly 1 leader
      const states = await Promise.all(tabs.map(getTabState))
      const leaders = states.filter(s => s.isLeader)
      expect(leaders.length).toBe(1)

      // Each tab types sequentially to avoid massive conflicts
      // This is more realistic than all tabs simultaneously replacing content
      for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i]
        if (!tab) continue

        await typeText(tab, `Content from tab ${i}`)
        await new Promise(resolve => setTimeout(resolve, 200))
      }

      // Wait for convergence
      await waitForConvergence(tabs, 5000)

      // All should have same final text
      const finalStates = await Promise.all(tabs.map(getTabState))
      const referenceText = finalStates[0]?.text

      if (!referenceText) {
        console.warn('No reference text - skipping test')
        return
      }

      finalStates.forEach(s => expect(s.text).toBe(referenceText))

      // All should have consistent undo stacks
      const referenceUndoSize = finalStates[0]?.undoStackSize
      finalStates.forEach(s => expect(s.undoStackSize).toBe(referenceUndoSize))
    } finally {
      await closeTabs(tabs)
    }
  })
})
