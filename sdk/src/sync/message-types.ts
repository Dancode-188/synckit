/**
 * Message types for cross-tab communication via BroadcastChannel
 */

/**
 * Base message structure for all cross-tab messages
 */
export interface BaseMessage {
  type: string;
  from: string;  // Tab ID
  seq: number;   // Sequence number
  timestamp: number;
}

/**
 * Document update message - broadcasts changes to other tabs
 */
export interface UpdateMessage extends BaseMessage {
  type: 'update';
  documentId: string;
  data: unknown;
}

/**
 * Leader election candidacy message
 */
export interface ElectionMessage extends BaseMessage {
  type: 'election';
  tabId: string;
  tabStartTime: number;
}

/**
 * Leader heartbeat message - sent periodically by leader
 */
export interface HeartbeatMessage extends BaseMessage {
  type: 'heartbeat';
  tabId: string;
  tabStartTime: number;
  stateHash?: string | null;
}

/**
 * Write request from follower to leader
 */
export interface WriteRequestMessage extends BaseMessage {
  type: 'write-request';
  documentId: string;
  state: unknown;
}

/**
 * Write acknowledgment from leader to follower
 */
export interface WriteAckMessage extends BaseMessage {
  type: 'write-ack';
  documentId: string;
  success: boolean;
  error?: string;
}

/**
 * Tab joined notification
 */
export interface TabJoinedMessage extends BaseMessage {
  type: 'tab-joined';
}

/**
 * Tab leaving notification
 */
export interface TabLeavingMessage extends BaseMessage {
  type: 'tab-leaving';
}

/**
 * Request full state sync from leader
 */
export interface RequestFullSyncMessage extends BaseMessage {
  type: 'request-full-sync';
  requesterId: string;
  targetLeaderId: string;
}

/**
 * Full state sync response from leader
 */
export interface FullSyncResponseMessage extends BaseMessage {
  type: 'full-sync-response';
  requesterId: string;
  state: {
    undoStack: any[];
    redoStack: any[];
    documentState?: any;
  };
}

/**
 * Text state message - broadcasts full CRDT state to other tabs
 *
 * IMPORTANT: This is the correct approach for cross-tab text sync.
 * Position-based operations (text-insert, text-delete) are fundamentally
 * broken because they create new CRDT nodes with different NodeIds,
 * causing merge corruption when syncing with remote devices.
 *
 * State-based sync ensures all tabs have identical CRDT structures.
 */
export interface TextStateMessage extends BaseMessage {
  type: 'text-state';
  documentId: string;
  state: string;  // JSON serialized Fugue CRDT state
  clientId: string;
}

/**
 * @deprecated Use TextStateMessage instead. Position-based operations
 * break CRDT node identity and cause merge corruption.
 */
export interface TextInsertMessage extends BaseMessage {
  type: 'text-insert';
  documentId: string;
  position: number;
  text: string;
}

/**
 * @deprecated Use TextStateMessage instead. Position-based operations
 * break CRDT node identity and cause merge corruption.
 */
export interface TextDeleteMessage extends BaseMessage {
  type: 'text-delete';
  documentId: string;
  position: number;
  length: number;
}

/**
 * Undo operation added - broadcasts new operation to other tabs
 */
export interface UndoAddMessage extends BaseMessage {
  type: 'undo-add';
  documentId: string;
  operation: any;
}

/**
 * Undo operation - broadcasts undo action to other tabs
 */
export interface UndoMessage extends BaseMessage {
  type: 'undo';
  documentId: string;
}

/**
 * Redo operation - broadcasts redo action to other tabs
 */
export interface RedoMessage extends BaseMessage {
  type: 'redo';
  documentId: string;
}

/**
 * Union type of all possible cross-tab messages
 */
export type CrossTabMessage =
  | UpdateMessage
  | ElectionMessage
  | HeartbeatMessage
  | WriteRequestMessage
  | WriteAckMessage
  | TabJoinedMessage
  | TabLeavingMessage
  | RequestFullSyncMessage
  | FullSyncResponseMessage
  | TextStateMessage
  | TextInsertMessage
  | TextDeleteMessage
  | UndoAddMessage
  | UndoMessage
  | RedoMessage;

/**
 * Message handler function type
 */
export type MessageHandler = (message: CrossTabMessage) => void;
