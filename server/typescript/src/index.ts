import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { config } from './config';
import { SyncWebSocketServer } from './websocket/server';
import { auth } from './routes/auth';
import { PostgresAdapter } from './storage/postgres';
import { RedisPubSub } from './storage/redis';

/**
 * SyncKit TypeScript Reference Server
 * 
 * Production-ready WebSocket server for real-time synchronization
 */

// Async initialization wrapper
async function startServer() {

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*', // TODO: Configure in production
  credentials: true,
}));

// Mount routes
app.route('/auth', auth);

// Health check endpoint
app.get('/health', (c) => {
  const stats = wsServer?.getStats();
  
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    uptime: process.uptime(),
    connections: stats?.connections || { totalConnections: 0, totalUsers: 0, totalClients: 0 },
    documents: stats?.documents || { totalDocuments: 0, documents: [] },
  });
});

// Server info endpoint
app.get('/', (c) => {
  return c.json({
    name: 'SyncKit Server',
    version: '0.1.0',
    description: 'Production-ready WebSocket sync server',
    endpoints: {
      health: '/health',
      ws: '/ws',
      auth: '/auth',
    },
    features: {
      websocket: 'Real-time sync via WebSocket',
      auth: 'JWT authentication',
      sync: 'Delta-based document synchronization',
      crdt: 'LWW conflict resolution',
    },
  });
});

// =============================================================================
// INITIALIZE STORAGE LAYER (OPTIONAL)
// =============================================================================

let storage: PostgresAdapter | undefined;
let pubsub: RedisPubSub | undefined;
let storageConnected = false;
let redisConnected = false;

// Only initialize PostgreSQL if not using default localhost URL
if (config.databaseUrl && !config.databaseUrl.includes('localhost')) {
  storage = new PostgresAdapter({
    connectionString: config.databaseUrl,
    poolMin: config.databasePoolMin,
    poolMax: config.databasePoolMax,
    connectionTimeout: 5000,
  });
  
  try {
    // console.log('🔌 Connecting to PostgreSQL...');
    await storage.connect();
    storageConnected = true;
    // console.log('✅ PostgreSQL connected');
  } catch (error) {
    console.warn('⚠️  PostgreSQL connection failed');
    console.warn(`   Reason: ${error instanceof Error ? error.message : String(error)}`);
    storage = undefined;
  }
} else {
  // console.log('ℹ️  Running in memory-only mode (PostgreSQL not configured)');
  // console.log('   All sync features work, data persists until restart');
}

// Only initialize Redis if not using default localhost URL
if (config.redisUrl && !config.redisUrl.includes('localhost')) {
  pubsub = new RedisPubSub(
    config.redisUrl,
    config.redisChannelPrefix
  );
  
  try {
    // console.log('🔌 Connecting to Redis...');
    await pubsub.connect();
    redisConnected = true;
    // console.log('✅ Redis connected');
  } catch (error) {
    console.warn('⚠️  Redis connection failed');
    console.warn(`   Reason: ${error instanceof Error ? error.message : String(error)}`);
    pubsub = undefined;
  }
} else {
  // console.log('ℹ️  Running in single-instance mode (Redis not configured)');
  // console.log('   Multi-server coordination disabled');
}

// =============================================================================
// START HTTP SERVER
// =============================================================================

// Create HTTP server with WebSocket upgrade
const server = serve({
  fetch: app.fetch,
  port: config.port,
  hostname: config.host,
});

// Initialize WebSocket server with storage
// Note: @hono/node-server returns Server type which is compatible
const wsServer = new SyncWebSocketServer(
  server as any,
  {
    storage: storageConnected ? storage : undefined,
    pubsub: redisConnected ? pubsub : undefined,
  }
);

// console.log(`🚀 SyncKit Server running on ${config.host}:${config.port}`);
// console.log(`📊 Health check: http://${config.host}:${config.port}/health`);
// console.log(`🔌 WebSocket: ws://${config.host}:${config.port}/ws`);
// console.log(`🔐 Auth: http://${config.host}:${config.port}/auth`);
// console.log(`🔒 Environment: ${config.nodeEnv}`);

// Log server mode
// const mode = storageConnected && redisConnected ? 'Full (Persistent + Multi-Server)'
//   : storageConnected ? 'Persistent (Single Server)'
//   : 'Memory-Only (Development)';
// console.log(`📦 Mode: ${mode}`);

if (!storageConnected || !redisConnected) {
  // console.log(`💡 Tip: Server is fully functional in memory-only mode!`);
}

// Graceful shutdown
const shutdown = async () => {
  // console.log('📛 Shutdown signal received, shutting down gracefully...');
  
  await wsServer.close();
  
  server.close(() => {
    // console.log('✅ Server closed');
    process.exit(0);
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

return { app, server, wsServer, storage, pubsub };

} // End startServer()

// Start the server
startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
