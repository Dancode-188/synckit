# SyncKit Python Server

Production-ready WebSocket server for real-time synchronization, written in Python.

## Why Python?

The TypeScript server works great, but not everyone wants to run Node.js in production. The Python server implements the exact same binary protocol, so it's a drop-in replacement. Pick whichever language your team is comfortable with.

## Features

- **Binary WebSocket protocol** - Compatible with SyncKit SDK
- **Memory-only mode** - Works out of the box, no database required
- **Optional PostgreSQL** - Add persistent storage when you need it
- **Optional Redis pub/sub** - Coordinate multiple server instances
- **FastAPI** - Modern async Python framework
- **JWT authentication** - Secure your documents
- **Delta batching** - Handles batched deltas from clients
- **Awareness protocol** - Live cursors and presence

## Quick Start

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn src.synckit_server.main:app --reload --host 0.0.0.0 --port 8080
```

Server will be running at:
- HTTP: `http://localhost:8080`
- WebSocket: `ws://localhost:8080/ws`
- Health check: `http://localhost:8080/health`

### With Docker

```bash
# Build
docker build -t synckit-server-python .

# Run
docker run -p 8080:8080 synckit-server-python
```

### With Database (PostgreSQL)

```bash
# Set up environment
cp .env.example .env
# Edit .env and set DATABASE_URL=postgresql://user:pass@localhost/synckit

# Run with database
uvicorn src.synckit_server.main:app --host 0.0.0.0 --port 8080
```

### With Redis (Multi-server)

```bash
# Edit .env and set REDIS_URL=redis://localhost:6379

# Run multiple instances
uvicorn src.synckit_server.main:app --host 0.0.0.0 --port 8080
uvicorn src.synckit_server.main:app --host 0.0.0.0 --port 8081
```

## Configuration

All configuration via environment variables (or `.env` file):

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
```

## Server Modes

The Python server adapts based on what you configure:

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

The Python server implements the exact same binary protocol as the TypeScript server:

```
┌─────────────┬──────────────┬───────────────┬──────────────┐
│ Type (1 byte)│ Timestamp    │ Payload Length│ Payload      │
│              │ (8 bytes)    │ (4 bytes)     │ (JSON bytes) │
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

### Gunicorn (Recommended)

```bash
# Install gunicorn
pip install gunicorn

# Run with workers
gunicorn src.synckit_server.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8080
```

### Fly.io

```bash
# Create fly.toml
fly launch --name synckit-python

# Set secrets
fly secrets set JWT_SECRET=$(openssl rand -base64 32)

# Optional: Add PostgreSQL
fly postgres create --name synckit-db
fly postgres attach synckit-db

# Optional: Add Redis (Upstash)
# Set REDIS_URL in secrets

# Deploy
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

## Testing

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest

# With coverage
pytest --cov=src/synckit_server --cov-report=html
```

## Performance

The Python server performs comparably to the TypeScript server:

- WebSocket connections: Thousands per instance
- Latency: <10ms p95 (local network)
- Memory: ~50MB base + ~1KB per connection
- CPU: Async I/O keeps it efficient

For high-traffic scenarios, run multiple instances behind a load balancer with Redis pub/sub.

## Troubleshooting

### Server won't start

Check logs for:
- Port already in use (change PORT)
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

## Differences from TypeScript Server

The Python server aims for 100% protocol compatibility, but there are minor differences:

- Uses FastAPI instead of Hono
- Uses asyncpg instead of node-postgres
- Uses redis-py instead of ioredis
- Slightly different logging format

Clients can't tell the difference - they just see the same WebSocket protocol.

## License

MIT - Same as the rest of SyncKit

## Support

- Issues: https://github.com/Dancode-188/synckit/issues
- Docs: https://synckit.dev/docs

## Why FastAPI?

FastAPI is modern, fast, and has built-in WebSocket support. It's also async-first, which is perfect for WebSocket servers where you're handling thousands of concurrent connections.

If your team prefers Flask or Django, feel free to port it - the protocol layer is framework-agnostic.
