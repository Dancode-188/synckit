/* tslint:disable */
/* eslint-disable */

export class WasmDelta {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Compute delta between two documents
   */
  static compute(from: WasmDocument, to: WasmDocument): WasmDelta;
  /**
   * Apply delta to a document
   */
  applyTo(document: WasmDocument, client_id: string): void;
  /**
   * Get document ID this delta applies to
   */
  getDocumentId(): string;
  /**
   * Get number of changes in this delta
   */
  changeCount(): number;
  /**
   * Export as JSON string
   */
  toJSON(): string;
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

export class WasmFugueText {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Create a new FugueText with the given client ID
   */
  constructor(client_id: string);
  /**
   * Insert text at the given position
   *
   * # Arguments
   * * `position` - Grapheme index (user-facing position)
   * * `text` - Text to insert
   *
   * # Returns
   * JSON string of NodeId for the created block
   */
  insert(position: number, text: string): string;
  /**
   * Delete text at the given position
   *
   * # Arguments
   * * `position` - Starting grapheme index
   * * `length` - Number of graphemes to delete
   *
   * # Returns
   * JSON string of array of deleted NodeIds
   */
  delete(position: number, length: number): string;
  /**
   * Get the text content as a string
   */
  toString(): string;
  /**
   * Get the length in graphemes (user-perceived characters)
   */
  length(): number;
  /**
   * Check if the text is empty
   */
  isEmpty(): boolean;
  /**
   * Get the client ID
   */
  getClientId(): string;
  /**
   * Get the current Lamport clock value
   */
  getClock(): bigint;
  /**
   * Merge with another FugueText
   */
  merge(other: WasmFugueText): void;
  /**
   * Export as JSON string (for persistence/network)
   */
  toJSON(): string;
  /**
   * Import from JSON string (for loading from persistence/network)
   */
  static fromJSON(json: string): WasmFugueText;
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
  readonly wasmdocument_fieldCount: (a: number) => number;
  readonly wasmdocument_toJSON: (a: number, b: number) => void;
  readonly wasmdocument_merge: (a: number, b: number) => void;
  readonly __wbg_wasmvectorclock_free: (a: number, b: number) => void;
  readonly wasmvectorclock_new: () => number;
  readonly wasmvectorclock_tick: (a: number, b: number, c: number) => void;
  readonly wasmvectorclock_update: (a: number, b: number, c: number, d: bigint) => void;
  readonly wasmvectorclock_get: (a: number, b: number, c: number) => bigint;
  readonly wasmvectorclock_merge: (a: number, b: number) => void;
  readonly wasmvectorclock_toJSON: (a: number, b: number) => void;
  readonly __wbg_wasmdelta_free: (a: number, b: number) => void;
  readonly wasmdelta_compute: (a: number, b: number, c: number) => void;
  readonly wasmdelta_applyTo: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly wasmdelta_getDocumentId: (a: number, b: number) => void;
  readonly wasmdelta_changeCount: (a: number) => number;
  readonly wasmdelta_toJSON: (a: number, b: number) => void;
  readonly __wbg_wasmfuguetext_free: (a: number, b: number) => void;
  readonly wasmfuguetext_new: (a: number, b: number) => number;
  readonly wasmfuguetext_insert: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly wasmfuguetext_delete: (a: number, b: number, c: number, d: number) => void;
  readonly wasmfuguetext_toString: (a: number, b: number) => void;
  readonly wasmfuguetext_length: (a: number) => number;
  readonly wasmfuguetext_isEmpty: (a: number) => number;
  readonly wasmfuguetext_getClientId: (a: number, b: number) => void;
  readonly wasmfuguetext_getClock: (a: number) => bigint;
  readonly wasmfuguetext_merge: (a: number, b: number, c: number) => void;
  readonly wasmfuguetext_toJSON: (a: number, b: number) => void;
  readonly wasmfuguetext_fromJSON: (a: number, b: number, c: number) => void;
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
