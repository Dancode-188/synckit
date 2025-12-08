/* tslint:disable */
/* eslint-disable */

export class WasmAwareness {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Create a new awareness instance
   */
  constructor(client_id: string);
  /**
   * Get the local client ID
   */
  getClientId(): string;
  /**
   * Set local client state (pass JSON string)
   */
  setLocalState(state_json: string): string;
  /**
   * Apply remote awareness update (pass JSON string)
   */
  applyUpdate(update_json: string): void;
  /**
   * Get all client states as JSON string
   */
  getStates(): string;
  /**
   * Get state for specific client as JSON string
   */
  getState(client_id: string): string | undefined;
  /**
   * Get local client's state as JSON string
   */
  getLocalState(): string | undefined;
  /**
   * Remove stale clients (timeout in milliseconds)
   * Returns JSON array of removed client IDs
   */
  removeStaleClients(timeout_ms: bigint): string;
  /**
   * Create update to signal leaving
   */
  createLeaveUpdate(): string;
  /**
   * Get number of online clients
   */
  clientCount(): number;
  /**
   * Get number of other clients (excluding self)
   */
  otherClientCount(): number;
}

export class WasmDocument {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Create a new document with the given ID
   */
  constructor(id: string);
  /**
   * Set a field value (pass JSON string for value)
   */
  setField(path: string, value_json: string, clock: bigint, client_id: string): void;
  /**
   * Get a field value (returns JSON string)
   */
  getField(path: string): string | undefined;
  /**
   * Delete a field
   */
  deleteField(path: string): void;
  /**
   * Get document ID
   */
  getId(): string;
  /**
   * Get field count
   */
  fieldCount(): number;
  /**
   * Export document as JSON string
   */
  toJSON(): string;
  /**
   * Merge with another document
   */
  merge(other: WasmDocument): void;
}

export class WasmVectorClock {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Create a new empty vector clock
   */
  constructor();
  /**
   * Increment clock for a client
   */
  tick(client_id: string): void;
  /**
   * Update clock for a client
   */
  update(client_id: string, clock: bigint): void;
  /**
   * Get clock value for a client
   */
  get(client_id: string): bigint;
  /**
   * Merge with another vector clock
   */
  merge(other: WasmVectorClock): void;
  /**
   * Export as JSON string
   */
  toJSON(): string;
}

/**
 * Initialize panic hook for better error messages in browser
 */
export function init_panic_hook(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_wasmdocument_free: (a: number, b: number) => void;
  readonly wasmdocument_new: (a: number, b: number) => number;
  readonly wasmdocument_setField: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint, h: number, i: number) => void;
  readonly wasmdocument_getField: (a: number, b: number, c: number, d: number) => void;
  readonly wasmdocument_deleteField: (a: number, b: number, c: number) => void;
  readonly wasmdocument_getId: (a: number, b: number) => void;
  readonly wasmdocument_toJSON: (a: number, b: number) => void;
  readonly wasmdocument_merge: (a: number, b: number) => void;
  readonly __wbg_wasmvectorclock_free: (a: number, b: number) => void;
  readonly wasmvectorclock_new: () => number;
  readonly wasmvectorclock_tick: (a: number, b: number, c: number) => void;
  readonly wasmvectorclock_update: (a: number, b: number, c: number, d: bigint) => void;
  readonly wasmvectorclock_get: (a: number, b: number, c: number) => bigint;
  readonly wasmvectorclock_merge: (a: number, b: number) => void;
  readonly wasmvectorclock_toJSON: (a: number, b: number) => void;
  readonly __wbg_wasmawareness_free: (a: number, b: number) => void;
  readonly wasmawareness_new: (a: number, b: number) => number;
  readonly wasmawareness_getClientId: (a: number, b: number) => void;
  readonly wasmawareness_setLocalState: (a: number, b: number, c: number, d: number) => void;
  readonly wasmawareness_applyUpdate: (a: number, b: number, c: number, d: number) => void;
  readonly wasmawareness_getStates: (a: number, b: number) => void;
  readonly wasmawareness_getState: (a: number, b: number, c: number, d: number) => void;
  readonly wasmawareness_getLocalState: (a: number, b: number) => void;
  readonly wasmawareness_removeStaleClients: (a: number, b: number, c: bigint) => void;
  readonly wasmawareness_createLeaveUpdate: (a: number, b: number) => void;
  readonly wasmawareness_clientCount: (a: number) => number;
  readonly wasmawareness_otherClientCount: (a: number) => number;
  readonly wasmdocument_fieldCount: (a: number) => number;
  readonly init_panic_hook: () => void;
  readonly __wbindgen_export: (a: number, b: number, c: number) => void;
  readonly __wbindgen_export2: (a: number, b: number) => number;
  readonly __wbindgen_export3: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
