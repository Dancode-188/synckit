import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CrossTabSync } from '../sync/cross-tab';
import {
  installMockBroadcastChannel,
  resetMockBroadcastChannel,
  restoreBroadcastChannel,
} from './mocks/broadcast-channel';

describe('Leader Election', () => {
  let tab1: CrossTabSync;
  let tab2: CrossTabSync;
  let tab3: CrossTabSync;
  let originalBroadcastChannel: any;

  beforeEach(() => {
    vi.useFakeTimers();
    // Set a fixed system time for deterministic tabStartTime values
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    // Install mock BroadcastChannel for deterministic testing
    originalBroadcastChannel = (global as any).BroadcastChannel;
    installMockBroadcastChannel();
  });

  // Helper to create tabs with distinct timestamps (1ms apart)
  function createTab(docId: string, options?: any): CrossTabSync {
    const tab = new CrossTabSync(docId, options);
    // Advance system time by 1ms so next tab gets a later timestamp
    vi.advanceTimersByTime(1);
    return tab;
  }

  afterEach(() => {
    vi.useRealTimers();

    if (tab1) tab1.destroy();
    if (tab2) tab2.destroy();
    if (tab3) tab3.destroy();

    // Reset mock state and restore original BroadcastChannel
    resetMockBroadcastChannel();
    restoreBroadcastChannel(originalBroadcastChannel);
  });

  describe('Basic Election', () => {
    it('should elect first tab as leader', async () => {
      tab1 = createTab('doc-1', { enabled: false });
      tab1.enable();

      // Wait for election to complete
      await vi.advanceTimersByTimeAsync(200);

      expect(tab1.isCurrentLeader()).toBe(true);
      expect(tab1.getLeaderId()).toBe(tab1.getTabId());
    });

    it('should elect oldest tab as leader when multiple tabs exist', async () => {
      tab1 = createTab('doc-1', { enabled: false });
      tab1.enable();

      await vi.advanceTimersByTimeAsync(200);

      // Create second tab (newer)
      tab2 = createTab('doc-1', { enabled: false });
      tab2.enable();

      await vi.advanceTimersByTimeAsync(200);

      // Tab1 should be leader (oldest)
      expect(tab1.isCurrentLeader()).toBe(true);
      expect(tab2.isCurrentLeader()).toBe(false);
      expect(tab2.getLeaderId()).toBe(tab1.getTabId());
    });

    it('should maintain single leader across three tabs', async () => {
      tab1 = createTab('doc-1', { enabled: false });
      tab1.enable();

      await vi.advanceTimersByTimeAsync(200);

      tab2 = createTab('doc-1', { enabled: false });
      tab2.enable();

      await vi.advanceTimersByTimeAsync(200);

      tab3 = createTab('doc-1', { enabled: false });
      tab3.enable();

      await vi.advanceTimersByTimeAsync(200);

      // Only tab1 should be leader
      expect(tab1.isCurrentLeader()).toBe(true);
      expect(tab2.isCurrentLeader()).toBe(false);
      expect(tab3.isCurrentLeader()).toBe(false);

      // All tabs should agree on leader
      expect(tab1.getLeaderId()).toBe(tab1.getTabId());
      expect(tab2.getLeaderId()).toBe(tab1.getTabId());
      expect(tab3.getLeaderId()).toBe(tab1.getTabId());
    });
  });

  describe('Heartbeat Mechanism', () => {
    it('should send heartbeats when leader', async () => {
      tab1 = createTab('doc-1', {
        enabled: false,
        heartbeatInterval: 200, // Shorter interval for faster test
      });
      tab2 = createTab('doc-1', { enabled: false });

      tab1.enable();
      await vi.advanceTimersByTimeAsync(200);

      // Tab1 should be leader
      expect(tab1.isCurrentLeader()).toBe(true);

      const heartbeatHandler = vi.fn();
      tab2.on('heartbeat', heartbeatHandler);

      tab2.enable();
      await vi.advanceTimersByTimeAsync(200);

      // Wait for heartbeat (200ms interval)
      await vi.advanceTimersByTimeAsync(250);

      expect(heartbeatHandler).toHaveBeenCalled();
    });

    it('should detect leader failure and re-elect', async () => {
      tab1 = createTab('doc-1', {
        enabled: false,
        heartbeatInterval: 200,
        heartbeatTimeout: 500,
      });
      tab2 = createTab('doc-1', {
        enabled: false,
        heartbeatInterval: 200,
        heartbeatTimeout: 500,
      });

      tab1.enable();
      await vi.advanceTimersByTimeAsync(200);

      tab2.enable();
      await vi.advanceTimersByTimeAsync(200);

      // Tab1 should be leader
      expect(tab1.isCurrentLeader()).toBe(true);
      expect(tab2.isCurrentLeader()).toBe(false);
      expect(tab2.getLeaderId()).toBe(tab1.getTabId());

      // Destroy tab1 (leader dies)
      tab1.destroy();

      // Wait for liveness check (1000ms) + heartbeat timeout check
      await vi.advanceTimersByTimeAsync(1200);

      // Tab2 should become new leader
      expect(tab2.isCurrentLeader()).toBe(true);
      expect(tab2.getLeaderId()).toBe(tab2.getTabId());
    });
  });

  describe('Leader Election Events', () => {
    it('should emit leader-elected event when becoming leader', async () => {
      tab1 = createTab('doc-1', { enabled: false });

      const leaderElectedHandler = vi.fn();
      tab1.on('leader-elected', leaderElectedHandler);

      tab1.enable();
      await vi.advanceTimersByTimeAsync(200);

      expect(leaderElectedHandler).toHaveBeenCalledOnce();
      expect(tab1.isCurrentLeader()).toBe(true);
    });

    it('should not emit leader-elected when not becoming leader', async () => {
      tab1 = createTab('doc-1', { enabled: false });
      tab2 = createTab('doc-1', { enabled: false });

      tab1.enable();
      await vi.advanceTimersByTimeAsync(200);

      // Verify tab1 is leader
      expect(tab1.isCurrentLeader()).toBe(true);

      const leaderElectedHandler = vi.fn();
      tab2.on('leader-elected', leaderElectedHandler);

      tab2.enable();
      await vi.advanceTimersByTimeAsync(200);

      expect(leaderElectedHandler).not.toHaveBeenCalled();
      expect(tab2.isCurrentLeader()).toBe(false);
    });
  });

  describe('Leader Re-election', () => {
    it('should re-elect when leader leaves', async () => {
      tab1 = createTab('doc-1', {
        enabled: false,
        heartbeatTimeout: 500,
      });
      tab2 = createTab('doc-1', {
        enabled: false,
        heartbeatTimeout: 500,
      });

      tab1.enable();
      await vi.advanceTimersByTimeAsync(200);

      tab2.enable();
      await vi.advanceTimersByTimeAsync(200);

      // Tab1 is leader
      expect(tab1.isCurrentLeader()).toBe(true);
      expect(tab2.getLeaderId()).toBe(tab1.getTabId());

      // Leader leaves
      tab1.disable();

      // Wait for liveness check (1000ms) + election
      await vi.advanceTimersByTimeAsync(1200);

      // Tab2 should become leader
      expect(tab2.isCurrentLeader()).toBe(true);
    });

    it('should handle oldest tab joining late', async () => {
      // Create tab2 first
      vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));
      tab2 = createTab('doc-1', { enabled: false });
      const tab2StartTime = tab2.getTabStartTime();

      tab2.enable();
      await vi.advanceTimersByTimeAsync(200);

      // Tab2 becomes leader
      expect(tab2.isCurrentLeader()).toBe(true);

      // Create tab1 with earlier start time (simulate older tab)
      vi.setSystemTime(new Date('2024-01-01T11:59:00Z'));
      tab1 = createTab('doc-1', { enabled: false });
      const tab1StartTime = tab1.getTabStartTime();

      // Verify tab1 is older
      expect(tab1StartTime).toBeLessThan(tab2StartTime);

      vi.setSystemTime(new Date('2024-01-01T12:00:01Z'));
      tab1.enable();
      await vi.advanceTimersByTimeAsync(200);

      // Tab1 should become leader (older)
      expect(tab1.isCurrentLeader()).toBe(true);
      expect(tab2.isCurrentLeader()).toBe(false);
      expect(tab2.getLeaderId()).toBe(tab1.getTabId());
    });
  });

  describe('Edge Cases', () => {
    it('should handle enable/disable cycles', async () => {
      tab1 = createTab('doc-1', { enabled: false });

      tab1.enable();
      await vi.advanceTimersByTimeAsync(200);
      expect(tab1.isCurrentLeader()).toBe(true);

      tab1.disable();
      await vi.advanceTimersByTimeAsync(100);
      expect(tab1.isCurrentLeader()).toBe(false);

      tab1.enable();
      await vi.advanceTimersByTimeAsync(200);
      expect(tab1.isCurrentLeader()).toBe(true);
    });

    it('should clean up timers on destroy', async () => {
      tab1 = createTab('doc-1', { enabled: false });
      tab1.enable();

      await vi.advanceTimersByTimeAsync(200);

      const heartbeatHandler = vi.fn();
      tab1.on('heartbeat', heartbeatHandler);

      // Destroy tab
      tab1.destroy();

      // Advance time - no heartbeats should be sent
      await vi.advanceTimersByTimeAsync(5000);

      // Since tab is destroyed, it shouldn't receive any messages
      expect(tab1.isCurrentLeader()).toBe(false);
    });

    it('should handle rapid tab creation', async () => {
      const tabs: CrossTabSync[] = [];

      // Create 5 tabs rapidly
      for (let i = 0; i < 5; i++) {
        const tab = createTab('doc-1', { enabled: false });
        tabs.push(tab);
        tab.enable();
        await vi.advanceTimersByTimeAsync(10);
      }

      // Wait for election to settle
      await vi.advanceTimersByTimeAsync(500);

      // Exactly one tab should be leader
      const leaders = tabs.filter(tab => tab.isCurrentLeader());
      expect(leaders).toHaveLength(1);

      // All tabs should agree on the leader
      const leaderId = leaders[0]!.getTabId();
      tabs.forEach(tab => {
        expect(tab.getLeaderId()).toBe(leaderId);
      });

      // Cleanup
      tabs.forEach(tab => tab.destroy());
    });
  });

  describe('Heartbeat Configuration', () => {
    it('should use custom heartbeat interval', async () => {
      tab1 = createTab('doc-1', {
        enabled: false,
        heartbeatInterval: 150,
      });
      tab2 = createTab('doc-1', { enabled: false });

      tab1.enable();
      await vi.advanceTimersByTimeAsync(200);

      const heartbeatHandler = vi.fn();
      tab2.on('heartbeat', heartbeatHandler);

      tab2.enable();
      await vi.advanceTimersByTimeAsync(200);

      // Wait for first heartbeat (150ms interval)
      await vi.advanceTimersByTimeAsync(200);

      expect(heartbeatHandler.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('should use custom heartbeat timeout', async () => {
      tab1 = createTab('doc-1', {
        enabled: false,
        heartbeatInterval: 1000,
        heartbeatTimeout: 2000,
      });
      tab2 = createTab('doc-1', {
        enabled: false,
        heartbeatInterval: 1000,
        heartbeatTimeout: 2000,
      });

      tab1.enable();
      await vi.advanceTimersByTimeAsync(200);

      // Verify tab1 became leader
      expect(tab1.isCurrentLeader()).toBe(true);

      tab2.enable();
      await vi.advanceTimersByTimeAsync(200);

      // Tab1 should still be leader
      expect(tab1.isCurrentLeader()).toBe(true);

      // Destroy leader
      tab1.destroy();

      // Should detect failure after 2000ms timeout (plus liveness check interval)
      await vi.advanceTimersByTimeAsync(3200);

      expect(tab2.isCurrentLeader()).toBe(true);
    });
  });
});
