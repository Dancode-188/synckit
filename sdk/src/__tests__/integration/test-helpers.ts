import type { Browser, BrowserContext, Page } from '@playwright/test'

export interface SyncKitTab {
  context: BrowserContext
  page: Page
  tabId: string
}

/**
 * Open multiple SyncKit tabs
 */
export async function openTabs(
  browser: Browser,
  count: number
): Promise<SyncKitTab[]> {
  const tabs: SyncKitTab[] = []

  for (let i = 0; i < count; i++) {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto('/')
    await page.waitForSelector('[data-testid="test-harness"]', { timeout: 10000 })

    const tabId = await page.evaluate(() => {
      return (window as any).__synckit_tabId
    })

    tabs.push({ context, page, tabId })
  }

  return tabs
}

/**
 * Close all tabs
 */
export async function closeTabs(tabs: SyncKitTab[]): Promise<void> {
  await Promise.all(tabs.map(tab => tab.context.close()))
}

/**
 * Get tab state
 */
export async function getTabState(tab: SyncKitTab) {
  return tab.page.evaluate(() => ({
    isLeader: (window as any).__synckit_isLeader,
    tabId: (window as any).__synckit_tabId,
    text: (window as any).__synckit_documentText,
    undoStackSize: (window as any).__synckit_undoStackSize,
    redoStackSize: (window as any).__synckit_redoStackSize,
  }))
}

/**
 * Wait for all tabs to converge to same text
 */
export async function waitForConvergence(
  tabs: SyncKitTab[],
  timeoutMs: number = 5000
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    const states = await Promise.all(tabs.map(getTabState))
    const texts = states.map(s => s.text)

    // Check if all texts are equal
    if (texts.every(t => t === texts[0])) {
      return // Converged!
    }

    await new Promise(resolve => setTimeout(resolve, 100))
  }

  throw new Error('Tabs did not converge within timeout')
}

/**
 * Type text in editor
 */
export async function typeText(tab: SyncKitTab, text: string): Promise<void> {
  const editor = tab.page.locator('[data-testid="editor"]')
  await editor.click()
  await editor.clear()
  await editor.fill(text)
  // Wait for the async delete/insert operations to complete
  await new Promise(resolve => setTimeout(resolve, 300))
}

/**
 * Click undo button
 */
export async function clickUndo(tab: SyncKitTab): Promise<void> {
  await tab.page.click('[data-testid="undo-btn"]')
}

/**
 * Click redo button
 */
export async function clickRedo(tab: SyncKitTab): Promise<void> {
  await tab.page.click('[data-testid="redo-btn"]')
}

/**
 * Format text as bold
 */
export async function formatBold(tab: SyncKitTab): Promise<void> {
  await tab.page.click('[data-testid="format-bold-btn"]')
}
