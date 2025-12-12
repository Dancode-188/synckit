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
 * Union type of all possible cross-tab messages
 */
export type CrossTabMessage =
  | UpdateMessage
  | ElectionMessage
  | HeartbeatMessage
  | WriteRequestMessage
  | WriteAckMessage
  | TabJoinedMessage
  | TabLeavingMessage;

/**
 * Message handler function type
 */
export type MessageHandler = (message: CrossTabMessage) => void;
