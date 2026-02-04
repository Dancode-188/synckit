package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisPubSub implements multi-server coordination via Redis pub/sub.
// Matches TypeScript reference: server/typescript/src/storage/redis.ts
type RedisPubSub struct {
	publisher     *redis.Client
	subscriber    *redis.Client
	connected     bool
	channelPrefix string
	handlers      map[string][]func([]byte)
	handlersMu    sync.RWMutex
	pubsubs       map[string]*redis.PubSub // Track active subscriptions
	pubsubsMu     sync.RWMutex
}

// RedisPubSubConfig holds Redis connection configuration
type RedisPubSubConfig struct {
	URL           string
	ChannelPrefix string
	MaxRetries    int
}

// DefaultRedisPubSubConfig returns sensible defaults
func DefaultRedisPubSubConfig() *RedisPubSubConfig {
	return &RedisPubSubConfig{
		ChannelPrefix: "synckit:",
		MaxRetries:    3,
	}
}

// NewRedisPubSub creates a new Redis pub/sub adapter
func NewRedisPubSub(config *RedisPubSubConfig) (*RedisPubSub, error) {
	if config == nil {
		config = DefaultRedisPubSubConfig()
	}

	opt, err := redis.ParseURL(config.URL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Redis URL: %w", err)
	}

	opt.MaxRetries = config.MaxRetries

	return &RedisPubSub{
		publisher:     redis.NewClient(opt),
		subscriber:    redis.NewClient(opt),
		channelPrefix: config.ChannelPrefix,
		handlers:      make(map[string][]func([]byte)),
		pubsubs:       make(map[string]*redis.PubSub),
	}, nil
}

// Connect establishes Redis connections
func (r *RedisPubSub) Connect(ctx context.Context) error {
	if err := r.publisher.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("failed to connect publisher: %w", err)
	}
	if err := r.subscriber.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("failed to connect subscriber: %w", err)
	}
	r.connected = true
	return nil
}

// Disconnect closes Redis connections
func (r *RedisPubSub) Disconnect(ctx context.Context) error {
	r.connected = false

	// Close all pubsub subscriptions
	r.pubsubsMu.Lock()
	for _, ps := range r.pubsubs {
		ps.Close()
	}
	r.pubsubs = make(map[string]*redis.PubSub)
	r.pubsubsMu.Unlock()

	// Close client connections
	r.publisher.Close()
	r.subscriber.Close()
	return nil
}

// IsConnected returns connection status
func (r *RedisPubSub) IsConnected() bool {
	return r.connected
}

// HealthCheck verifies Redis connectivity
func (r *RedisPubSub) HealthCheck(ctx context.Context) (bool, error) {
	err := r.publisher.Ping(ctx).Err()
	return err == nil, err
}

// ==========================================================================
// DOCUMENT CHANNELS
// ==========================================================================

// PublishDelta publishes a delta to a document channel
func (r *RedisPubSub) PublishDelta(ctx context.Context, documentID string, delta interface{}) error {
	channel := r.getDocumentChannel(documentID)
	return r.publish(ctx, channel, delta)
}

// SubscribeToDocument subscribes to document updates
func (r *RedisPubSub) SubscribeToDocument(ctx context.Context, documentID string, handler func([]byte)) error {
	channel := r.getDocumentChannel(documentID)
	return r.subscribe(ctx, channel, handler)
}

// UnsubscribeFromDocument unsubscribes from document updates
func (r *RedisPubSub) UnsubscribeFromDocument(ctx context.Context, documentID string) error {
	channel := r.getDocumentChannel(documentID)
	return r.unsubscribe(ctx, channel)
}

// ==========================================================================
// BROADCAST CHANNELS
// ==========================================================================

// BroadcastEvent represents a broadcast event
type BroadcastEvent struct {
	Event string      `json:"event"`
	Data  interface{} `json:"data"`
}

// PublishBroadcast publishes to the broadcast channel (all servers)
func (r *RedisPubSub) PublishBroadcast(ctx context.Context, event string, data interface{}) error {
	channel := r.getBroadcastChannel()
	payload := BroadcastEvent{
		Event: event,
		Data:  data,
	}
	return r.publish(ctx, channel, payload)
}

// SubscribeToBroadcast subscribes to the broadcast channel
func (r *RedisPubSub) SubscribeToBroadcast(ctx context.Context, handler func(event string, data interface{})) error {
	channel := r.getBroadcastChannel()
	return r.subscribe(ctx, channel, func(data []byte) {
		var evt BroadcastEvent
		if err := json.Unmarshal(data, &evt); err == nil {
			handler(evt.Event, evt.Data)
		}
	})
}

// ==========================================================================
// PRESENCE CHANNELS (Server coordination)
// ==========================================================================

