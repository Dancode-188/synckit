import type { Context, Next } from 'hono';
import { verifyToken, type TokenPayload } from './jwt';

/**
 * Auth middleware - validates JWT token from Authorization header
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader) {
    return c.json({ error: 'Missing Authorization header' }, 401);
  }
  
  // Extract token (format: "Bearer <token>")
  const [scheme, token] = authHeader.split(' ');
  
  if (scheme !== 'Bearer' || !token) {
    return c.json({ error: 'Invalid Authorization header format' }, 401);
  }
  
  // Verify token
  const payload = verifyToken(token);
  
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
  
  // Attach payload to context
  c.set('user', payload);
  
  await next();
}

/**
 * Optional auth middleware - doesn't fail if no token
 */
export async function optionalAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (authHeader) {
    const [scheme, token] = authHeader.split(' ');
    
    if (scheme === 'Bearer' && token) {
      const payload = verifyToken(token);
      if (payload) {
        c.set('user', payload);
      }
    }
  }
  
  await next();
}

/**
 * Get user from context
 */
export function getUser(c: Context): TokenPayload | undefined {
  return c.get('user');
}

/**
 * Require admin middleware
 */
export async function requireAdmin(c: Context, next: Next) {
  const user = getUser(c);
  
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  
  if (!user.permissions.isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }
  
  await next();
}
