/**
 * Mock BroadcastChannel for deterministic testing with fake timers
 *
 * Unlike the real BroadcastChannel which delivers messages asynchronously,
 * this mock delivers messages synchronously, making tests predictable.
 */

type MessageHandler = (event: MessageEvent) => void;

// Global registry of all mock channels by name
const channelRegistry = new Map<string, Set<MockBroadcastChannel>>();

export class MockBroadcastChannel implements BroadcastChannel {
  public onmessage: MessageHandler | null = null;
  public onmessageerror: ((event: MessageEvent) => void) | null = null;
  private closed = false;

  constructor(public readonly name: string) {
    // Register this channel
    if (!channelRegistry.has(name)) {
      channelRegistry.set(name, new Set());
    }
    channelRegistry.get(name)!.add(this);
  }

  postMessage(message: any): void {
    if (this.closed) {
      throw new DOMException('BroadcastChannel is closed', 'InvalidStateError');
    }

    // Deliver to all other channels with the same name (excluding self)
    const channels = channelRegistry.get(this.name);
    if (channels) {
      channels.forEach(channel => {
        if (channel !== this && !channel.closed && channel.onmessage) {
          // Create a MessageEvent-like object
          const event = {
            data: message,
            type: 'message',
            target: channel,
          } as unknown as MessageEvent;

          // Deliver synchronously
          channel.onmessage(event);
        }
      });
    }
  }

  close(): void {
    if (this.closed) return;

    this.closed = true;
    const channels = channelRegistry.get(this.name);
    if (channels) {
      channels.delete(this);
      if (channels.size === 0) {
        channelRegistry.delete(this.name);
      }
    }
  }

  addEventListener(): void {
    // Not implemented - we only use onmessage in our code
  }

  removeEventListener(): void {
    // Not implemented - we only use onmessage in our code
  }

  dispatchEvent(): boolean {
    // Not implemented
    return false;
  }
}

/**
 * Reset the mock registry between tests
 */
export function resetMockBroadcastChannel(): void {
  channelRegistry.clear();
}

/**
 * Install the mock globally for testing
 */
export function installMockBroadcastChannel(): void {
  (global as any).BroadcastChannel = MockBroadcastChannel;
}

/**
 * Restore the original BroadcastChannel (if it exists)
 */
export function restoreBroadcastChannel(original: any): void {
  if (original) {
    (global as any).BroadcastChannel = original;
  } else {
    delete (global as any).BroadcastChannel;
  }
}
