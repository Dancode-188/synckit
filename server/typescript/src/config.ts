import { z } from 'zod';

/**
 * Configuration schema with validation
 */
const configSchema = z.object({
  // Server
  port: z.number().int().positive().default(8080),
  host: z.string().default('0.0.0.0'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  
  // Database
  databaseUrl: z.string().url(),
  databasePoolMin: z.number().int().positive().default(2),
  databasePoolMax: z.number().int().positive().default(10),
  
  // Redis
  redisUrl: z.string().url(),
  redisChannelPrefix: z.string().default('synckit:'),
  
  // JWT
  jwtSecret: z.string().min(32),
  jwtExpiresIn: z.string().default('24h'),
  jwtRefreshExpiresIn: z.string().default('7d'),
  
  // WebSocket
  // Reduced from 30s to 10s to keep Fly.io proxy connections alive (4-min timeout)
  wsHeartbeatInterval: z.number().int().positive().default(10000), // 10s
  wsHeartbeatTimeout: z.number().int().positive().default(30000),  // 30s
  wsMaxConnections: z.number().int().positive().default(10000),
  
  // Sync
  syncBatchSize: z.number().int().positive().default(100),
  syncBatchDelay: z.number().int().positive().default(50), // 50ms
});

export type Config = z.infer<typeof configSchema>;

/**
 * Load and validate configuration from environment
 */
export function loadConfig(): Config {
  const raw = {
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 8080,
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/synckit',
    databasePoolMin: process.env.DB_POOL_MIN ? parseInt(process.env.DB_POOL_MIN, 10) : 2,
    databasePoolMax: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 10,
    
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    redisChannelPrefix: process.env.REDIS_CHANNEL_PREFIX || 'synckit:',
    
    jwtSecret: process.env.JWT_SECRET || 'development-secret-change-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    
    wsHeartbeatInterval: process.env.WS_HEARTBEAT_INTERVAL ? parseInt(process.env.WS_HEARTBEAT_INTERVAL, 10) : 30000,
    wsHeartbeatTimeout: process.env.WS_HEARTBEAT_TIMEOUT ? parseInt(process.env.WS_HEARTBEAT_TIMEOUT, 10) : 60000,
    wsMaxConnections: process.env.WS_MAX_CONNECTIONS ? parseInt(process.env.WS_MAX_CONNECTIONS, 10) : 10000,
    
    syncBatchSize: process.env.SYNC_BATCH_SIZE ? parseInt(process.env.SYNC_BATCH_SIZE, 10) : 100,
    syncBatchDelay: process.env.SYNC_BATCH_DELAY ? parseInt(process.env.SYNC_BATCH_DELAY, 10) : 50,
  };

  return configSchema.parse(raw);
}

// Global config instance
export const config = loadConfig();
