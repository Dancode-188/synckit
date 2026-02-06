# SyncKit Server - Deployment Guide

Production deployment guide for SyncKit server with Docker.

---

## 🚀 Quick Start (Docker Compose)

### Prerequisites
- Docker 20.10+
- Docker Compose 2.0+
- 2GB RAM minimum
- 10GB disk space

### 1. Clone & Setup

```bash
cd server/typescript
cp .env.production.example .env.production
```

### 2. Configure Environment

Edit `.env.production` and set:
- `JWT_SECRET` - Generate with: `openssl rand -base64 32`
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string

### 3. Start Stack

```bash
# Production mode (server only)
docker-compose up -d

# Development mode (with pgAdmin & Redis Commander)
docker-compose --profile dev up -d
```

### 4. Verify Deployment

```bash
# Check all services are healthy
docker-compose ps

# Check server logs
docker-compose logs -f synckit-server

# Test health endpoint
curl http://localhost:8080/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-17T01:00:00.000Z",
  "version": "0.3.0",
  "uptime": 123.45
}
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│          Load Balancer (Optional)               │
│         nginx / Cloudflare / AWS ALB            │
└────────────────┬────────────────────────────────┘
                 │
        ┌────────▼─────────┐
        │  SyncKit Server  │  (Port 8080)
        │   (Docker)       │
        └─────┬─────┬──────┘
              │     │
      ┌───────▼─┐ ┌▼────────┐
      │PostgreSQL│ │  Redis  │
      │ (Port    │ │ (Port   │
      │  5432)   │ │  6379)  │
      └──────────┘ └─────────┘
```

---

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment | `production` | Yes |
| `PORT` | Server port | `8080` | Yes |
| `DATABASE_URL` | PostgreSQL URL | - | Yes |
| `REDIS_URL` | Redis URL | - | Yes |
| `JWT_SECRET` | JWT secret (32+ chars) | - | **YES** |
| `JWT_EXPIRES_IN` | Access token expiry | `24h` | No |
| `WS_MAX_CONNECTIONS` | Max WebSocket connections | `10000` | No |

### Database Schema

Database schema is automatically initialized on first run via Docker entrypoint.

For manual migration:
```bash
docker-compose exec synckit-server bun run db:migrate
```

---

## 🌐 Production Deployment

### Option 1: Docker Compose (Simple)

Best for single-server deployments.

```bash
# 1. Configure
cp .env.production.example .env.production
nano .env.production

# 2. Deploy
docker-compose up -d

# 3. Scale (if needed)
docker-compose up -d --scale synckit-server=3
```

### Option 2: Kubernetes (Scalable)

Best for multi-server deployments.

```yaml
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: synckit-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: synckit-server
  template:
    metadata:
      labels:
        app: synckit-server
    spec:
      containers:
      - name: synckit-server
        image: synckit/server:latest
        ports:
        - containerPort: 8080
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: synckit-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: synckit-secrets
              key: redis-url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: synckit-secrets
              key: jwt-secret
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
```

### Option 3: Cloud Platforms

#### Fly.io

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Create app
fly launch

# Deploy
fly deploy

# Set secrets
fly secrets set JWT_SECRET=$(openssl rand -base64 32)
fly secrets set DATABASE_URL=postgresql://...
fly secrets set REDIS_URL=redis://...
```

#### Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project
railway init

# Deploy
railway up

# Set variables
railway variables set JWT_SECRET=$(openssl rand -base64 32)
```

#### Heroku

```bash
# Login
heroku login

# Create app
heroku create synckit-server

# Add PostgreSQL
heroku addons:create heroku-postgresql:hobby-dev

# Add Redis
heroku addons:create heroku-redis:hobby-dev

# Set secrets
heroku config:set JWT_SECRET=$(openssl rand -base64 32)

# Deploy
git push heroku main
```

---

## 🔒 Security

### Production Checklist

- [ ] Set strong `JWT_SECRET` (32+ characters, random)
- [ ] Change default PostgreSQL password
- [ ] Enable SSL/TLS for database connections
- [ ] Use Redis with authentication (`rediss://`)
- [ ] Configure CORS properly (not `*`)
- [ ] Enable rate limiting
- [ ] Set up firewall rules
- [ ] Use secrets management (not env files)
- [ ] Enable HTTPS (via reverse proxy)
- [ ] Regular security updates

### SSL/TLS Configuration

Use a reverse proxy (nginx/Caddy) for HTTPS:

