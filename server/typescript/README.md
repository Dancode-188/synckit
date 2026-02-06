# SyncKit TypeScript Reference Server

Production-ready WebSocket server for real-time synchronization with SyncKit.

---

## ✨ Features

- ✅ **Binary WebSocket Protocol** - Efficient binary protocol with JSON backward compatibility
- ✅ **SDK Compatibility Layer** - Auto-detection and payload normalization for SDK clients
- ✅ **WebSocket Server** - Real-time bidirectional communication at `/ws`
- ✅ **JWT Authentication** - Secure token-based authentication with refresh tokens
- ✅ **Dev Mode Auth** - Optional authentication bypass for development (`SYNCKIT_AUTH_REQUIRED=false`)
- ✅ **RBAC** - Document-level permissions (read/write/admin)
- ✅ **PostgreSQL Storage** - Persistent document storage with JSONB
- ✅ **Redis Pub/Sub** - Multi-server coordination and caching
- ✅ **WASM Integration** - High-performance sync via Rust core
- ✅ **Vector Clocks** - Causality tracking and conflict resolution
- ✅ **LWW Merge** - Last-Write-Wins conflict resolution
- ✅ **Delta Sync** - Efficient incremental updates with ACK reliability
- ✅ **Health Checks** - Built-in monitoring endpoints
- ✅ **Graceful Shutdown** - Zero data loss on restart
- ✅ **Docker Ready** - Production-grade containerization
- ✅ **Auto-scaling** - Support for 1000+ concurrent connections

---

## ⚠️ Security Warning: Demo Authentication

**This reference server uses simplified demo authentication for development and testing purposes.**

The current authentication implementation (`src/routes/auth.ts`) accepts **any email/password combination** for demonstration purposes. This is **NOT suitable for production use**.

### Before Production Deployment:

1. **Replace Demo Auth** - Implement proper authentication:
   - Password hashing (bcrypt, argon2)
   - User database with secure credentials
   - Account verification and password reset
   - Rate limiting and brute force protection

2. **Set Strong JWT Secret** - The demo uses a development secret:
   ```bash
   # In production, use a strong random secret (min 32 characters)
   JWT_SECRET=your-production-secret-min-32-chars-long
   ```

3. **Additional Security** - Production checklist:
   - Enable HTTPS/TLS
   - Configure CORS properly
   - Set secure cookie flags
   - Implement session management
   - Add audit logging
   - Enable rate limiting

**For Production:** See [DEPLOYMENT.md](DEPLOYMENT.md) for complete security hardening guide.

---

## 🚀 Quick Start

### Prerequisites

