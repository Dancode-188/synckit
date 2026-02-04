package websocket

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"github.com/Dancode-188/synckit/server/go/internal/auth"
	"github.com/Dancode-188/synckit/server/go/internal/protocol"
)

// Hub maintains active connections and broadcasts messages
type Hub struct {
	// Configuration
	jwtSecret string

	// Registered connections
	connections map[string]*Connection
	mu          sync.RWMutex

	// Document subscribers
	subscribers map[string]map[string]bool // docId -> connectionId -> true

	// Document storage (in-memory)
	documents map[string]map[string]interface{}
	docsMu    sync.RWMutex

	// Awareness states
	awareness map[string]map[string]interface{} // docId -> clientId -> state
	awareMu   sync.RWMutex

	// Channels
	Register      chan *Connection
	Unregister    chan *Connection
	HandleMessage chan *MessageEvent
}

// MessageEvent represents a message from a connection
type MessageEvent struct {
	Connection *Connection
	Message    *protocol.Message
}

// NewHub creates a new Hub
func NewHub(jwtSecret string) *Hub {
	return &Hub{
		jwtSecret:     jwtSecret,
		connections:   make(map[string]*Connection),
		subscribers:   make(map[string]map[string]bool),
		documents:     make(map[string]map[string]interface{}),
		awareness:     make(map[string]map[string]interface{}),
		Register:      make(chan *Connection),
		Unregister:    make(chan *Connection),
		HandleMessage: make(chan *MessageEvent, 256),
	}
}

// Run starts the hub
func (h *Hub) Run() {
	for {
		select {
		case conn := <-h.Register:
			h.mu.Lock()
			h.connections[conn.ID] = conn
			h.mu.Unlock()

		case conn := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.connections[conn.ID]; ok {
				// Remove from subscribers
				for docID := range conn.Subscriptions {
					if subs, exists := h.subscribers[docID]; exists {
						delete(subs, conn.ID)
						if len(subs) == 0 {
							delete(h.subscribers, docID)
						}
					}
				}

				// Clean up awareness
				h.awareMu.Lock()
				for docID := range conn.AwarenessSubscriptions {
					if states, exists := h.awareness[docID]; exists {
						delete(states, conn.ClientID)
						if len(states) == 0 {
							delete(h.awareness, docID)
						}
					}
				}
				h.awareMu.Unlock()

				delete(h.connections, conn.ID)
				close(conn.send)
			}
			h.mu.Unlock()

		case event := <-h.HandleMessage:
			h.handleMessage(event.Connection, event.Message)
		}
	}
}

