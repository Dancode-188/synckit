/**
 * Security Middleware for Public Playground
 *
 * Implements multi-layer security for anonymous public access:
 * - Rate limiting (per IP, per connection)
 * - Input validation (size limits, type checking)
 * - Content sanitization (XSS protection)
 * - Document/block limits
 * - Playground vs private document separation
 */

import DOMPurify from 'isomorphic-dompurify';
import type { Context } from 'hono';

// ============================================================================
// Configuration
// ============================================================================

export const SECURITY_LIMITS = {
  // Rate limiting
  MAX_CONNECTIONS_PER_IP: 5,
  MAX_MESSAGES_PER_MINUTE: 500, // Increased for real-time collaborative editing

  // Document limits
  MAX_BLOCKS_PER_DOC: 1000,
  MAX_BLOCK_SIZE: 10_000, // 10KB per block
  MAX_DOC_SIZE: 10_485_760, // 10MB per document
  MAX_DOCS_PER_IP: 20,
  MAX_DOCS_PER_HOUR: 10,

  // Message limits
  MAX_MESSAGE_SIZE: 100_000, // 100KB per message

  // Playground document ID
  PLAYGROUND_DOC_ID: 'playground',
};

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Connection rate limiter
 * Tracks connections per IP address
 */
export class ConnectionLimiter {
  private connections = new Map<string, number>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup stale entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 300000);
  }

  /**
   * Check if IP can create new connection
   */
  canConnect(ip: string): boolean {
    const count = this.connections.get(ip) || 0;
    return count < SECURITY_LIMITS.MAX_CONNECTIONS_PER_IP;
  }

  /**
   * Increment connection count for IP
   */
  addConnection(ip: string): void {
    const count = this.connections.get(ip) || 0;
    this.connections.set(ip, count + 1);
  }

  /**
   * Decrement connection count for IP
   */
  removeConnection(ip: string): void {
    const count = this.connections.get(ip) || 0;
    if (count <= 1) {
      this.connections.delete(ip);
    } else {
      this.connections.set(ip, count - 1);
    }
  }

  /**
   * Cleanup zero-count entries
   */
  private cleanup(): void {
    for (const [ip, count] of this.connections.entries()) {
      if (count === 0) {
        this.connections.delete(ip);
      }
    }
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.connections.clear();
  }
}

/**
 * Message rate limiter
 * Tracks messages per IP per minute (sliding window)
 */
export class MessageRateLimiter {
  private messages = new Map<string, number[]>(); // IP -> timestamps
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup stale entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Check if IP can send message (within rate limit)
   */
  canSendMessage(ip: string): boolean {
    const now = Date.now();
    const timestamps = this.messages.get(ip) || [];

    // Remove messages older than 1 minute
    const recent = timestamps.filter(ts => now - ts < 60000);

    return recent.length < SECURITY_LIMITS.MAX_MESSAGES_PER_MINUTE;
  }

  /**
   * Record message sent by IP
   */
  recordMessage(ip: string): void {
    const now = Date.now();
    const timestamps = this.messages.get(ip) || [];

    // Add current timestamp
    timestamps.push(now);

    // Keep only last minute
    const recent = timestamps.filter(ts => now - ts < 60000);

    this.messages.set(ip, recent);
  }

  /**
   * Cleanup stale entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [ip, timestamps] of this.messages.entries()) {
      const recent = timestamps.filter(ts => now - ts < 60000);
      if (recent.length === 0) {
        this.messages.delete(ip);
      } else {
        this.messages.set(ip, recent);
      }
    }
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.messages.clear();
  }
}

// ============================================================================
// Document Limits Tracker
// ============================================================================

/**
 * Tracks document creation per IP
 */
export class DocumentLimiter {
  private documents = new Map<string, {
    total: number;
    hourly: { timestamp: number; count: number }[];
  }>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup stale entries every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 3600000);
  }

  /**
   * Check if IP can create document
   */
  canCreateDocument(ip: string): { allowed: boolean; reason?: string } {
    const data = this.documents.get(ip) || { total: 0, hourly: [] };

    // Check total limit
    if (data.total >= SECURITY_LIMITS.MAX_DOCS_PER_IP) {
      return {
        allowed: false,
        reason: `Maximum ${SECURITY_LIMITS.MAX_DOCS_PER_IP} documents per IP reached`,
      };
    }

    // Check hourly limit
    const now = Date.now();
    const lastHour = data.hourly.filter(h => now - h.timestamp < 3600000);
    const hourlyCount = lastHour.reduce((sum, h) => sum + h.count, 0);

    if (hourlyCount >= SECURITY_LIMITS.MAX_DOCS_PER_HOUR) {
      return {
        allowed: false,
        reason: `Maximum ${SECURITY_LIMITS.MAX_DOCS_PER_HOUR} documents per hour reached`,
      };
    }

    return { allowed: true };
  }

  /**
   * Record document creation
   */
  recordDocument(ip: string): void {
    const data = this.documents.get(ip) || { total: 0, hourly: [] };

    data.total += 1;

    // Add to hourly tracking
    const now = Date.now();
    data.hourly.push({ timestamp: now, count: 1 });

    // Keep only last hour
    data.hourly = data.hourly.filter(h => now - h.timestamp < 3600000);

    this.documents.set(ip, data);
  }

  /**
   * Cleanup stale entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [ip, data] of this.documents.entries()) {
      data.hourly = data.hourly.filter(h => now - h.timestamp < 3600000);
      if (data.hourly.length === 0 && data.total === 0) {
        this.documents.delete(ip);
      } else {
        this.documents.set(ip, data);
      }
    }
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.documents.clear();
  }
}

// ============================================================================
// Input Validation
// ============================================================================

/**
 * Validate WebSocket message
 */
