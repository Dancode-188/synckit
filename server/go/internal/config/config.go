package config

import (
	"fmt"
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
	env := getEnv("ENVIRONMENT", "development")
	jwtSecret := getEnv("JWT_SECRET", "")

	if jwtSecret == "" {
		if env == "production" {
			panic("JWT_SECRET environment variable is required in production")
		}
		jwtSecret = "development-secret-do-not-use-in-production"
	}

	if env == "production" && len(jwtSecret) < 32 {
		panic(fmt.Sprintf("JWT_SECRET must be at least 32 characters in production (got %d)", len(jwtSecret)))
	}

	return &Config{
		Host:               getEnv("HOST", "0.0.0.0"),
		Port:               getEnvInt("PORT", 8080),
		Environment:        env,
		JWTSecret:          jwtSecret,
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
