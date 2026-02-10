package websocket

import (
	"sync"
	"time"

	"github.com/Dancode-188/synckit/server/go/internal/auth"
	"github.com/Dancode-188/synckit/server/go/internal/protocol"
	"github.com/Dancode-188/synckit/server/go/internal/security"
	"github.com/gorilla/websocket"
)

// Connection represents a single WebSocket connection
type Connection struct {
	ID            string
	UserID        string
	ClientID      string
	ClientIP      string
	Authenticated bool
	TokenPayload  *auth.TokenPayload // Verified token payload for RBAC
	Subscriptions map[string]bool    // docId -> subscribed
	AwarenessSubscriptions map[string]bool
	ConnectedAt   time.Time
	SecurityManager *security.SecurityManager

	ws   *websocket.Conn
	send chan []byte
	hub  *Hub
	mu   sync.Mutex
}

// NewConnection creates a new connection
func NewConnection(id string, ws *websocket.Conn, hub *Hub) *Connection {
	return &Connection{
		ID:            id,
		Subscriptions: make(map[string]bool),
		AwarenessSubscriptions: make(map[string]bool),
		ConnectedAt:   time.Time{},
		ws:            ws,
		send:          make(chan []byte, 256),
		hub:           hub,
	}
}

// SendMessage sends a message to the client
func (c *Connection) SendMessage(messageType string, payload map[string]interface{}) error {
	timestamp := time.Now().UnixMilli()
	data, err := protocol.EncodeMessage(messageType, payload, timestamp)
	if err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	select {
	case c.send <- data:
		return nil
	default:
		return ErrSendQueueFull
	}
}

// SendError sends an error message
func (c *Connection) SendError(errorMsg, errorCode string) error {
	return c.SendMessage(protocol.TypeError, map[string]interface{}{
		"type":      protocol.TypeError,
		"id":        generateID(),
		"timestamp": time.Now().UnixMilli(),
		"error":     errorMsg,
		"code":      errorCode,
	})
}

// ReadPump pumps messages from the WebSocket connection to the hub
func (c *Connection) ReadPump() {
	defer func() {
		// Clean up rate limiter on disconnect
		if c.SecurityManager != nil {
			c.SecurityManager.ConnectionRateLimiter.RemoveConnection(c.ID)
			c.SecurityManager.ConnectionLimiter.RemoveConnection(c.ClientIP)
		}
		c.hub.Unregister <- c
		c.ws.Close()
	}()

	c.ws.SetReadDeadline(time.Now().Add(pongWait))
	c.ws.SetPongHandler(func(string) error {
		c.ws.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.ws.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				// Log error
			}
			break
		}

		// Per-connection rate limiting
		if c.SecurityManager != nil {
			if !c.SecurityManager.ConnectionRateLimiter.CanSendMessage(c.ID) {
				c.SendError("Too many messages. Please slow down.", "RATE_LIMIT_EXCEEDED")
				continue
			}
			c.SecurityManager.ConnectionRateLimiter.RecordMessage(c.ID)
		}

		// Decode message
		msg, err := protocol.DecodeMessage(message)
		if err != nil {
			c.SendError("Invalid message: "+err.Error(), "INVALID_MESSAGE")
			continue
		}

		// Handle message
		c.hub.HandleMessage <- &MessageEvent{
			Connection: c,
			Message:    msg,
		}
	}
}

// WritePump pumps messages from the hub to the WebSocket connection
func (c *Connection) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.ws.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.ws.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel
				c.ws.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.ws.WriteMessage(websocket.BinaryMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			c.ws.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.ws.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = (pongWait * 9) / 10
)

var ErrSendQueueFull = NewError("send queue is full")

func NewError(msg string) error {
	return &ErrorType{Message: msg}
}

type ErrorType struct {
	Message string
}

func (e *ErrorType) Error() string {
	return e.Message
}
