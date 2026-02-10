package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Dancode-188/synckit/server/go/internal/config"
	"github.com/Dancode-188/synckit/server/go/internal/server"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Create server
	srv := server.New(cfg)

	// Start server in goroutine
	go func() {
		addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
		log.Printf("🚀 SyncKit Server starting on %s", addr)
		log.Printf("📊 Health check: http://%s/health", addr)
		log.Printf("🔌 WebSocket: ws://%s/ws", addr)

		if err := srv.Start(addr); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("📛 Shutting down gracefully...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("⚠️  Forced shutdown: %v", err)
	}

	log.Println("✅ Server shut down")
}
