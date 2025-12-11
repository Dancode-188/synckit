/**
 * Rune compatibility utilities for Svelte 5
 * Provides helpers for working with $state, $derived, and $effect runes
 */

/**
 * Create a reactive state value (Svelte 5 $state)
 *
 * This is a type-safe wrapper that ensures proper typing
 * for Svelte 5 reactive state.
 *
 * Note: In actual Svelte 5 code, you use `$state()` directly.
 * This utility is for type safety and documentation.
 *
 * @param initialValue - Initial state value
 * @returns Reactive state
 */
export function createState<T>(initialValue: T): T {
  // In actual usage, this would be: let value = $state(initialValue)
  // This function is mainly for type documentation
  return initialValue as T;
}

/**
 * Create a derived reactive value (Svelte 5 $derived)
 *
 * Note: In actual Svelte 5 code, you use `$derived()` directly.
 * This utility is for type safety and documentation.
 *
 * @param compute - Function to compute derived value
 * @returns Derived value
 */
export function createDerived<T>(compute: () => T): T {
  // In actual usage, this would be: let value = $derived(compute())
  return compute();
}

/**
 * Check if running in Svelte 5 runes mode
 *
 * Svelte 5 runes are only available when the component is compiled
 * with Svelte 5. This can be used for conditional logic.
 *
 * @returns true if Svelte 5 runes are available
 */
export function hasRunesSupport(): boolean {
  // Check if we're in a Svelte 5 environment
  // This is a simplified check - in practice, Svelte 5 code
  // would just use runes directly
  return typeof globalThis !== 'undefined' && '$state' in globalThis;
}

/**
 * Type guard for checking if a value is a Svelte store
 *
 * @param value - Value to check
 * @returns true if value has subscribe method (is a store)
 */
export function isStore(value: any): value is { subscribe: (fn: any) => any } {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.subscribe === 'function'
  );
}

/**
 * Helper for accessing reactive state safely
 *
 * Works with both rune properties and store values
 *
 * @param storeOrValue - Store or direct value
 * @returns Current value
 */
export function getValue<T>(storeOrValue: T | { subscribe: (fn: (v: T) => void) => any }): T {
  if (isStore(storeOrValue)) {
    let value: T;
    storeOrValue.subscribe((v: T) => (value = v))();
    return value!;
  }
  return storeOrValue as T;
}
