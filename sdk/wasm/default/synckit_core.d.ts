/* tslint:disable */
/* eslint-disable */

/**
 * JavaScript-friendly wrapper for Awareness
 */
export class WasmAwareness {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Apply remote awareness update (pass JSON string)
     */
    applyUpdate(update_json: string): void;
    /**
     * Get number of online clients
     */
    clientCount(): number;
    /**
     * Create update to signal leaving
     */
    createLeaveUpdate(): string;
    /**
     * Get the local client ID
     */
    getClientId(): string;
    /**
     * Get local client's state as JSON string
     */
    getLocalState(): string | undefined;
    /**
     * Get state for specific client as JSON string
     */
    getState(client_id: string): string | undefined;
    /**
     * Get all client states as JSON string
     */
    getStates(): string;
    /**
     * Create a new awareness instance
     */
    constructor(client_id: string);
    /**
     * Get number of other clients (excluding self)
     */
    otherClientCount(): number;
    /**
     * Remove stale clients (timeout in milliseconds)
     * Returns JSON array of removed client IDs
     */
    removeStaleClients(timeout_ms: bigint): string;
    /**
     * Set local client state (pass JSON string)
     */
    setLocalState(state_json: string): string;
}

/**
 * JavaScript-friendly wrapper for PNCounter CRDT
 * Only available when counters feature is enabled
 */
export class WasmCounter {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Decrement the counter
     *
     * # Arguments
     * * `amount` - Amount to decrement (defaults to 1 if not provided)
     */
    decrement(amount?: number | null): void;
    /**
     * Import from JSON string
     */
    static fromJSON(json: string): WasmCounter;
    /**
     * Get the replica ID
     */
    getReplicaId(): string;
    /**
     * Increment the counter
     *
     * # Arguments
     * * `amount` - Amount to increment (defaults to 1 if not provided)
     */
    increment(amount?: number | null): void;
    /**
     * Merge with another counter
     */
    merge(other: WasmCounter): void;
    /**
     * Create a new PNCounter with the given replica ID
     */
    constructor(replica_id: string);
    /**
     * Reset the counter to zero (local operation)
     */
    reset(): void;
    /**
     * Export as JSON string
     */
    toJSON(): string;
    /**
     * Get the current counter value
     */
    value(): number;
}

/**
 * JavaScript-friendly wrapper for DocumentDelta
 * Only available when protocol support is enabled (core variant, not core-lite)
 */
export class WasmDelta {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Apply delta to a document
     */
    applyTo(document: WasmDocument, client_id: string): void;
    /**
     * Get number of changes in this delta
     */
    changeCount(): number;
    /**
     * Compute delta between two documents
     */
    static compute(from: WasmDocument, to: WasmDocument): WasmDelta;
    /**
     * Get document ID this delta applies to
     */
    getDocumentId(): string;
    /**
     * Export as JSON string
     */
    toJSON(): string;
}

/**
 * JavaScript-friendly wrapper for Document
 */
export class WasmDocument {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Delete a field
     */
    deleteField(path: string): void;
    /**
     * Get field count
     */
    fieldCount(): number;
    /**
     * Get a field value (returns JSON string)
     */
    getField(path: string): string | undefined;
    /**
     * Get document ID
     */
    getId(): string;
    /**
     * Merge with another document
     */
    merge(other: WasmDocument): void;
    /**
     * Create a new document with the given ID
     */
    constructor(id: string);
    /**
     * Set a field value (pass JSON string for value)
     */
    setField(path: string, value_json: string, clock: bigint, client_id: string): void;
    /**
     * Export document as JSON string
     */
    toJSON(): string;
}

/**
 * JavaScript-friendly wrapper for FugueText CRDT
 * Only available when text-crdt feature is enabled
 */