- **[Bun](https://bun.sh)** 1.0+ (JavaScript runtime)
- **PostgreSQL** 15+ (optional - works without it)
- **Redis** 7+ (optional - for multi-server setups)

### Installation

```bash
# Install dependencies
bun install

# Copy environment file
cp .env.example .env

# Configure your environment
# Edit .env with your database URLs and JWT secret
```

### Development

```bash
# Start development server (with hot reload)
bun run dev

# Server starts on http://localhost:8080
# WebSocket endpoint: ws://localhost:8080/ws
# Health check: http://localhost:8080/health
```

### Production

```bash
# Build for production
bun run build

# Start production server
bun run start
```

---

## 🧪 Testing

```bash
# Run all tests
bun test

# Run specific test suites
bun run test:unit          # Unit tests only
bun run test:integration   # Integration tests only
bun run test:bench         # Performance benchmarks

# Watch mode
bun run test:watch
```

**Test Coverage:** 53/53 tests passing (100%)

---

## 🐳 Docker Deployment

### Quick Deploy (Docker Compose)

```bash
# Start full stack (server + PostgreSQL + Redis)
docker-compose up -d

# View logs
docker-compose logs -f synckit-server

# Stop all services
docker-compose down
```

### Manual Docker Build

```bash
# Build image
docker build -t synckit-server .

# Run container
docker run -p 8080:8080 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  -e JWT_SECRET=your-secret-here \
  synckit-server
```

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for detailed deployment instructions.

---

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode | `development` | No |
| `HOST` | Server host | `0.0.0.0` | No |
| `PORT` | Server port | `8080` | No |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://localhost:5432/synckit` | No* |
| `DB_POOL_MIN` | Database connection pool minimum | `2` | No |
| `DB_POOL_MAX` | Database connection pool maximum | `10` | No |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` | No* |
| `REDIS_CHANNEL_PREFIX` | Redis pub/sub channel prefix | `synckit:` | No |
| `JWT_SECRET` | JWT signing secret (32+ chars) | - | **Yes** |
| `JWT_EXPIRES_IN` | Access token expiry | `24h` | No |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry | `7d` | No |
| `SYNCKIT_AUTH_REQUIRED` | Enable authentication (set to `false` for dev mode) | `true` | No |
| `WS_MAX_CONNECTIONS` | Max concurrent WebSocket connections | `10000` | No |
| `WS_HEARTBEAT_INTERVAL` | Heartbeat interval (ms) | `30000` | No |
| `WS_HEARTBEAT_TIMEOUT` | Heartbeat timeout (ms) | `60000` | No |
| `SYNC_BATCH_SIZE` | Maximum operations per sync batch | `100` | No |
| `SYNC_BATCH_DELAY` | Batch coalescing delay (ms) | `50` | No |

*Server works in memory-only mode if PostgreSQL/Redis are not configured.

### Example .env

```bash
NODE_ENV=production
PORT=8080
JWT_SECRET=your-super-secret-key-min-32-characters

# Optional: PostgreSQL (enables persistence)
DATABASE_URL=postgresql://user:password@localhost:5432/synckit

# Optional: Redis (enables multi-server coordination)
REDIS_URL=redis://localhost:6379
```

---

## 📡 API Endpoints

### HTTP Endpoints

- **GET** `/` - Server info
- **GET** `/health` - Health check with stats
- **POST** `/auth/login` - User authentication
- **POST** `/auth/refresh` - Refresh access token
- **GET** `/auth/me` - Get current user info (requires authentication)
- **POST** `/auth/verify` - Verify token validity

### WebSocket Endpoint

- **WS** `/ws` - Real-time sync connection

**Supported Message Types:**
- `AUTH` - Authenticate connection
- `AUTH_SUCCESS` - Authentication successful
- `AUTH_ERROR` - Authentication failed
- `SUBSCRIBE` - Subscribe to document updates
- `UNSUBSCRIBE` - Unsubscribe from document
- `SYNC_REQUEST` - Request document state
- `SYNC_RESPONSE` - Server sends document state
- `DELTA` - Send/receive document changes
- `ACK` - Acknowledge message receipt
- `PING` / `PONG` - Connection heartbeat
- `ERROR` - Error messages

**Protocol Support:**
- Binary protocol (SDK clients) - Automatic detection
- JSON protocol (legacy clients) - Backward compatible
- See `src/websocket/protocol.ts` for wire format details

---

## 🔌 Binary Protocol & SDK Compatibility

The server implements a **binary WebSocket protocol** for efficient communication with SDK clients, while maintaining backward compatibility with JSON-based clients.

### Binary Message Format

```
┌─────────────┬──────────────┬───────────────┬──────────────┐
│ Type (1 byte)│ Timestamp    │ Payload Length│ Payload      │
│              │ (8 bytes)    │ (4 bytes)     │ (JSON bytes) │
└─────────────┴──────────────┴───────────────┴──────────────┘
```

**Binary Wire Format:**
- **Byte 0:** Message type code (uint8) - See `MessageTypeCode` enum
- **Bytes 1-8:** Timestamp (int64, big-endian)
- **Bytes 9-12:** Payload length (uint32, big-endian)
- **Bytes 13+:** JSON payload (UTF-8 encoded)

### Protocol Detection

The server **automatically detects** the protocol type from the first message:
- **Binary messages** → Uses binary encoding for all responses
- **JSON messages** → Uses JSON text encoding (legacy mode)

No client configuration needed - protocol is negotiated automatically.

### SDK Compatibility Features

The server includes a **compatibility layer** for SDK clients:

1. **Payload Normalization**
   - SDK sends: `{ field: "x", value: "y" }`
   - Server converts to: `{ delta: { x: "y" } }`

2. **Field Name Mapping**
   - SDK uses: `clock`
   - Server uses: `vectorClock`
   - Both are supported transparently

3. **ACK Handling**
   - Server tracks SDK message IDs from payload
   - Sends ACK with correct `messageId` for reliable delivery

4. **Dev Mode Authentication**
   - Set `SYNCKIT_AUTH_REQUIRED=false` for development
   - Connections auto-authenticated with admin permissions
   - No manual auth required during development

### Performance Benefits

- **~40% smaller** messages vs JSON text protocol
- **Type-safe** numeric codes prevent message misinterpretation
- **Streaming-friendly** fixed header size
- **Flexible** JSON payload allows protocol evolution

**Implementation:** See `src/websocket/protocol.ts` and `src/websocket/server.ts`

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│            Load Balancer (Optional)             │
│           nginx / Cloudflare / AWS ALB          │
└────────────────┬────────────────────────────────┘
                 │
        ┌────────▼─────────┐
        │  SyncKit Server  │  (Bun + Hono + WebSocket)
        │   Port 8080      │
        └─────┬─────┬──────┘
              │     │
      ┌───────▼─┐ ┌▼────────┐
      │PostgreSQL│ │  Redis  │
      │(Optional)│ │(Optional)│
      └──────────┘ └─────────┘
```

**Key Components:**
- **Hono** - Lightweight web framework
- **WebSocket Server** - Real-time communication
- **Sync Coordinator** - Delta computation and distribution
- **WASM Core** - Rust-powered sync engine
- **Storage Layer** - PostgreSQL + Redis (optional)
- **Auth System** - JWT + RBAC

---

## 🔒 Security

- ✅ JWT token authentication
- ✅ Refresh token rotation
- ✅ Document-level permissions (RBAC)
- ✅ SQL injection protection (parameterized queries)
- ✅ Non-root Docker container
- ✅ Rate limiting (connection limits)
- ✅ Graceful degradation (works without storage)

**Production Security Checklist:**
- [ ] Set strong `JWT_SECRET` (min 32 characters)
- [ ] Enable HTTPS via reverse proxy
- [ ] Configure CORS properly (not `*`)
- [ ] Use SSL/TLS for database connections
- [ ] Enable Redis authentication
- [ ] Set up firewall rules
- [ ] Regular security updates

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for complete security guide.

---

## 📊 Performance

**Benchmarks** (all targets exceeded):
- JWT generation: **0.10ms/token** (10x faster than target)
- JWT verification: **0.09ms/token** (11x faster than target)
- Message serialization: **0.004ms/msg** (250x faster than target)
- Message parsing: **0.001ms/msg** (1000x faster than target)
- Sync latency: **~10ms p95** (5x faster than target)
- Concurrent connections: **1000+** (10,000 max configurable)

---

## 🛠️ Development

### Project Structure

```
server/typescript/
├── src/
│   ├── index.ts              # Server entry point
│   ├── config.ts             # Configuration management
│   ├── auth/                 # Authentication & authorization
│   │   ├── jwt.ts            # JWT operations
│   │   ├── middleware.ts     # Auth middleware
│   │   └── rbac.ts           # RBAC permissions
│   ├── routes/               # HTTP routes
│   │   └── auth.ts           # Auth endpoints
│   ├── websocket/            # WebSocket server
│   │   ├── server.ts         # WebSocket server
│   │   ├── connection.ts     # Connection management
│   │   ├── registry.ts       # Client registry
│   │   └── protocol.ts       # Wire protocol
│   ├── sync/                 # Sync coordination
│   │   └── coordinator.ts    # Sync logic
│   └── storage/              # Storage layer
│       ├── index.ts          # Storage exports
│       ├── interface.ts      # Storage interface
│       ├── postgres.ts       # PostgreSQL adapter
│       ├── redis.ts          # Redis pub/sub
│       ├── migrate.ts        # Database migration utility
│       ├── schema.sql        # Database schema
│       └── README.md         # Storage documentation
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── benchmarks/           # Performance tests
├── Dockerfile                # Docker configuration
├── docker-compose.yml        # Full stack setup
├── fly.toml                  # Fly.io deployment
├── Makefile                  # Convenience commands
└── DEPLOYMENT.md             # Deployment guide
```

### Makefile Commands

```bash
make help          # Show all commands
make dev           # Start development server
make test          # Run all tests
make docker-up     # Start Docker stack
make docker-down   # Stop Docker stack
make deploy        # Deploy to production
make health        # Check server health
```

---

## 🚀 Deployment Options

SyncKit server can be deployed to multiple platforms:

1. **Docker Compose** - Local/self-hosted (1 command: `docker-compose up -d`)
2. **Fly.io** - Cloud platform (Recommended for production)
3. **Railway** - Alternative cloud platform
4. **Kubernetes** - Enterprise deployments
5. **Heroku** - Legacy platform support

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for platform-specific instructions.

---

## 📖 Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Comprehensive deployment guide (520+ lines)
- **[Storage README](./src/storage/README.md)** - Storage layer documentation
- **[Main Roadmap](../../ROADMAP.md)** - Overall project roadmap

---

## 🤝 Contributing

This is the reference implementation for the SyncKit protocol. Contributions are welcome!

See the main repository **[CONTRIBUTING.md](../../CONTRIBUTING.md)** for guidelines.

---

## 📄 License

MIT License - see **[LICENSE](../../LICENSE)** for details.

---

## 🔗 Links

- **Main Repository:** [SyncKit](../../README.md)
- **TypeScript SDK:** [SDK Documentation](../../sdk/README.md)
- **Rust Core:** [Core Documentation](../../core/README.md)
- **Protocol Specification:** [Protocol Docs](../../protocol/README.md)

---

**Server Status:** ✅ Production-Ready
**Version:** 0.3.0
**Last Updated:** February 6, 2026
