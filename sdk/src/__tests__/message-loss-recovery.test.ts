import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CrossTabSync, StateSnapshot } from '../sync/cross-tab';

describe('Message Loss Recovery', () => {
  let leader: CrossTabSync;
  let follower: CrossTabSync;
  let leaderState: StateSnapshot;
  let followerState: StateSnapshot;

  beforeEach(() => {
    vi.useFakeTimers();

    // Initialize leader state
    leaderState = {
      undoStack: [
        { type: 'insert', timestamp: 1000 },
        { type: 'format', timestamp: 2000 },
      ],
      redoStack: [],
      documentState: { version: 2 },
    };

    // Initialize follower state (will diverge)
    followerState = {
      undoStack: [
        { type: 'insert', timestamp: 1000 },
      ],
      redoStack: [],
      documentState: { version: 1 },
    };

    // Create leader with state provider
    leader = new CrossTabSync('doc-1', {
      enabled: false,
      stateProvider: () => leaderState,
    });

    // Create follower with state provider and restorer
    follower = new CrossTabSync('doc-1', {
      enabled: false,
      stateProvider: () => followerState,
      stateRestorer: (state: StateSnapshot) => {
        followerState = state;
      },
    });
  });

  afterEach(() => {
    leader.destroy();
    follower.destroy();
    vi.useRealTimers();
  });

  it('should detect state divergence via hash mismatch', () => {
    // Test the hash verification logic directly
    const leaderTab = new CrossTabSync('doc-1', {
      enabled: false,
      stateProvider: () => ({
        undoStack: [
          { type: 'insert', timestamp: 1000 },
          { type: 'format', timestamp: 2000 },
        ],
        redoStack: [],
        documentState: { version: 2 },
      }),
    });

    const followerTab = new CrossTabSync('doc-1', {
      enabled: false,
      stateProvider: () => ({
        undoStack: [
          { type: 'insert', timestamp: 1000 },
        ],
        redoStack: [],
        documentState: { version: 1 },
      }),
    });

    const leaderHash = (leaderTab as any).computeStateHash();
    const followerHash = (followerTab as any).computeStateHash();

    // Hashes should be different for diverged states
    expect(leaderHash).not.toBe(followerHash);
    expect(leaderHash).not.toBeNull();
    expect(followerHash).not.toBeNull();

    leaderTab.destroy();
    followerTab.destroy();
  });

  it('should restore follower state when applyFullState is called', () => {
    let restoredState: StateSnapshot | null = null;

    const followerTab = new CrossTabSync('doc-1', {
      enabled: false,
      stateProvider: () => followerState,
      stateRestorer: (state: StateSnapshot) => {
        restoredState = state;
      },
    });

    const newState: StateSnapshot = {
      undoStack: [
        { type: 'insert', timestamp: 1000 },
        { type: 'format', timestamp: 2000 },
      ],
      redoStack: [],
      documentState: { version: 2 },
    };

    // Call applyFullState directly
    (followerTab as any).applyFullState(newState);

    // State should have been restored
    expect(restoredState).toEqual(newState);

    followerTab.destroy();
  });

  it('should compute consistent hashes for identical states', () => {
    const state1: StateSnapshot = {
      undoStack: [{ type: 'insert', timestamp: 1000 }],
      redoStack: [],
      documentState: { version: 1 },
    };

    const state2: StateSnapshot = {
      undoStack: [{ type: 'insert', timestamp: 1000 }],
      redoStack: [],
      documentState: { version: 1 },
    };

    const tab1 = new CrossTabSync('doc-1', {
      enabled: false,
      stateProvider: () => state1,
    });

    const tab2 = new CrossTabSync('doc-1', {
      enabled: false,
      stateProvider: () => state2,
    });

    // Access private method via type assertion for testing
    const hash1 = (tab1 as any).computeStateHash();
    const hash2 = (tab2 as any).computeStateHash();

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBeNull();

    tab1.destroy();
    tab2.destroy();
  });

  it('should compute different hashes for diverged states', () => {
    const state1: StateSnapshot = {
      undoStack: [{ type: 'insert', timestamp: 1000 }],
      redoStack: [],
      documentState: { version: 1 },
    };

    const state2: StateSnapshot = {
      undoStack: [
        { type: 'insert', timestamp: 1000 },
        { type: 'format', timestamp: 2000 },
      ],
      redoStack: [],
      documentState: { version: 2 },
    };

    const tab1 = new CrossTabSync('doc-1', {
      enabled: false,
      stateProvider: () => state1,
    });

    const tab2 = new CrossTabSync('doc-1', {
      enabled: false,
      stateProvider: () => state2,
    });

    const hash1 = (tab1 as any).computeStateHash();
    const hash2 = (tab2 as any).computeStateHash();

    expect(hash1).not.toBe(hash2);
    expect(hash1).not.toBeNull();
    expect(hash2).not.toBeNull();

    tab1.destroy();
    tab2.destroy();
  });

  it('should handle missing state provider gracefully', () => {
    const tab = new CrossTabSync('doc-1', {
      enabled: false,
      // No state provider
    });

    const hash = (tab as any).computeStateHash();

    expect(hash).toBeNull();

    tab.destroy();
  });

  it('should only send full sync when leader receives request', () => {
    const leaderWithProvider = new CrossTabSync('doc-1', {
      enabled: false,
      stateProvider: () => leaderState,
    });

    const followerWithoutProvider = new CrossTabSync('doc-1', {
      enabled: false,
      // No state provider - cannot send full sync
    });

    let fullSyncSent = false;

    leaderWithProvider.on('full-sync-response', () => {
      fullSyncSent = true;
    });

    // Enable tabs
    leaderWithProvider.enable();
    followerWithoutProvider.enable();

    vi.advanceTimersByTime(200);

    // Try to trigger full sync from follower (should fail silently)
    (followerWithoutProvider as any).sendFullState('some-tab');

    expect(fullSyncSent).toBe(false);

    leaderWithProvider.destroy();
    followerWithoutProvider.destroy();
  });
});
