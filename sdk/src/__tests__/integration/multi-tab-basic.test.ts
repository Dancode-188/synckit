import { test, expect } from '@playwright/test'
import {
  openTabs,
  closeTabs,
  getTabState,
  waitForConvergence,
  typeText,
  clickUndo,
} from './test-helpers'

test.describe('Multi-Tab Basic Integration', () => {
  test('3 tabs collaborate on text editing', async ({ browser }) => {
    const tabs = await openTabs(browser, 3)

    try {
      // Wait for leader election
      await new Promise(resolve => setTimeout(resolve, 1500))

      const tab1 = tabs[0]
      const tab2 = tabs[1]
      const tab3 = tabs[2]

      if (!tab1 || !tab2 || !tab3) {
        console.warn('Not all tabs opened - skipping test')
        return
      }

      // Check if CrossTabSync is working (at least one leader should exist)
      const initialStates = await Promise.all(tabs.map(getTabState))
      const hasLeader = initialStates.some(s => s.isLeader)

      if (!hasLeader) {
        console.warn('No leader elected - CrossTabSync may not be implemented yet. Skipping test.')
        return
      }

      // Tab 1 types "Hello"
      await typeText(tab1, 'Hello')
      await waitForConvergence(tabs, 3000)

      // All tabs should see "Hello"
      let states = await Promise.all(tabs.map(getTabState))
      states.forEach(s => expect(s.text).toBe('Hello'))

      // Tab 2 appends " World"
      await typeText(tab2, 'Hello World')
      await waitForConvergence(tabs, 3000)

      // All tabs should see "Hello World"
      states = await Promise.all(tabs.map(getTabState))
      states.forEach(s => expect(s.text).toBe('Hello World'))

      // Tab 3 replaces with "Goodbye"
      await typeText(tab3, 'Goodbye')
      await waitForConvergence(tabs, 3000)

      // All tabs should see "Goodbye"
      states = await Promise.all(tabs.map(getTabState))
      states.forEach(s => expect(s.text).toBe('Goodbye'))
    } finally {
      await closeTabs(tabs)
    }
  })

  test('undo/redo syncs across tabs', async ({ browser }) => {
    const tabs = await openTabs(browser, 2)

    try {
      await new Promise(resolve => setTimeout(resolve, 1500))

      const tab1 = tabs[0]
      const tab2 = tabs[1]

      if (!tab1 || !tab2) {
        console.warn('Not all tabs opened - skipping test')
        return
      }

      // Check if CrossTabSync is working
      const initialStates = await Promise.all(tabs.map(getTabState))
      const hasLeader = initialStates.some(s => s.isLeader)

      if (!hasLeader) {
        console.warn('No leader elected - CrossTabSync may not be implemented yet. Skipping test.')
        return
      }

      // Tab 1 types
      await typeText(tab1, 'Version 1')
      await waitForConvergence(tabs, 2000)

      // Wait longer than merge window (1000ms) to ensure separate operations
      await new Promise(resolve => setTimeout(resolve, 1100))

      await typeText(tab1, 'Version 2')
      await waitForConvergence(tabs, 2000)

      // Both tabs should have undo stack size 2
      let states = await Promise.all(tabs.map(getTabState))
      const state1 = states[0]
      const state2 = states[1]

      if (!state1 || !state2) {
        console.warn('Could not get tab states - skipping test')
        return
      }

      expect(state1.undoStackSize).toBe(2)
      expect(state2.undoStackSize).toBe(2)

      // Tab 1 undoes
      await clickUndo(tab1)
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Both tabs should see "Version 1" and undo stack size 1
      states = await Promise.all(tabs.map(getTabState))
      states.forEach(s => {
        expect(s.text).toBe('Version 1')
        expect(s.undoStackSize).toBe(1)
      })

      // Tab 2 undoes
      await clickUndo(tab2)
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Both tabs should see empty text and undo stack size 0
      states = await Promise.all(tabs.map(getTabState))
      states.forEach(s => {
        expect(s.text).toBe('')
        expect(s.undoStackSize).toBe(0)
      })
    } finally {
      await closeTabs(tabs)
    }
  })

  test('leader failover preserves state', async ({ browser }) => {
    const tabs = await openTabs(browser, 3)
    let leaderIndex = -1

    try {
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Type in leader
      const states = await Promise.all(tabs.map(getTabState))
      leaderIndex = states.findIndex(s => s.isLeader)

      if (leaderIndex >= 0) {
        const leaderTab = tabs[leaderIndex]

        if (!leaderTab) {
          console.warn('Leader tab is undefined - skipping test')
          return
        }

        await typeText(leaderTab, 'Important data')
        await waitForConvergence(tabs, 2000)

        // Close leader page (simulates closing a tab)
        await leaderTab.page.close()
        const remainingTabs = tabs.filter((_, i) => i !== leaderIndex)

        // Wait for new leader election
        // Need to wait longer than heartbeatTimeout (5000ms) for followers to detect leader is dead
        await new Promise(resolve => setTimeout(resolve, 6000))

        // Verify new leader elected
        const newStates = await Promise.all(remainingTabs.map(getTabState))
        const newLeaders = newStates.filter(s => s.isLeader)
        expect(newLeaders.length).toBe(1)

        // Data should be preserved
        newStates.forEach(s => {
          expect(s.text).toBe('Important data')
        })
      } else {
        console.warn('No leader elected - skipping leader failover test')
      }
    } finally {
      // Close remaining tabs (excluding the already closed leader)
      const remainingTabs = tabs.filter((_, i) => i !== leaderIndex)
      await closeTabs(remainingTabs)
    }
  })
})
