"""
SyncKit Python Server

Production-ready WebSocket server for real-time synchronization.
"""

import time
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .websocket import websocket_endpoint


# Optional storage and pub/sub
storage = None
pubsub = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle"""
    global storage, pubsub

    # Startup
    print(f"🚀 SyncKit Server starting...")

    # Initialize PostgreSQL if configured
    if settings.database_url and "localhost" not in settings.database_url:
        try:
            from .storage.postgres import PostgresAdapter

            storage = PostgresAdapter(settings.database_url)
            await storage.connect()
            print("✅ PostgreSQL connected")
        except Exception as e:
            print(f"⚠️  PostgreSQL connection failed: {e}")
            storage = None
    else:
        print("ℹ️  Running in memory-only mode (PostgreSQL not configured)")

    # Initialize Redis if configured
    if settings.redis_url and "localhost" not in settings.redis_url:
        try:
            from .storage.redis_pubsub import RedisPubSub

            pubsub = RedisPubSub(settings.redis_url)
            await pubsub.connect()
            print("✅ Redis connected")
        except Exception as e:
            print(f"⚠️  Redis connection failed: {e}")
            pubsub = None
    else:
        print("ℹ️  Running in single-instance mode (Redis not configured)")

    print(f"🚀 Server running on {settings.host}:{settings.port}")
    print(f"📊 Health check: http://{settings.host}:{settings.port}/health")
    print(f"🔌 WebSocket: ws://{settings.host}:{settings.port}/ws")

    # Run the application
    yield

    # Shutdown
    print("📛 Shutting down gracefully...")
    if storage:
        await storage.close()
    if pubsub:
        await pubsub.close()
    print("✅ Server shut down")


# Create FastAPI app
app = FastAPI(
    title="SyncKit Server",
    description="Production-ready WebSocket sync server",
    version="0.3.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Server info endpoint"""
    return {
        "name": "SyncKit Server",
        "version": "0.3.0",
        "description": "Production-ready WebSocket sync server",
        "endpoints": {
            "health": "/health",
            "ws": "/ws",
        },
        "features": {
            "websocket": "Real-time sync via WebSocket",
            "auth": "JWT authentication",
            "sync": "Delta-based document synchronization",
            "crdt": "LWW conflict resolution",
        },
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    return JSONResponse(
        {
            "status": "healthy",
            "timestamp": time.time(),
            "version": "0.3.0",
            "storage": "connected" if storage else "memory-only",
            "pubsub": "connected" if pubsub else "single-instance",
        }
    )


# Mount WebSocket endpoint
app.add_websocket_route("/ws", websocket_endpoint)