func (h *Hub) handleMessage(conn *Connection, msg *protocol.Message) {
	switch msg.Type {
	case protocol.TypePing:
		conn.SendMessage(protocol.TypePong, map[string]interface{}{
			"type":      protocol.TypePong,
			"id":        msg.ID,
			"timestamp": time.Now().UnixMilli(),
		})

	case protocol.TypeAuth:
		// JWT token validation
		token, _ := msg.Payload["token"].(string)

		if token != "" {
			// Validate JWT token
			decoded, err := auth.VerifyToken(token, h.jwtSecret)
			if err != nil {
				// Invalid or expired token
				conn.SendMessage(protocol.TypeAuthError, map[string]interface{}{
					"type":      protocol.TypeAuthError,
					"id":        msg.ID,
					"timestamp": time.Now().UnixMilli(),
					"error":     "Invalid or expired token",
					"code":      "INVALID_TOKEN",
				})
				return
			}

			// Token valid - set connection state
			conn.Authenticated = true
			conn.UserID = decoded.UserID
			conn.TokenPayload = decoded
		} else {
			// Anonymous connection (no admin privileges)
			conn.Authenticated = true
			if userID, ok := msg.Payload["userId"].(string); ok {
				conn.UserID = userID
			} else {
				conn.UserID = "anonymous"
			}
			conn.TokenPayload = &auth.TokenPayload{
				UserID: conn.UserID,
				Permissions: auth.DocumentPermissions{
					CanRead:  []string{"*"},
					CanWrite: []string{"*"},
					IsAdmin:  false,
				},
			}
		}

		// Set client ID
		if clientID, ok := msg.Payload["clientId"].(string); ok {
			conn.ClientID = clientID
		} else {
			conn.ClientID = generateID()
		}

		// Send success response with permissions
		conn.SendMessage(protocol.TypeAuthSuccess, map[string]interface{}{
			"type":      protocol.TypeAuthSuccess,
			"id":        msg.ID,
			"timestamp": time.Now().UnixMilli(),
			"userId":    conn.UserID,
			"permissions": map[string]interface{}{
				"canRead":  conn.TokenPayload.Permissions.CanRead,
				"canWrite": conn.TokenPayload.Permissions.CanWrite,
				"isAdmin":  conn.TokenPayload.Permissions.IsAdmin,
			},
		})

	case protocol.TypeSubscribe:
		docID, ok := msg.Payload["docId"].(string)
		if !ok {
			conn.SendError("Missing docId", "INVALID_REQUEST")
			return
		}

		// Subscribe
		conn.Subscriptions[docID] = true
		h.mu.Lock()
		if _, exists := h.subscribers[docID]; !exists {
			h.subscribers[docID] = make(map[string]bool)
		}
		h.subscribers[docID][conn.ID] = true
		h.mu.Unlock()

		// Send current document state
		h.docsMu.RLock()
		doc := h.documents[docID]
		h.docsMu.RUnlock()

		if doc == nil {
			doc = make(map[string]interface{})
		}

		conn.SendMessage(protocol.TypeSyncResponse, map[string]interface{}{
			"type":      protocol.TypeSyncResponse,
			"id":        msg.ID,
			"timestamp": time.Now().UnixMilli(),
			"docId":     docID,
			"state":     doc,
		})

	case protocol.TypeDelta:
		docID, ok := msg.Payload["docId"].(string)
		if !ok {
			conn.SendError("Missing docId", "INVALID_REQUEST")
			return
		}

		// Apply delta
		h.docsMu.Lock()
		if h.documents[docID] == nil {
			h.documents[docID] = make(map[string]interface{})
		}
		if changes, ok := msg.Payload["changes"].(map[string]interface{}); ok {
			for k, v := range changes {
				h.documents[docID][k] = v
			}
		}
		h.docsMu.Unlock()

		// Broadcast to other subscribers
		h.broadcastDelta(docID, msg.Payload, conn.ID)

		// Send ACK
		conn.SendMessage(protocol.TypeAck, map[string]interface{}{
			"type":      protocol.TypeAck,
			"id":        msg.ID,
			"timestamp": time.Now().UnixMilli(),
			"docId":     docID,
		})

	case protocol.TypeDeltaBatch:
		docID, ok := msg.Payload["docId"].(string)
		if !ok {
			conn.SendError("Missing docId", "INVALID_REQUEST")
			return
		}

		deltas, ok := msg.Payload["deltas"].([]interface{})
		if !ok {
			conn.SendError("Invalid deltas", "INVALID_REQUEST")
			return
		}

		// Apply each delta
		h.docsMu.Lock()
		if h.documents[docID] == nil {
			h.documents[docID] = make(map[string]interface{})
		}
		for _, deltaRaw := range deltas {
			if delta, ok := deltaRaw.(map[string]interface{}); ok {
				if changes, ok := delta["changes"].(map[string]interface{}); ok {
					for k, v := range changes {
						h.documents[docID][k] = v
					}
				}
				// Broadcast individual delta
				h.broadcastDelta(docID, delta, conn.ID)
			}
		}
		h.docsMu.Unlock()

		// Send ACK
		conn.SendMessage(protocol.TypeAck, map[string]interface{}{
			"type":      protocol.TypeAck,
			"id":        msg.ID,
			"timestamp": time.Now().UnixMilli(),
			"docId":     docID,
			"count":     len(deltas),
		})

	case protocol.TypeAwarenessUpdate:
		docID, ok := msg.Payload["docId"].(string)
		if !ok {
			return
		}
		state, ok := msg.Payload["state"].(map[string]interface{})
		if !ok {
			return
		}

		// Store awareness state
		h.awareMu.Lock()
		if h.awareness[docID] == nil {
			h.awareness[docID] = make(map[string]interface{})
		}
		h.awareness[docID][conn.ClientID] = state
		h.awareMu.Unlock()

		// Broadcast to other subscribers
		h.broadcastAwareness(docID, conn.ClientID, state, conn.ID)
	}
}

func (h *Hub) broadcastDelta(docID string, delta map[string]interface{}, senderID string) {
	h.mu.RLock()
	subs := h.subscribers[docID]
	h.mu.RUnlock()

	if subs == nil {
		return
	}

	for connID := range subs {
		if connID == senderID {
			continue
		}

		h.mu.RLock()
		conn := h.connections[connID]
		h.mu.RUnlock()

		if conn != nil {
			conn.SendMessage(protocol.TypeDelta, delta)
		}
	}
}

func (h *Hub) broadcastAwareness(docID, clientID string, state map[string]interface{}, senderID string) {
	h.mu.RLock()
	subs := h.subscribers[docID]
	h.mu.RUnlock()

	if subs == nil {
		return
	}

	for connID := range subs {
		if connID == senderID {
			continue
		}

		h.mu.RLock()
		conn := h.connections[connID]
		h.mu.RUnlock()

		if conn != nil {
			conn.SendMessage(protocol.TypeAwarenessState, map[string]interface{}{
				"type":      protocol.TypeAwarenessState,
				"id":        generateID(),
				"timestamp": time.Now().UnixMilli(),
				"docId":     docID,
				"clientId":  clientID,
				"state":     state,
			})
		}
	}
}

func generateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}
