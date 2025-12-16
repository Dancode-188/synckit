/**
 * WASM Module Loader
 * Handles initialization and caching of the SyncKit WASM module
 * @module wasm-loader
 */

import { WASMError } from './types'

// WASM module types (from generated bindings)
export interface WASMModule {
  WasmDocument: {
    new (id: string): WasmDocument
  }
  WasmVectorClock: {
    new (): WasmVectorClock
  }
  WasmDelta: {
    compute(from: WasmDocument, to: WasmDocument): WasmDelta
  }
  WasmAwareness: {
    new (clientId: string): any // WasmAwareness instance
  }
  init_panic_hook(): void
}

export interface WasmDocument {
  getId(): string
  setField(path: string, valueJson: string, clock: bigint, clientId: string): void
  getField(path: string): string | undefined
  deleteField(path: string): void
  fieldCount(): number
  toJSON(): string
  merge(other: WasmDocument): void
  free(): void
}

export interface WasmVectorClock {
  tick(clientId: string): void
  update(clientId: string, clock: bigint): void
  get(clientId: string): bigint
  merge(other: WasmVectorClock): void
  toJSON(): string
  free(): void
}

export interface WasmDelta {
  applyTo(document: WasmDocument, clientId: string): void
  getDocumentId(): string
  changeCount(): number
  toJSON(): string
  free(): void
}

// Singleton WASM instance
let wasmModule: WASMModule | null = null
let initPromise: Promise<WASMModule> | null = null

/**
 * Initialize the WASM module
 * Uses singleton pattern - subsequent calls return cached instance
 */
export async function initWASM(): Promise<WASMModule> {
  // Return cached instance if already loaded
  if (wasmModule) {
    return wasmModule
  }
  
  // Return in-flight promise if initialization in progress
  if (initPromise) {
    return initPromise
  }
  
  // Start initialization
  initPromise = (async () => {
    try {
      // Dynamic import of WASM module from the default variant directory
      const wasm = await import('../wasm/default/synckit_core.js')

      // Initialize WASM module
      // In Node.js or test environments, we need to load the WASM file manually since fetch doesn't support file:// URLs
      const isNode = typeof process !== 'undefined' && process.versions?.node && (
        typeof window === 'undefined' ||
        // Also detect test environments (vitest, jest, etc.) even if they provide window (jsdom)
        process.env.NODE_ENV === 'test' ||
        typeof (globalThis as any).describe !== 'undefined' // vitest/jest global
      )

      if (isNode) {
        // Node.js: Load WASM file using fs and pass as buffer
        const { readFile } = await import('fs/promises')
        const { fileURLToPath } = await import('url')
        const { dirname, resolve } = await import('path')

        // Resolve WASM path - try multiple strategies
        let wasmPath: string

        // Strategy 1: Use import.meta.url if available (ESM)
        if (typeof import.meta !== 'undefined' && import.meta.url) {
          const currentDir = dirname(fileURLToPath(import.meta.url))
          wasmPath = resolve(currentDir, '../wasm/default/synckit_core_bg.wasm')
        }
        // Strategy 2: Use global.__dirname if available (tsup CJS shim)
        else if (typeof globalThis.__dirname !== 'undefined') {
          wasmPath = resolve(globalThis.__dirname, '../wasm/default/synckit_core_bg.wasm')
        }
        // Strategy 3: Resolve from cwd (local development/testing)
        else {
          wasmPath = resolve(process.cwd(), 'wasm/default/synckit_core_bg.wasm')
        }

        // Read WASM file and initialize
        const wasmBytes = await readFile(wasmPath)
        await wasm.default(wasmBytes)
      } else {
        // Browser: Use default initialization (will use fetch)
        await wasm.default()
      }

      // Install panic hook for better error messages
      wasm.init_panic_hook()

      return wasm as WASMModule
    } catch (error) {
      initPromise = null // Reset so retry is possible
      if (error instanceof WASMError) throw error
      throw new WASMError(`Failed to initialize WASM: ${error}`)
    }
  })()
  
  wasmModule = await initPromise
  return wasmModule
}

/**
 * Check if WASM module is initialized
 */
export function isWASMInitialized(): boolean {
  return wasmModule !== null
}

/**
 * Reset WASM instance (mainly for testing)
 */
export function resetWASM(): void {
  wasmModule = null
  initPromise = null
}