export class WasmFugueText {
    free(): void;
    [Symbol.dispose](): void;
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
     * Import from JSON string (for loading from persistence/network)
     */
    static fromJSON(json: string): WasmFugueText;
    /**
     * Get the client ID
     */
    getClientId(): string;
    /**
     * Get the current Lamport clock value
     */
    getClock(): bigint;
    /**
     * Get the NodeId of the character at the given position
     *
     * Returns a stable NodeId that identifies the character at the specified
     * position. Critical for Peritext format spans that need stable character
     * identifiers that don't shift when text is edited.
     *
     * # Arguments
     * * `position` - Grapheme index of the character
     *
     * # Returns
     * JSON string of NodeId (format: {client_id, clock, offset})
     *
     * # Example
     * ```javascript
     * const text = new WasmFugueText("client1");
     * text.insert(0, "Hello");
     * const nodeId = text.getNodeIdAtPosition(2);
     * // Returns: '{"client_id":"client1","clock":1,"offset":2}'
     * ```
     */
    getNodeIdAtPosition(position: number): string;
    /**
     * Get the current position of a character identified by NodeId
     *
     * This is the reverse of `getNodeIdAtPosition`. Given a stable NodeId,
     * returns the character's current position in the text. Returns -1 if
     * the character doesn't exist (e.g., was deleted).
     *
     * # Arguments
     * * `node_id_json` - JSON string of NodeId (format: {client_id, clock, offset})
     *
     * # Returns
     * Current position (0-based index), or -1 if character doesn't exist
     *
     * # Example
     * ```javascript
     * const nodeId = '{"client_id":"client1","clock":1,"offset":2}';
     * const position = text.getPositionOfNodeId(nodeId);
     * // Returns: 2 (or -1 if deleted)
     * ```
     */
    getPositionOfNodeId(node_id_json: string): number;
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
     * Check if the text is empty
     */
    isEmpty(): boolean;
    /**
     * Get the length in graphemes (user-perceived characters)
     */
    length(): number;
    /**
     * Merge with another FugueText
     */
    merge(other: WasmFugueText): void;
    /**
     * Create a new FugueText with the given client ID
     */
    constructor(client_id: string);
    /**
     * Export as JSON string (for persistence/network)
     */
    toJSON(): string;
    /**
     * Get the text content as a string
     */
    toString(): string;
}

/**
 * JavaScript-friendly wrapper for ORSet CRDT
 * Only available when sets feature is enabled
 */
export class WasmSet {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Add an element to the set
     *
     * # Arguments
     * * `value` - Element to add
     */
    add(value: string): void;
    /**
     * Clear all elements from the set
     */
    clear(): void;
    /**
     * Import from JSON string
     */
    static fromJSON(json: string): WasmSet;
    /**
     * Check if the set contains an element
     *
     * # Arguments
     * * `value` - Element to check
     */
    has(value: string): boolean;
    /**
     * Check if the set is empty
     */
    isEmpty(): boolean;
    /**
     * Merge with another set
     */
    merge(other: WasmSet): void;
    /**
     * Create a new ORSet with the given replica ID
     */
    constructor(replica_id: string);
    /**
     * Remove an element from the set
     *
     * # Arguments
     * * `value` - Element to remove
     */
    remove(value: string): void;
    /**
     * Get the number of elements in the set
     */
    size(): number;
    /**
     * Export as JSON string
     */
    toJSON(): string;
    /**
     * Get all values in the set as a JSON array string
     */
    values(): string;
}

/**
 * JavaScript-friendly wrapper for VectorClock
 */
export class WasmVectorClock {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get clock value for a client
     */
    get(client_id: string): bigint;
    /**
     * Merge with another vector clock
     */
    merge(other: WasmVectorClock): void;
    /**
     * Create a new empty vector clock
     */
    constructor();
    /**
     * Increment clock for a client
     */
    tick(client_id: string): void;
    /**
     * Export as JSON string
     */
    toJSON(): string;
    /**
     * Update clock for a client
     */
    update(client_id: string, clock: bigint): void;
}

/**
 * Initialize panic hook for better error messages in browser
 */
