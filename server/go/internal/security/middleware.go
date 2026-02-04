// Package security provides rate limiting, input validation, and access control.
// Matches TypeScript reference: server/typescript/src/security/middleware.ts
package security

import (
	"regexp"
	"sync"
	"time"
)

// SecurityLimits matches TypeScript SECURITY_LIMITS
var SecurityLimits = struct {
	MaxConnectionsPerIP  int
	MaxMessagesPerMinute int
	MaxBlocksPerDoc      int
	MaxBlockSize         int
	MaxDocSize           int
	MaxDocsPerIP         int
	MaxDocsPerHour       int
	MaxMessageSize       int
	PlaygroundDocID      string
}{
	MaxConnectionsPerIP:  50,
	MaxMessagesPerMinute: 500,
	MaxBlocksPerDoc:      1000,
	MaxBlockSize:         10_000,    // 10KB
	MaxDocSize:           10_485_760, // 10MB
	MaxDocsPerIP:         20,
	MaxDocsPerHour:       10,
	MaxMessageSize:       2_000_000, // 2MB
	PlaygroundDocID:      "playground",
}

// ValidMessageTypes lists all valid WebSocket message types
var ValidMessageTypes = map[string]bool{
	"connect":            true,
	"auth":               true,
	"auth_success":       true,
	"auth_error":         true,
	"subscribe":          true,
	"unsubscribe":        true,
	"sync_request":       true,
	"sync_response":      true,
	"sync_step1":         true,
	"sync_step2":         true,
	"delta":              true,
	"delta_batch":        true,
	"ack":                true,
	"awareness_update":   true,
	"awareness_subscribe": true,
	"awareness_state":    true,
	"snapshot_request":   true,
	"snapshot_upload":    true,
	"ping":               true,
	"pong":               true,
	"error":              true,
}

// DocumentIDPattern validates document IDs
var DocumentIDPattern = regexp.MustCompile(`^[a-zA-Z0-9_:-]+$`)

// ConnectionLimiter tracks connections per IP
type ConnectionLimiter struct {
	connections map[string]int
	mu          sync.RWMutex
	stopCh      chan struct{}
}

// NewConnectionLimiter creates a new connection limiter
func NewConnectionLimiter() *ConnectionLimiter {
	cl := &ConnectionLimiter{
		connections: make(map[string]int),
		stopCh:      make(chan struct{}),
	}
	go cl.cleanupLoop()
	return cl
}

func (cl *ConnectionLimiter) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			cl.cleanup()
		case <-cl.stopCh:
			return
		}
	}
}

func (cl *ConnectionLimiter) cleanup() {
	cl.mu.Lock()
	defer cl.mu.Unlock()

	for ip, count := range cl.connections {
		if count <= 0 {
			delete(cl.connections, ip)
		}
	}
}

// CanConnect checks if IP can create a new connection
func (cl *ConnectionLimiter) CanConnect(ip string) bool {
	cl.mu.RLock()
	defer cl.mu.RUnlock()

	count := cl.connections[ip]
	return count < SecurityLimits.MaxConnectionsPerIP
}

// AddConnection records a new connection from IP
func (cl *ConnectionLimiter) AddConnection(ip string) {
	cl.mu.Lock()
	defer cl.mu.Unlock()
	cl.connections[ip]++
}

// RemoveConnection removes a connection from IP
func (cl *ConnectionLimiter) RemoveConnection(ip string) {
	cl.mu.Lock()
	defer cl.mu.Unlock()

	if count := cl.connections[ip]; count <= 1 {
		delete(cl.connections, ip)
	} else {
		cl.connections[ip]--
	}
}

// GetConnectionCount returns current connection count for IP
func (cl *ConnectionLimiter) GetConnectionCount(ip string) int {
	cl.mu.RLock()
	defer cl.mu.RUnlock()
	return cl.connections[ip]
}

// Dispose cleans up resources
func (cl *ConnectionLimiter) Dispose() {
	close(cl.stopCh)
}

// ConnectionRateLimiter tracks messages per connection using sliding window
type ConnectionRateLimiter struct {
	messages map[string][]time.Time
	mu       sync.RWMutex
	stopCh   chan struct{}
}

// NewConnectionRateLimiter creates a new connection rate limiter
func NewConnectionRateLimiter() *ConnectionRateLimiter {
	crl := &ConnectionRateLimiter{
		messages: make(map[string][]time.Time),
		stopCh:   make(chan struct{}),
	}
	go crl.cleanupLoop()
	return crl
}

func (crl *ConnectionRateLimiter) cleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			crl.cleanup()
		case <-crl.stopCh:
			return
		}
	}
}

func (crl *ConnectionRateLimiter) cleanup() {
	crl.mu.Lock()
	defer crl.mu.Unlock()

	now := time.Now()
	for connID, timestamps := range crl.messages {
		recent := make([]time.Time, 0)
		for _, ts := range timestamps {
			if now.Sub(ts) < time.Minute {
				recent = append(recent, ts)
			}
		}
		if len(recent) == 0 {
			delete(crl.messages, connID)
		} else {
			crl.messages[connID] = recent
		}
	}
}

// CanSendMessage checks if connection can send a message
func (crl *ConnectionRateLimiter) CanSendMessage(connectionID string) bool {
	crl.mu.RLock()
	defer crl.mu.RUnlock()

	now := time.Now()
	timestamps := crl.messages[connectionID]

	count := 0
	for _, ts := range timestamps {
		if now.Sub(ts) < time.Minute {
			count++
		}
	}

	return count < SecurityLimits.MaxMessagesPerMinute
}

