package config

import (
	"os"
	"strconv"
)

// Config holds server configuration
type Config struct {
	// Server
	Host        string
	Port        int
	Environment string

	// Authentication
	JWTSecret string

	// Database (optional)
	DatabaseURL string

	// Redis (optional)
	RedisURL          string
	RedisChannelPrefix string

	// CORS
	CORSOrigins []string
}

// Load loads configuration from environment variables
func Load() *Config {
	return &Config{
		Host:               getEnv("HOST", "0.0.0.0"),
		Port:               getEnvInt("PORT", 8080),
		Environment:        getEnv("ENVIRONMENT", "development"),
		JWTSecret:          getEnv("JWT_SECRET", "your-secret-key-change-in-production"),
		DatabaseURL:        getEnv("DATABASE_URL", ""),
		RedisURL:           getEnv("REDIS_URL", ""),
		RedisChannelPrefix: getEnv("REDIS_CHANNEL_PREFIX", "synckit"),
		CORSOrigins:        []string{"*"}, // TODO: Parse from env
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}
