/**
 * Type definitions for Svelte adapter
 * Supports both Svelte 4 (stores) and Svelte 5 (runes)
 */

import type { Readable } from 'svelte/store';
import type { AwarenessState as CoreAwarenessState } from '../../../awareness';

/**
 * Base store shape that works with both Svelte 4 and 5
 */
export interface BaseStore<T> extends Readable<T> {
  subscribe: Readable<T>['subscribe'];
}

/**
 * Document store with rune support (Svelte 5) and store contract (Svelte 4)
 */
export interface SyncDocumentStore<T = any> extends BaseStore<T> {
  /** Rune-reactive data property (Svelte 5) */
  readonly data: T | undefined;

  /** Rune-reactive loading state (Svelte 5) */
  readonly loading: boolean;

  /** Rune-reactive error state (Svelte 5) */
  readonly error: Error | null;

  /** Update document data */
  update(updater: (data: T) => void): void;

  /** Refresh document from server */
  refresh(): Promise<void>;
}

/**
 * Text store for collaborative text editing
 */
export interface SyncTextStore extends BaseStore<string> {
  /** Rune-reactive text content (Svelte 5) */
  readonly text: string;

  /** Rune-reactive loading state (Svelte 5) */
  readonly loading: boolean;

  /** Rune-reactive error state (Svelte 5) */
  readonly error: Error | null;

  /** Insert text at position */
  insert(position: number, text: string): Promise<void>;

  /** Delete text range */
  delete(start: number, length: number): Promise<void>;

  /** Get text length */
  length(): number;
}

/**
 * Rich text store with Peritext formatting
 */
export interface RichTextStore extends BaseStore<string> {
  /** Rune-reactive text content (Svelte 5) */
  readonly text: string;

  /** Rune-reactive loading state (Svelte 5) */
  readonly loading: boolean;

  /** Rune-reactive error state (Svelte 5) */
  readonly error: Error | null;

  /** Format text range */
  format(start: number, end: number, attributes: Record<string, any>): Promise<void>;

  /** Remove formatting from text range */
  unformat(start: number, end: number, attributes: string[]): Promise<void>;

  /** Get formats at position */
  getFormats(position: number): Record<string, any>;

  /** Insert text at position */
  insert(position: number, text: string): Promise<void>;

  /** Delete text range */
  delete(start: number, end: number): Promise<void>;
}

/**
 * Re-export core awareness type
 */
export type AwarenessState = CoreAwarenessState;

/**
 * Presence store combining self and others
 */
export interface PresenceStore extends BaseStore<{
  self: AwarenessState | undefined;
  others: AwarenessState[];
}> {
  /** Rune-reactive self state (Svelte 5) */
  readonly self: AwarenessState | undefined;

  /** Rune-reactive others array (Svelte 5) */
  readonly others: AwarenessState[];

  /** Update local presence state */
  updatePresence(state: Record<string, any>): void;

  /** Get presence state by client ID */
  getPresence(clientId: string): AwarenessState | undefined;
}

/**
 * Others store (filtered to exclude self)
 */
export interface OthersStore extends BaseStore<AwarenessState[]> {
  /** Rune-reactive others array (Svelte 5) */
  readonly others: AwarenessState[];
}

/**
 * Self store (current user only)
 */
export interface SelfStore extends BaseStore<AwarenessState | undefined> {
  /** Rune-reactive self state (Svelte 5) */
  readonly self: AwarenessState | undefined;

  /** Update self state */
  update(state: Record<string, any>): void;
}

/**
 * Sync status state
 */
export interface SyncStatusState {
  online: boolean;
  syncing: boolean;
  lastSync: Date | null;
  errors: Error[];
}

/**
 * Sync status store for monitoring connection/sync state
 */
export interface SyncStatusStore extends BaseStore<SyncStatusState> {
  /** Rune-reactive online state (Svelte 5) */
  readonly online: boolean;

  /** Rune-reactive syncing state (Svelte 5) */
  readonly syncing: boolean;

  /** Rune-reactive last sync time (Svelte 5) */
  readonly lastSync: Date | null;

  /** Rune-reactive errors array (Svelte 5) */
  readonly errors: Error[];

  /** Retry failed sync */
  retry(): Promise<void>;
}

/**
 * Options for sync operations
 */
export interface SyncOptions {
  /** Auto-initialize on mount (default: true) */
  autoInit?: boolean;

  /** Retry on error (default: true) */
  retry?: boolean;

  /** Retry delay in ms (default: 1000) */
  retryDelay?: number;
}