// RecordMessage records a message from connection
func (crl *ConnectionRateLimiter) RecordMessage(connectionID string) {
	crl.mu.Lock()
	defer crl.mu.Unlock()

	crl.messages[connectionID] = append(crl.messages[connectionID], time.Now())
}

// RemoveConnection removes connection tracking data
func (crl *ConnectionRateLimiter) RemoveConnection(connectionID string) {
	crl.mu.Lock()
	defer crl.mu.Unlock()
	delete(crl.messages, connectionID)
}

// Dispose cleans up resources
func (crl *ConnectionRateLimiter) Dispose() {
	close(crl.stopCh)
}

// DocumentLimiter tracks document creation per IP
type DocumentLimiter struct {
	documents map[string]*documentData
	mu        sync.RWMutex
	stopCh    chan struct{}
}

type documentData struct {
	total  int
	hourly []time.Time
}

// NewDocumentLimiter creates a new document limiter
func NewDocumentLimiter() *DocumentLimiter {
	dl := &DocumentLimiter{
		documents: make(map[string]*documentData),
		stopCh:    make(chan struct{}),
	}
	go dl.cleanupLoop()
	return dl
}

func (dl *DocumentLimiter) cleanupLoop() {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			dl.cleanup()
		case <-dl.stopCh:
			return
		}
	}
}

func (dl *DocumentLimiter) cleanup() {
	dl.mu.Lock()
	defer dl.mu.Unlock()

	now := time.Now()
	hourAgo := now.Add(-time.Hour)

	for ip, data := range dl.documents {
		// Filter hourly to last hour only
		recent := make([]time.Time, 0)
		for _, ts := range data.hourly {
			if ts.After(hourAgo) {
				recent = append(recent, ts)
			}
		}
		data.hourly = recent

		// Remove entry if no recent activity and total is 0
		if len(data.hourly) == 0 && data.total == 0 {
			delete(dl.documents, ip)
		}
	}
}

// CanCreateDocument checks if IP can create a document
func (dl *DocumentLimiter) CanCreateDocument(ip string) (bool, string) {
	dl.mu.RLock()
	defer dl.mu.RUnlock()

	data := dl.documents[ip]
	if data == nil {
		return true, ""
	}

	// Check total limit
	if data.total >= SecurityLimits.MaxDocsPerIP {
		return false, "Maximum documents per IP reached"
	}

	// Check hourly limit
	now := time.Now()
	hourAgo := now.Add(-time.Hour)
	count := 0
	for _, ts := range data.hourly {
		if ts.After(hourAgo) {
			count++
		}
	}
	if count >= SecurityLimits.MaxDocsPerHour {
		return false, "Hourly document creation limit reached"
	}

	return true, ""
}

// RecordDocument records a document creation from IP
func (dl *DocumentLimiter) RecordDocument(ip string) {
	dl.mu.Lock()
	defer dl.mu.Unlock()

	if dl.documents[ip] == nil {
		dl.documents[ip] = &documentData{
			total:  0,
			hourly: make([]time.Time, 0),
		}
	}

	dl.documents[ip].total++
	dl.documents[ip].hourly = append(dl.documents[ip].hourly, time.Now())
}

// Dispose cleans up resources
func (dl *DocumentLimiter) Dispose() {
	close(dl.stopCh)
}

// SecurityManager centralizes all security components
type SecurityManager struct {
	ConnectionLimiter     *ConnectionLimiter
	ConnectionRateLimiter *ConnectionRateLimiter
	DocumentLimiter       *DocumentLimiter
}

// NewSecurityManager creates a new security manager
func NewSecurityManager() *SecurityManager {
	return &SecurityManager{
		ConnectionLimiter:     NewConnectionLimiter(),
		ConnectionRateLimiter: NewConnectionRateLimiter(),
		DocumentLimiter:       NewDocumentLimiter(),
	}
}

// Dispose cleans up all resources
func (sm *SecurityManager) Dispose() {
	sm.ConnectionLimiter.Dispose()
	sm.ConnectionRateLimiter.Dispose()
	sm.DocumentLimiter.Dispose()
}

// ValidateMessage validates WebSocket message format
func ValidateMessage(message map[string]interface{}) (bool, string) {
	if message == nil {
		return false, "Invalid message format"
	}

	msgType, ok := message["type"].(string)
	if !ok || msgType == "" {
		return false, "Missing message type"
	}

	if !ValidMessageTypes[msgType] {
		return false, "Invalid message type: " + msgType
	}

	return true, ""
}

// ValidateDocumentID validates document ID format
func ValidateDocumentID(docID string) (bool, string) {
	if docID == "" {
		return false, "Invalid document ID"
	}
	if len(docID) > 256 {
		return false, "Document ID too long (max 256 characters)"
	}
	if !DocumentIDPattern.MatchString(docID) {
		return false, "Document ID contains invalid characters"
	}
	return true, ""
}

// CanAccessDocument checks if document is publicly accessible
func CanAccessDocument(docID string) bool {
	// Playground documents
	if docID == SecurityLimits.PlaygroundDocID {
		return true
	}
	playgroundPrefix := SecurityLimits.PlaygroundDocID + ":"
	if len(docID) > len(playgroundPrefix) && docID[:len(playgroundPrefix)] == playgroundPrefix {
		return true
	}

	// Wordwall documents
	if docID == "wordwall" {
		return true
	}
	if len(docID) > 9 && docID[:9] == "wordwall:" {
		return true
	}

	// Room documents
	if len(docID) > 5 && docID[:5] == "room:" {
		return true
	}

	// Page documents (timestamp IDs - 13+ digits)
	timestampPattern := regexp.MustCompile(`^\d{13,}`)
	if timestampPattern.MatchString(docID) {
		return true
	}

	return false
}
