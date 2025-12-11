/**
 * Utilities for handling refs and getters
 * Implements VueUse's toValue pattern
 * @module adapters/vue/utils/refs
 */

import { unref, isRef } from 'vue'
import type { Ref } from 'vue'
import type { MaybeRefOrGetter } from '../types'

/**
 * Normalize a MaybeRefOrGetter to its value
 * Equivalent to VueUse's toValue()
 *
 * @example
 * ```ts
 * toValue('hello')           // 'hello'
 * toValue(ref('hello'))      // 'hello'
 * toValue(() => 'hello')     // 'hello'
 * ```
 */
export function toValue<T>(source: MaybeRefOrGetter<T>): T {
  return typeof source === 'function'
    ? (source as () => T)()
    : unref(source)
}

/**
 * Check if a value is a ref
 */
export function isMaybeRef<T>(value: MaybeRefOrGetter<T>): value is Ref<T> {
  return isRef(value)
}

/**
 * Check if a value is a getter function
 */
export function isGetter<T>(value: MaybeRefOrGetter<T>): value is () => T {
  return typeof value === 'function'
}
