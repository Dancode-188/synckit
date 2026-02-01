import { describe, test, expect } from 'bun:test';
import {
  canAccessDocument,
  ConnectionRateLimiter,
  SECURITY_LIMITS,
} from '../../src/security/middleware';

describe('canAccessDocument', () => {
  test('should allow playground documents', () => {
    expect(canAccessDocument('playground')).toBe(true);
    expect(canAccessDocument('playground:text:block-1')).toBe(true);
  });

  test('should allow room documents', () => {
    expect(canAccessDocument('room:abc123')).toBe(true);
    expect(canAccessDocument('room:abc123:text:block-1')).toBe(true);
  });

  test('should allow wordwall documents', () => {
    expect(canAccessDocument('wordwall')).toBe(true);
    expect(canAccessDocument('wordwall:child')).toBe(true);
  });

  test('should allow page documents (timestamp IDs)', () => {
    expect(canAccessDocument('1769512101803')).toBe(true);
    expect(canAccessDocument('1769512101803:text:block-1')).toBe(true);
  });

  test('should block unknown document patterns', () => {
    expect(canAccessDocument('secret')).toBe(false);
    expect(canAccessDocument('admin:config')).toBe(false);
  });
});

describe('ConnectionRateLimiter', () => {
  test('should allow messages within limit', () => {
    const limiter = new ConnectionRateLimiter();

    for (let i = 0; i < 10; i++) {
      expect(limiter.canSendMessage('conn-1')).toBe(true);
      limiter.recordMessage('conn-1');
    }

    limiter.dispose();
  });

  test('should track connections independently', () => {
    const limiter = new ConnectionRateLimiter();

    // Fill up conn-1 near the limit
    for (let i = 0; i < SECURITY_LIMITS.MAX_MESSAGES_PER_MINUTE - 1; i++) {
      limiter.recordMessage('conn-1');
    }

    // conn-2 should still be allowed
    expect(limiter.canSendMessage('conn-2')).toBe(true);

    limiter.dispose();
  });

  test('should block messages exceeding limit', () => {
    const limiter = new ConnectionRateLimiter();

    for (let i = 0; i < SECURITY_LIMITS.MAX_MESSAGES_PER_MINUTE; i++) {
      limiter.recordMessage('conn-1');
    }

    expect(limiter.canSendMessage('conn-1')).toBe(false);
    // Another connection is unaffected
    expect(limiter.canSendMessage('conn-2')).toBe(true);

    limiter.dispose();
  });

  test('should clean up removed connections', () => {
    const limiter = new ConnectionRateLimiter();

    limiter.recordMessage('conn-1');
    limiter.removeConnection('conn-1');

    // After removal, connection starts fresh
    expect(limiter.canSendMessage('conn-1')).toBe(true);

    limiter.dispose();
  });
});

describe('SECURITY_LIMITS', () => {
  test('should have word wall limits', () => {
    expect(SECURITY_LIMITS.WORDWALL_MAX_WORD_LENGTH).toBe(30);
    expect(SECURITY_LIMITS.WORDWALL_MAX_WORDS).toBe(200);
    expect(SECURITY_LIMITS.WORDWALL_SUBMISSION_COOLDOWN_MS).toBe(5000);
  });
});
