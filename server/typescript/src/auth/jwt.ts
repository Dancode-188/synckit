import jwt from 'jsonwebtoken';
import { config } from '../config';

/**
 * JWT Token Payload
 */
export interface TokenPayload {
  userId: string;
  email?: string;
  permissions: DocumentPermissions;
  iat?: number; // Issued at
  exp?: number; // Expiration
}

/**
 * Document-level permissions
 */
export interface DocumentPermissions {
  canRead: string[]; // Document IDs user can read
  canWrite: string[]; // Document IDs user can write
  isAdmin: boolean; // Admin has access to all documents
}

/**
 * Generate JWT access token
 */
export function generateAccessToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as any,
  });
}

/**
 * Generate JWT refresh token
 */
export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId }, config.jwtSecret, {
    expiresIn: config.jwtRefreshExpiresIn as any,
  });
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      // console.log('Token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      // console.log('Invalid token');
    }
    return null;
  }
}

/**
 * Decode token without verification (for debugging)
 */
export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Generate tokens for a user
 */
export function generateTokens(
  userId: string,
  email: string,
  permissions: DocumentPermissions
): { accessToken: string; refreshToken: string } {
  const accessToken = generateAccessToken({ userId, email, permissions });
  const refreshToken = generateRefreshToken(userId);
  
  return { accessToken, refreshToken };
}