```nginx
# nginx.conf
server {
    listen 443 ssl http2;
    server_name api.synckit.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 📊 Monitoring

### Health Checks

```bash
# Server health
curl http://localhost:8080/health

# Database health
docker-compose exec postgres pg_isready

# Redis health
docker-compose exec redis redis-cli ping
```

### Logs

```bash
# All services
docker-compose logs -f

# Server only
docker-compose logs -f synckit-server

# Last 100 lines
docker-compose logs --tail=100 synckit-server
```

### Metrics

Access optional monitoring UIs:

- **pgAdmin**: http://localhost:5050 (PostgreSQL)
  - Email: `admin@synckit.local`
  - Password: `admin`

- **Redis Commander**: http://localhost:8081 (Redis)

Enable in development mode:
```bash
docker-compose --profile dev up -d
```

---

## 🔄 Maintenance

### Backup

```bash
# Database backup
docker-compose exec postgres pg_dump -U synckit synckit > backup.sql

# Restore
docker-compose exec -T postgres psql -U synckit synckit < backup.sql

# Redis backup (automatic via AOF)
docker-compose exec redis redis-cli BGSAVE
```

### Updates

```bash
# Pull latest changes
git pull

# Rebuild images
docker-compose build

# Restart with zero downtime
docker-compose up -d --no-deps --build synckit-server
```

### Cleanup

```bash
# Old data (sessions > 24h, deltas > 30d)
docker-compose exec synckit-server bun run -e 'import("./src/storage/postgres").then(m => m.cleanup())'

# Docker resources
docker system prune -a
```

---

## 🚨 Troubleshooting

### Server won't start

```bash
# Check logs
docker-compose logs synckit-server

# Common issues:
# 1. Missing JWT_SECRET - Set in .env.production
# 2. Database not ready - Wait for postgres health check
# 3. Port already in use - Change PORT in .env.production
```

### Database connection issues

```bash
# Test connection
docker-compose exec synckit-server bun run -e 'import("pg").then(({Client}) => {const c = new Client(process.env.DATABASE_URL); c.connect()})'

# Check PostgreSQL logs
docker-compose logs postgres
```

### Redis connection issues

```bash
# Test connection
docker-compose exec synckit-server bun run -e 'import("ioredis").then(Redis => new Redis(process.env.REDIS_URL).ping())'

# Check Redis logs
docker-compose logs redis
```

### Performance issues

```bash
# Check resource usage
docker stats

# Increase resources in docker-compose.yml:
services:
  synckit-server:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

---

## 📈 Scaling

### Horizontal Scaling

Run multiple server instances (Redis required for coordination):

```bash
# Scale to 3 instances
docker-compose up -d --scale synckit-server=3

# Add load balancer
# Use nginx, HAProxy, or cloud load balancer
```

### Vertical Scaling

Increase resources per container:

```yaml
# docker-compose.yml
services:
  synckit-server:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 4G
        reservations:
          cpus: '2'
          memory: 2G
```

### Database Scaling

- Use PostgreSQL read replicas
- Enable connection pooling (PgBouncer)
- Partition large tables

### Redis Scaling

- Use Redis Cluster for horizontal scaling
- Add more memory for larger datasets
- Configure eviction policy

---

## 🎯 Performance Tuning

### Server

```env
# Increase connection limits
WS_MAX_CONNECTIONS=50000

# Tune batch processing
SYNC_BATCH_SIZE=500
SYNC_BATCH_DELAY=10
```

### PostgreSQL

```sql
-- Increase connection pool
ALTER SYSTEM SET max_connections = 200;

-- Tune memory
ALTER SYSTEM SET shared_buffers = '1GB';
ALTER SYSTEM SET effective_cache_size = '3GB';
```

### Redis

```bash
# Increase max memory
docker-compose exec redis redis-cli CONFIG SET maxmemory 512mb

# Set eviction policy
docker-compose exec redis redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

---

## ✅ Production Checklist

Before going live:

- [ ] SSL/TLS configured
- [ ] Strong secrets generated
- [ ] Database backups automated
- [ ] Monitoring set up
- [ ] Rate limiting enabled
- [ ] CORS configured properly
- [ ] Health checks working
- [ ] Logs being collected
- [ ] Firewall rules configured
- [ ] Load testing completed

---

## 📞 Support

- **Documentation**: See README.md
- **Issues**: GitHub Issues
- **Community**: Discord/Slack

---

**Deployment Status**: ✅ Production-ready  
**Last Updated**: February 6, 2026