export function init_panic_hook(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmawareness_free: (a: number, b: number) => void;
    readonly __wbg_wasmcounter_free: (a: number, b: number) => void;
    readonly __wbg_wasmdelta_free: (a: number, b: number) => void;
    readonly __wbg_wasmdocument_free: (a: number, b: number) => void;
    readonly __wbg_wasmfuguetext_free: (a: number, b: number) => void;
    readonly __wbg_wasmset_free: (a: number, b: number) => void;
    readonly __wbg_wasmvectorclock_free: (a: number, b: number) => void;
    readonly wasmawareness_applyUpdate: (a: number, b: number, c: number, d: number) => void;
    readonly wasmawareness_clientCount: (a: number) => number;
    readonly wasmawareness_createLeaveUpdate: (a: number, b: number) => void;
    readonly wasmawareness_getClientId: (a: number, b: number) => void;
    readonly wasmawareness_getLocalState: (a: number, b: number) => void;
    readonly wasmawareness_getState: (a: number, b: number, c: number, d: number) => void;
    readonly wasmawareness_getStates: (a: number, b: number) => void;
    readonly wasmawareness_new: (a: number, b: number) => number;
    readonly wasmawareness_otherClientCount: (a: number) => number;
    readonly wasmawareness_removeStaleClients: (a: number, b: number, c: bigint) => void;
    readonly wasmawareness_setLocalState: (a: number, b: number, c: number, d: number) => void;
    readonly wasmcounter_decrement: (a: number, b: number, c: number) => void;
    readonly wasmcounter_fromJSON: (a: number, b: number, c: number) => void;
    readonly wasmcounter_getReplicaId: (a: number, b: number) => void;
    readonly wasmcounter_increment: (a: number, b: number, c: number) => void;
    readonly wasmcounter_merge: (a: number, b: number) => void;
    readonly wasmcounter_new: (a: number, b: number) => number;
    readonly wasmcounter_reset: (a: number) => void;
    readonly wasmcounter_toJSON: (a: number, b: number) => void;
    readonly wasmcounter_value: (a: number) => number;
    readonly wasmdelta_applyTo: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly wasmdelta_changeCount: (a: number) => number;
    readonly wasmdelta_compute: (a: number, b: number, c: number) => void;
    readonly wasmdelta_getDocumentId: (a: number, b: number) => void;
    readonly wasmdelta_toJSON: (a: number, b: number) => void;
    readonly wasmdocument_deleteField: (a: number, b: number, c: number) => void;
    readonly wasmdocument_fieldCount: (a: number) => number;
    readonly wasmdocument_getField: (a: number, b: number, c: number, d: number) => void;
    readonly wasmdocument_getId: (a: number, b: number) => void;
    readonly wasmdocument_merge: (a: number, b: number) => void;
    readonly wasmdocument_new: (a: number, b: number) => number;
    readonly wasmdocument_setField: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint, h: number, i: number) => void;
    readonly wasmdocument_toJSON: (a: number, b: number) => void;
    readonly wasmfuguetext_delete: (a: number, b: number, c: number, d: number) => void;
    readonly wasmfuguetext_fromJSON: (a: number, b: number, c: number) => void;
    readonly wasmfuguetext_getClientId: (a: number, b: number) => void;
    readonly wasmfuguetext_getClock: (a: number) => bigint;
    readonly wasmfuguetext_getNodeIdAtPosition: (a: number, b: number, c: number) => void;
    readonly wasmfuguetext_getPositionOfNodeId: (a: number, b: number, c: number, d: number) => void;
    readonly wasmfuguetext_insert: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly wasmfuguetext_isEmpty: (a: number) => number;
    readonly wasmfuguetext_length: (a: number) => number;
    readonly wasmfuguetext_merge: (a: number, b: number, c: number) => void;
    readonly wasmfuguetext_new: (a: number, b: number) => number;
    readonly wasmfuguetext_toJSON: (a: number, b: number) => void;
    readonly wasmfuguetext_toString: (a: number, b: number) => void;
    readonly wasmset_add: (a: number, b: number, c: number) => void;
    readonly wasmset_clear: (a: number) => void;
    readonly wasmset_fromJSON: (a: number, b: number, c: number) => void;
    readonly wasmset_has: (a: number, b: number, c: number) => number;
    readonly wasmset_isEmpty: (a: number) => number;
    readonly wasmset_merge: (a: number, b: number) => void;
    readonly wasmset_new: (a: number, b: number) => number;
    readonly wasmset_remove: (a: number, b: number, c: number) => void;
    readonly wasmset_size: (a: number) => number;
    readonly wasmset_toJSON: (a: number, b: number) => void;
    readonly wasmset_values: (a: number, b: number) => void;
    readonly wasmvectorclock_get: (a: number, b: number, c: number) => bigint;
    readonly wasmvectorclock_merge: (a: number, b: number) => void;
    readonly wasmvectorclock_new: () => number;
    readonly wasmvectorclock_tick: (a: number, b: number, c: number) => void;
    readonly wasmvectorclock_toJSON: (a: number, b: number) => void;
    readonly wasmvectorclock_update: (a: number, b: number, c: number, d: bigint) => void;
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
