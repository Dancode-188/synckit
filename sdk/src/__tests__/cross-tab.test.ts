import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CrossTabSync, enableCrossTabSync } from '../sync/cross-tab';
import {
  installMockBroadcastChannel,
  resetMockBroadcastChannel,
  restoreBroadcastChannel,
} from './mocks/broadcast-channel';

describe('CrossTabSync', () => {
  let crossTab1: CrossTabSync;
  let crossTab2: CrossTabSync;
  let originalBroadcastChannel: any;

  beforeEach(() => {
    // Install mock BroadcastChannel for deterministic testing
    originalBroadcastChannel = (global as any).BroadcastChannel;
    installMockBroadcastChannel();

    // Create tabs with enabled:false to keep sequence numbers at 0
    // Tests will enable them as needed
    crossTab1 = new CrossTabSync('doc-1', { enabled: false });
    crossTab2 = new CrossTabSync('doc-1', { enabled: false });
  });

  afterEach(() => {
    crossTab1.destroy();
    crossTab2.destroy();

    // Clean up mocks
    resetMockBroadcastChannel();
    restoreBroadcastChannel(originalBroadcastChannel);
  });

  describe('Basic Messaging', () => {
    it('should broadcast messages to other tabs', async () => {
      crossTab1.enable();
      crossTab2.enable();

      const messagePromise = new Promise<void>((resolve) => {
        crossTab2.on('test', (message: any) => {
          if (message.type === 'test') {
            expect(message.type).toBe('test');
            resolve();
          }
        });
      });

      crossTab1.broadcast({ type: 'test' } as any);
      await messagePromise;
    });

    it('should not receive own messages', async () => {
      crossTab1.enable();

      const handler = vi.fn();
      crossTab1.on('test', handler);

      crossTab1.broadcast({ type: 'test' } as any);

      // Wait a bit to ensure no message received
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(handler).not.toHaveBeenCalled();
    });

    it('should include correct metadata in messages', async () => {
      crossTab1.enable();
      crossTab2.enable();

      const messagePromise = new Promise<void>((resolve) => {
        crossTab2.on('update', (message) => {
          expect(message.from).toBe(crossTab1.getTabId());
          // Seq is 2 because enable() sent tab-joined (seq 0) and election (seq 1) first
          expect(message.seq).toBe(2);
          expect(message.timestamp).toBeGreaterThan(0);
          resolve();
        });
      });

      crossTab1.broadcast({
        type: 'update',
        documentId: 'doc-1',
        data: { test: true },
      } as any);

      await messagePromise;
    });

    it('should increment sequence numbers', async () => {
      // Enable tab1 first
      crossTab1.enable();

      // Set up handler BEFORE enabling tab2
      const receivedMessages: any[] = [];

      crossTab2.on('test', (message: any) => {
        receivedMessages.push(message);
      });

      // Now enable tab2
      crossTab2.enable();

      // Small delay to let enable() complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Broadcast test messages
      crossTab1.broadcast({ type: 'test', data: 'first' } as any);
      crossTab1.broadcast({ type: 'test', data: 'second' } as any);

      // Wait for messages to be received
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify we received exactly 2 messages
      expect(receivedMessages.length).toBe(2);

      // Verify sequence numbers incremented
      expect(receivedMessages[1].seq).toBe(receivedMessages[0].seq + 1);
    });
  });

  describe('Message Handlers', () => {
    it('should support multiple handlers for same message type', async () => {
      crossTab1.enable();
      crossTab2.enable();

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      crossTab2.on('test', handler1);
      crossTab2.on('test', handler2);

      crossTab1.broadcast({ type: 'test' } as any);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
    });

    it('should support wildcard handlers', async () => {
      const wildcardHandler = vi.fn();
      crossTab2.on('*', wildcardHandler);

      crossTab1.enable();
      crossTab2.enable();

      crossTab1.broadcast({ type: 'test' } as any);

      await new Promise((resolve) => setTimeout(resolve, 50));
      // Wildcard receives all messages from crossTab1, including possible election responses
      expect(wildcardHandler.mock.calls.length).toBeGreaterThanOrEqual(1);

      // Verify it received the test message
      const testMessages = wildcardHandler.mock.calls.filter(
        ([msg]: any[]) => msg.type === 'test'
      );
      expect(testMessages).toHaveLength(1);
    });

    it('should remove specific handler with off()', async () => {
      crossTab1.enable();
      crossTab2.enable();

      const handler = vi.fn();

      crossTab2.on('test', handler);
      crossTab2.off('test', handler);

      crossTab1.broadcast({ type: 'test' } as any);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(handler).not.toHaveBeenCalled();
    });

    it('should remove all handlers with removeAllListeners()', async () => {
      crossTab1.enable();
      crossTab2.enable();

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      crossTab2.on('test', handler1);
      crossTab2.on('test', handler2);
      crossTab2.removeAllListeners('test');

      crossTab1.broadcast({ type: 'test' } as any);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('Enable/Disable', () => {
    it('should not broadcast when disabled', async () => {
      crossTab2.enable();

      const handler = vi.fn();
      crossTab2.on('test', handler);

      // crossTab1 is disabled by default
      crossTab1.broadcast({ type: 'test' } as any);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(handler).not.toHaveBeenCalled();
    });

    it('should broadcast again after re-enabling', async () => {
      crossTab2.enable();

      // crossTab1 starts disabled, so enable it
      crossTab1.enable();

      const messagePromise = new Promise<void>((resolve) => {
        crossTab2.on('test', (message: any) => {
          expect(message.type).toBe('test');
          resolve();
        });
      });

      crossTab1.broadcast({ type: 'test' } as any);
      await messagePromise;
    });

    it('should announce presence when enabling', async () => {
      crossTab1.enable();

      const newTab = new CrossTabSync('doc-1', { enabled: false });

      const messagePromise = new Promise<void>((resolve) => {
        crossTab1.on('tab-joined', (message) => {
          if (message.type === 'tab-joined' && message.from === newTab.getTabId()) {
            expect(message.from).toBe(newTab.getTabId());
            newTab.destroy();
            resolve();
          }
        });
      });

      newTab.enable();
      await messagePromise;
    });
  });

  describe('Tab Management', () => {
    it('should announce presence on creation', async () => {
      crossTab1.enable();

      const messagePromise = new Promise<void>((resolve) => {
        crossTab1.on('tab-joined', (message) => {
          if (message.type === 'tab-joined') {
            expect(message.from).toBeDefined();
            resolve();
          }
        });
      });

      const newTab = new CrossTabSync('doc-1');
      await messagePromise;
      newTab.destroy();
    });

    it('should announce leaving on disable', async () => {
      crossTab1.enable();
      crossTab2.enable();

      // Wait for tabs to fully enable
      await new Promise((resolve) => setTimeout(resolve, 50));

      const messagePromise = new Promise<void>((resolve) => {
        crossTab2.on('tab-leaving', (message) => {
          if (message.type === 'tab-leaving' && message.from === crossTab1.getTabId()) {
            expect(message.from).toBe(crossTab1.getTabId());
            resolve();
          }
        });
      });

      crossTab1.disable();
      await messagePromise;
    });
  });

  describe('Error Handling', () => {
    it('should throw error if BroadcastChannel not supported', () => {
      const originalBroadcastChannel = global.BroadcastChannel;
      delete (global as any).BroadcastChannel;

      expect(() => {
        new CrossTabSync('doc-1');
      }).toThrow('BroadcastChannel not supported');

      global.BroadcastChannel = originalBroadcastChannel;
    });

    it('should catch errors in message handlers', async () => {
      crossTab1.enable();
      crossTab2.enable();

      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      crossTab2.on('test', errorHandler);

      crossTab1.broadcast({ type: 'test' } as any);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(errorHandler).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('Helper Function', () => {
    it('should create CrossTabSync instance with enableCrossTabSync', () => {
      const crossTab = enableCrossTabSync('doc-1');

      expect(crossTab).toBeInstanceOf(CrossTabSync);
      expect(crossTab.getDocumentId()).toBe('doc-1');

      crossTab.destroy();
    });

    it('should accept options in enableCrossTabSync', () => {
      const crossTab = enableCrossTabSync('doc-1', { enabled: false });

      expect(crossTab.isActive()).toBe(false);

      crossTab.destroy();
    });
  });

  describe('Cleanup', () => {
    it('should clean up on destroy', async () => {
      crossTab1.enable();
      crossTab2.enable();

      const handler = vi.fn();
      crossTab2.on('test', handler);

      crossTab1.destroy();
      crossTab1.broadcast({ type: 'test' } as any);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(handler).not.toHaveBeenCalled();
    });

    it('should clear all handlers on destroy', () => {
      crossTab1.enable();

      crossTab1.on('test', vi.fn());
      crossTab1.on('update', vi.fn());

      crossTab1.destroy();

      // Access private handlers via type assertion for testing
      expect((crossTab1 as any).handlers.size).toBe(0);
    });
  });

  describe('Tab ID Generation', () => {
    it('should generate unique tab IDs', () => {
      const tab1 = new CrossTabSync('doc-1');
      const tab2 = new CrossTabSync('doc-1');

      expect(tab1.getTabId()).not.toBe(tab2.getTabId());

      tab1.destroy();
      tab2.destroy();
    });

    it('should use crypto.randomUUID if available', () => {
      const mockUUID = '123e4567-e89b-12d3-a456-426614174000';
      const originalRandomUUID = crypto.randomUUID;
      crypto.randomUUID = vi.fn(() => mockUUID) as any;

      const tab = new CrossTabSync('doc-1');
      expect(tab.getTabId()).toBe(mockUUID);

      crypto.randomUUID = originalRandomUUID;
      tab.destroy();
    });
  });
});