export function validateMessage(message: any): { valid: boolean; error?: string } {
  // Check message exists
  if (!message || typeof message !== 'object') {
    return { valid: false, error: 'Invalid message format' };
  }

  // Check message size
  const messageSize = JSON.stringify(message).length;
  if (messageSize > SECURITY_LIMITS.MAX_MESSAGE_SIZE) {
    return {
      valid: false,
      error: `Message too large (${messageSize} bytes, max ${SECURITY_LIMITS.MAX_MESSAGE_SIZE})`,
    };
  }

  // Validate message type
  const validTypes = [
    'connect', // Initial connection message
    'auth',
    'subscribe',
    'unsubscribe',
    'sync_request',
    'delta',
    'ack',
    'awareness_subscribe',
    'awareness_update',
    'snapshot_request',
    'snapshot_upload',
    'ping', // WebSocket keep-alive
    'pong', // WebSocket keep-alive response
  ];

  if (!validTypes.includes(message.type)) {
    return {
      valid: false,
      error: `Invalid message type: ${message.type}`,
    };
  }

  // Note: We don't validate payload structure here because after binary parsing,
  // message fields are spread directly into the message object (no 'payload' field).
  // Specific field validation (documentId, delta, etc.) is done in message handlers.

  return { valid: true };
}

/**
 * Validate document ID (prevent injection)
 */
export function validateDocumentId(documentId: string): { valid: boolean; error?: string } {
  if (!documentId || typeof documentId !== 'string') {
    return { valid: false, error: 'Invalid document ID' };
  }

  // Length check
  if (documentId.length > 256) {
    return { valid: false, error: 'Document ID too long' };
  }

  // Character check (alphanumeric, dash, underscore, colon only)
  if (!/^[a-zA-Z0-9_:-]+$/.test(documentId)) {
    return {
      valid: false,
      error: 'Document ID contains invalid characters',
    };
  }

  return { valid: true };
}

/**
 * Validate block data
 */
export function validateBlock(block: any): { valid: boolean; error?: string } {
  if (!block || typeof block !== 'object') {
    return { valid: false, error: 'Invalid block format' };
  }

  // Check required fields
  if (!block.id || typeof block.id !== 'string') {
    return { valid: false, error: 'Block missing id' };
  }

  if (!block.type || typeof block.type !== 'string') {
    return { valid: false, error: 'Block missing type' };
  }

  // Check block size
  const blockSize = JSON.stringify(block).length;
  if (blockSize > SECURITY_LIMITS.MAX_BLOCK_SIZE) {
    return {
      valid: false,
      error: `Block too large (${blockSize} bytes, max ${SECURITY_LIMITS.MAX_BLOCK_SIZE})`,
    };
  }

  return { valid: true };
}

// ============================================================================
// Content Sanitization
// ============================================================================

/**
 * Sanitize text content (remove all HTML/scripts)
 */
export function sanitizeContent(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  // Remove all HTML tags and scripts
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [], // No HTML allowed in plain text
    ALLOWED_ATTR: [],
  });
}

/**
 * Sanitize rich text content (allow safe formatting only)
 */
export function sanitizeRichText(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Allow only safe formatting tags
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'em', 'strong', 'code', 'pre', 'a', 'br', 'p'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^https?:\/\//,
  });
}

// ============================================================================
// Document Access Control
// ============================================================================

/**
 * Check if document is playground
 */
export function isPlaygroundDocument(documentId: string): boolean {
  return documentId === SECURITY_LIMITS.PLAYGROUND_DOC_ID;
}

/**
 * Check if document is private room
 */
export function isPrivateRoom(documentId: string): boolean {
  return documentId.startsWith('room:');
}

/**
 * Extract room ID from document ID
 */
export function extractRoomId(documentId: string): string | null {
  if (!isPrivateRoom(documentId)) {
    return null;
  }
  return documentId.slice(5); // Remove 'room:' prefix
}

/**
 * Check if user can access document
 * For playground mode (no auth):
 * - Playground: everyone
 * - Private rooms: need room ID in URL (checked client-side)
 */
export function canAccessDocument(documentId: string): boolean {
  // Playground is always accessible
  if (isPlaygroundDocument(documentId)) {
    return true;
  }

  // Private rooms are accessible (client controls via URL)
  if (isPrivateRoom(documentId)) {
    return true;
  }

  // Block other document IDs (security)
  return false;
}

// ============================================================================
// CSP Headers
// ============================================================================

/**
 * Get Content Security Policy headers for Hono
 * Note: These are set on the WebSocket server but are primarily for any HTML endpoints.
 * The demo frontend (nginx) should set its own CSP headers for the actual app.
 */
export function getCSPHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // React needs unsafe-inline
      "style-src 'self' 'unsafe-inline'", // Tailwind needs unsafe-inline
      "img-src 'self' data: https:",
      "connect-src 'self' wss://synckit-localwrite.fly.dev wss://synckit-stress-test.fly.dev",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

// ============================================================================
// Global Security Manager
// ============================================================================

/**
 * Centralized security manager
 */
export class SecurityManager {
  public connectionLimiter: ConnectionLimiter;
  public messageRateLimiter: MessageRateLimiter;
  public documentLimiter: DocumentLimiter;

  constructor() {
    this.connectionLimiter = new ConnectionLimiter();
    this.messageRateLimiter = new MessageRateLimiter();
    this.documentLimiter = new DocumentLimiter();
  }

  /**
   * Dispose all limiters
   */
  dispose(): void {
    this.connectionLimiter.dispose();
    this.messageRateLimiter.dispose();
    this.documentLimiter.dispose();
  }
}

// ============================================================================
// Export global instance
// ============================================================================

export const securityManager = new SecurityManager();
