package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/Dancode-188/synckit/server/go/internal/config"
	"github.com/Dancode-188/synckit/server/go/internal/security"
	"github.com/Dancode-188/synckit/server/go/internal/websocket"
	gorilla "github.com/gorilla/websocket"
)

var upgrader = gorilla.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		// Allow connections with no origin (non-browser clients)
		if origin == "" {
			return true
		}
		// In development, allow all origins
		env := os.Getenv("ENVIRONMENT")
		if env != "production" {
			return true
		}
		// In production, check against allowed origins
		allowed := os.Getenv("CORS_ORIGINS")
		if allowed == "" || allowed == "*" {
			return true
		}
		for _, o := range strings.Split(allowed, ",") {
			if strings.TrimSpace(o) == origin {
				return true
			}
		}
		return false
	},
}

// Server represents the HTTP server
type Server struct {
	config          *config.Config
	hub             *websocket.Hub
	server          *http.Server
	securityManager *security.SecurityManager
}

// New creates a new server
func New(cfg *config.Config) *Server {
	hub := websocket.NewHub(cfg.JWTSecret)
	go hub.Run()

	sm := security.NewSecurityManager()

	return &Server{
		config:          cfg,
		hub:             hub,
		securityManager: sm,
	}
}

// Start starts the HTTP server
func (s *Server) Start(addr string) error {
	mux := http.NewServeMux()

	// Routes
	mux.HandleFunc("/", s.handleRoot)
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/ws", s.handleWebSocket)

	s.server = &http.Server{
		Addr:         addr,
		Handler:      s.corsMiddleware(mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return s.server.ListenAndServe()
}

// Shutdown gracefully shuts down the server
func (s *Server) Shutdown(ctx context.Context) error {
	return s.server.Shutdown(ctx)
}

func (s *Server) handleRoot(w http.ResponseWriter, r *http.Request) {
	response := map[string]interface{}{
		"name":        "SyncKit Server",
		"version":     "0.3.0",
		"description": "Production-ready WebSocket sync server",
		"endpoints": map[string]string{
			"health": "/health",
			"ws":     "/ws",
		},
		"features": map[string]string{
			"websocket": "Real-time sync via WebSocket",
			"auth":      "JWT authentication",
			"sync":      "Delta-based document synchronization",
			"crdt":      "LWW conflict resolution",
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	response := map[string]interface{}{
		"status":    "healthy",
		"timestamp": time.Now().Format(time.RFC3339),
		"version":   "0.3.0",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Extract client IP
	clientIP := s.getClientIP(r)

	// Check per-IP connection limit
	if !s.securityManager.ConnectionLimiter.CanConnect(clientIP) {
		log.Printf("[SECURITY] Connection limit exceeded for IP: %s", clientIP)
		http.Error(w, "Too many connections from your IP", http.StatusTooManyRequests)
		return
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	// Track connection
	s.securityManager.ConnectionLimiter.AddConnection(clientIP)

	conn := websocket.NewConnection(generateConnID(), ws, s.hub)
	conn.ClientIP = clientIP
	conn.SecurityManager = s.securityManager
	s.hub.Register <- conn

	// Start pumps
	go conn.WritePump()
	go conn.ReadPump()
}

func (s *Server) getClientIP(r *http.Request) string {
	// Check X-Forwarded-For (reverse proxy)
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		// Take only the first IP (client IP)
		for i, ch := range forwarded {
			if ch == ',' {
				return forwarded[:i]
			}
		}
		return forwarded
	}

	// Check X-Real-IP
	if realIP := r.Header.Get("X-Real-IP"); realIP != "" {
		return realIP
	}

	// Fallback to remote address
	return r.RemoteAddr
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func generateConnID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}
