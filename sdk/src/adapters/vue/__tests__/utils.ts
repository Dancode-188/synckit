/**
 * Test utilities for Vue adapter tests
 */

import { mount } from '@vue/test-utils'
import { SyncKitSymbol } from '../composables/useSyncKit'
import type { SyncKit } from '../../../synckit'

/**
 * Mount a component with SyncKit provided globally
 * This allows all Vue composables to access the mock SyncKit instance
 */
export function mountWithSyncKit(
  component: any,
  mockSyncKit: SyncKit,
  options: any = {}
) {
  return mount(component, {
    ...options,
    global: {
      ...options.global,
      provide: {
        ...options.global?.provide,
        [SyncKitSymbol as symbol]: mockSyncKit,
      },
    },
  })
}