// PresenceEvent represents a server presence event
type PresenceEvent struct {
	Type      string                 `json:"type"`      // "server_online" or "server_offline"
	ServerID  string                 `json:"serverId"`
	Timestamp int64                  `json:"timestamp"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

// AnnouncePresence announces server presence
func (r *RedisPubSub) AnnouncePresence(ctx context.Context, serverID string, metadata map[string]interface{}) error {
	channel := r.getPresenceChannel()
	payload := PresenceEvent{
		Type:      "server_online",
		ServerID:  serverID,
		Timestamp: time.Now().UnixMilli(),
		Metadata:  metadata,
	}
	return r.publish(ctx, channel, payload)
}

// AnnounceShutdown announces server shutdown
func (r *RedisPubSub) AnnounceShutdown(ctx context.Context, serverID string) error {
	channel := r.getPresenceChannel()
	payload := PresenceEvent{
		Type:      "server_offline",
		ServerID:  serverID,
		Timestamp: time.Now().UnixMilli(),
	}
	return r.publish(ctx, channel, payload)
}

// SubscribeToPresence subscribes to server presence events
func (r *RedisPubSub) SubscribeToPresence(ctx context.Context, handler func(event string, serverID string, metadata map[string]interface{})) error {
	channel := r.getPresenceChannel()
	return r.subscribe(ctx, channel, func(data []byte) {
		var evt PresenceEvent
		if err := json.Unmarshal(data, &evt); err == nil {
			var eventType string
			if evt.Type == "server_online" {
				eventType = "online"
			} else if evt.Type == "server_offline" {
				eventType = "offline"
			} else {
				return
			}
			handler(eventType, evt.ServerID, evt.Metadata)
		}
	})
}

// ==========================================================================
// CORE PUB/SUB OPERATIONS
// ==========================================================================

// publish sends data to a channel
func (r *RedisPubSub) publish(ctx context.Context, channel string, data interface{}) error {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal data: %w", err)
	}
	return r.publisher.Publish(ctx, channel, jsonData).Err()
}

// subscribe registers a handler for a channel
func (r *RedisPubSub) subscribe(ctx context.Context, channel string, handler func([]byte)) error {
	r.handlersMu.Lock()
	r.handlers[channel] = append(r.handlers[channel], handler)
	isFirstHandler := len(r.handlers[channel]) == 1
	r.handlersMu.Unlock()

	// Only create pubsub if this is the first handler for this channel
	if isFirstHandler {
		pubsub := r.subscriber.Subscribe(ctx, channel)

		r.pubsubsMu.Lock()
		r.pubsubs[channel] = pubsub
		r.pubsubsMu.Unlock()

		// Start message handler goroutine
		go r.handleMessages(channel, pubsub)
	}

	return nil
}

// unsubscribe removes handlers and unsubscribes from a channel
func (r *RedisPubSub) unsubscribe(ctx context.Context, channel string) error {
	r.handlersMu.Lock()
	delete(r.handlers, channel)
	r.handlersMu.Unlock()

	r.pubsubsMu.Lock()
	if ps, ok := r.pubsubs[channel]; ok {
		ps.Unsubscribe(ctx, channel)
		ps.Close()
		delete(r.pubsubs, channel)
	}
	r.pubsubsMu.Unlock()

	return nil
}

// handleMessages processes incoming messages for a channel
func (r *RedisPubSub) handleMessages(channel string, pubsub *redis.PubSub) {
	ch := pubsub.Channel()
	for msg := range ch {
		r.handlersMu.RLock()
		handlers := r.handlers[channel]
		r.handlersMu.RUnlock()

		for _, handler := range handlers {
			go func(h func([]byte)) {
				defer func() {
					if r := recover(); r != nil {
						// Log panic but don't crash
					}
				}()
				h([]byte(msg.Payload))
			}(handler)
		}
	}
}

// ==========================================================================
// CHANNEL NAMING
// ==========================================================================

func (r *RedisPubSub) getDocumentChannel(documentID string) string {
	return fmt.Sprintf("%sdoc:%s", r.channelPrefix, documentID)
}

func (r *RedisPubSub) getBroadcastChannel() string {
	return r.channelPrefix + "broadcast"
}

func (r *RedisPubSub) getPresenceChannel() string {
	return r.channelPrefix + "presence"
}

// ==========================================================================
// STATISTICS
// ==========================================================================

// Stats holds pub/sub statistics
type Stats struct {
	Connected          bool `json:"connected"`
	SubscribedChannels int  `json:"subscribedChannels"`
	TotalHandlers      int  `json:"totalHandlers"`
}

// GetStats returns pub/sub statistics
func (r *RedisPubSub) GetStats() Stats {
	r.handlersMu.RLock()
	defer r.handlersMu.RUnlock()

	totalHandlers := 0
	for _, handlers := range r.handlers {
		totalHandlers += len(handlers)
	}

	return Stats{
		Connected:          r.connected,
		SubscribedChannels: len(r.handlers),
		TotalHandlers:      totalHandlers,
	}
}
