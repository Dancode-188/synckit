import { Hono } from 'hono';
import { generateTokens, verifyToken } from '../auth/jwt';
import { createUserPermissions, createAdminPermissions } from '../auth/rbac';
import { authMiddleware, getUser } from '../auth/middleware';

const auth = new Hono();

/**
 * POST /auth/login - Login endpoint (demo - no real user DB)
 * 
 * In production, this would:
 * 1. Validate credentials against database
 * 2. Hash/verify password
 * 3. Lookup user permissions
 * 4. Generate tokens
 */
auth.post('/login', async (c) => {
  const body = await c.req.json();
  const { email, password, permissions } = body;
  
  if (!email || !password) {
    return c.json({ error: 'Email and password required' }, 400);
  }
  
  // Demo auth - accept any email/password
  // In production: validate against database
  console.log(`Login attempt: ${email}`);
  
  // Generate user ID (in production: from database)
  const userId = `user-${Date.now()}`;
  
  // Create permissions (in production: from database)
  const userPermissions = permissions?.isAdmin 
    ? createAdminPermissions()
    : createUserPermissions(
        permissions?.canRead || [],
        permissions?.canWrite || []
      );
  
  // Generate tokens
  const tokens = generateTokens(userId, email, userPermissions);
  
  return c.json({
    userId,
    email,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    permissions: userPermissions,
  });
});

/**
 * POST /auth/refresh - Refresh access token
 */
auth.post('/refresh', async (c) => {
  const body = await c.req.json();
  const { refreshToken } = body;
  
  if (!refreshToken) {
    return c.json({ error: 'Refresh token required' }, 400);
  }
  
  // Verify refresh token
  const payload = verifyToken(refreshToken);
  
  if (!payload) {
    return c.json({ error: 'Invalid or expired refresh token' }, 401);
  }
  
  // In production: lookup user from database
  // For demo: recreate with same permissions
  const tokens = generateTokens(
    payload.userId,
    payload.email || '',
    payload.permissions
  );
  
  return c.json({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
});

/**
 * GET /auth/me - Get current user info
 */
auth.get('/me', authMiddleware, async (c) => {
  const user = getUser(c);
  
  return c.json({
    userId: user!.userId,
    email: user!.email,
    permissions: user!.permissions,
  });
});

/**
 * POST /auth/verify - Verify token validity
 */
auth.post('/verify', async (c) => {
  const body = await c.req.json();
  const { token } = body;
  
  if (!token) {
    return c.json({ error: 'Token required' }, 400);
  }
  
  const payload = verifyToken(token);
  
  if (!payload) {
    return c.json({ valid: false }, 200);
  }
  
  return c.json({ 
    valid: true,
    userId: payload.userId,
    expiresAt: payload.exp,
  });
});

export { auth };
