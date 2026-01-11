# SyncKit Go Server

High-performance WebSocket server for real-time synchronization, written in Go.

## Why Go?

Go compiles to a single binary, uses minimal memory, and handles concurrent connections beautifully. If you're running Docker/Kubernetes infrastructure or need maximum performance, Go is a natural fit.

## Features

- **Binary WebSocket protocol** - Compatible with SyncKit SDK
- **Gorilla WebSocket** - Battle-tested WebSocket library
- **Memory-only mode** - Works out of the box, no database required
- **Optional PostgreSQL** - Add persistent storage when you need it
- **Optional Redis pub/sub** - Coordinate multiple server instances
- **Single binary** - Compile once, deploy anywhere
- **JWT authentication** - Secure your documents
- **Delta batching** - Handles batched deltas from clients
- **Awareness protocol** - Live cursors and presence

## Quick Start

### Local Development

```bash
# Install dependencies
go mod download

# Run the server
go run cmd/server/main.go
```

Server will be running at:
- HTTP: `http://localhost:8080`
- WebSocket: `ws://localhost:8080/ws`
- Health check: `http://localhost:8080/health`

### Build Binary

```bash
# Build for current platform
go build -o synckit-server cmd/server/main.go

# Run
./synckit-server
```

### Cross-compile

```bash
# Linux
GOOS=linux GOARCH=amd64 go build -o synckit-server-linux cmd/server/main.go

# Windows
GOOS=windows GOARCH=amd64 go build -o synckit-server.exe cmd/server/main.go

# macOS
GOOS=darwin GOARCH=arm64 go build -o synckit-server-mac cmd/server/main.go
```

### With Docker

```bash
# Build
docker build -t synckit-server-go .

# Run
docker run -p 8080:8080 synckit-server-go
```

### With Database (PostgreSQL)

```bash
# Set environment variables
export DATABASE_URL=postgresql://user:pass@localhost/synckit

# Run
go run cmd/server/main.go
```

### With Redis (Multi-server)

```bash
# Set environment variables
export DATABASE_URL=postgresql://user:pass@localhost/synckit
export REDIS_URL=redis://localhost:6379

# Run multiple instances
go run cmd/server/main.go # Instance 1
PORT=8081 go run cmd/server/main.go # Instance 2
```

## Configuration

All configuration via environment variables:

```bash
# Server
HOST=0.0.0.0
PORT=8080
ENVIRONMENT=production

# Auth
JWT_SECRET=your-secret-key-change-in-production

# Database (optional)
DATABASE_URL=postgresql://user:pass@localhost/synckit

# Redis (optional)
REDIS_URL=redis://localhost:6379

# CORS (optional)
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
```

## Server Modes

The Go server adapts based on configuration:

### 1. Memory-Only Mode (Default)
- No database or Redis configured
- All sync works perfectly
- Data persists until server restarts
- Perfect for development or stateless deployments

### 2. Persistent Mode
- Configure `DATABASE_URL`
- Documents saved to PostgreSQL
- Survives server restarts
- Single server instance

### 3. Multi-Server Mode
- Configure both `DATABASE_URL` and `REDIS_URL`
- Multiple server instances coordinate via Redis pub/sub
- Load balance across servers
- Production-ready HA setup

## API Endpoints

### `GET /`
Server info and features

### `GET /health`
Health check with server stats

### `WS /ws`
WebSocket endpoint for real-time sync

## Protocol Compatibility

The Go server implements the exact same binary protocol as the TypeScript and Python servers:

```
┌─────────────┬──────────────┬───────────────┬──────────────┐
│Type (1 byte)│ Timestamp    │Payload Length │ Payload      │
│             │ (8 bytes)    │ (4 bytes)     │ (JSON bytes) │
└─────────────┴──────────────┴───────────────┴──────────────┘
```

Supported message types:
- AUTH, AUTH_SUCCESS, AUTH_ERROR
- SUBSCRIBE, UNSUBSCRIBE
- SYNC_REQUEST, SYNC_RESPONSE
- DELTA, DELTA_BATCH, ACK
- PING, PONG
- AWARENESS_UPDATE, AWARENESS_STATE

## Production Deployment

### Systemd Service

```ini
[Unit]
Description=SyncKit Go Server
After=network.target

[Service]
Type=simple
User=synckit
WorkingDirectory=/opt/synckit
ExecStart=/opt/synckit/synckit-server
Restart=always
Environment="PORT=8080"
Environment="DATABASE_URL=postgresql://..."

[Install]
WantedBy=multi-user.target
```

### Fly.io

```toml
# fly.toml
app = "synckit-go"

[build]
  dockerfile = "Dockerfile"

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

[env]
  PORT = "8080"
```

```bash
# Deploy
fly launch --name synckit-go
fly secrets set JWT_SECRET=$(openssl rand -base64 32)
fly deploy
```

### Docker Compose

```yaml
version: '3.8'

services:
  synckit:
    build: .
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/synckit
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=your-secret-here
    depends_on:
      - db
      - redis

  db:
    image: postgres:15
    environment:
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=synckit
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

## Performance

Go's concurrency model makes it excellent for WebSocket servers:

- WebSocket connections: Tens of thousands per instance (depending on memory)
- Latency: <5ms p95 (local network)
- Memory: ~10MB base + ~4KB per connection
- CPU: Goroutines are lightweight, handles load efficiently

For maximum throughput, run multiple instances behind a load balancer with Redis pub/sub.

## Testing

```bash
# Run tests
go test ./...

# With coverage
go test -cover ./...

# With race detector
go test -race ./...

# Benchmark
go test -bench=. ./...
```

## Troubleshooting

### Server won't start

Check logs for:
- Port already in use (change PORT env var)
- Database connection issues (check DATABASE_URL)
- Redis connection issues (check REDIS_URL)

### Clients can't connect

- Check firewall rules
- Verify CORS_ORIGINS includes your client domain
- Make sure you're using `ws://` (or `wss://` for production)

### Deltas not syncing

- Check server logs for errors
- Verify client is authenticated
- Make sure client subscribed to document
- Check network connectivity

## Differences from TypeScript/Python Servers

The Go server aims for 100% protocol compatibility. Implementation differences:

- Uses Gorilla WebSocket instead of ws (Node) or websockets (Python)
- Uses pq (lib/pq) for PostgreSQL instead of pg or asyncpg
- Uses go-redis instead of ioredis or redis-py
- Compiled binary instead of interpreted language

Clients can't tell the difference - they just see the same WebSocket protocol.

## Why Gorilla WebSocket?

Gorilla is the de facto standard for WebSockets in Go. It's well-maintained, performant, and production-proven in thousands of applications.

## License

MIT - Same as the rest of SyncKit
