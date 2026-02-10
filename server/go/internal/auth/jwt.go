// Package auth provides JWT authentication for SyncKit server.
// Matches TypeScript reference: server/typescript/src/auth/jwt.ts
package auth

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// DocumentPermissions represents document-level permissions
type DocumentPermissions struct {
	CanRead  []string `json:"canRead"`  // Document IDs user can read
	CanWrite []string `json:"canWrite"` // Document IDs user can write
	IsAdmin  bool     `json:"isAdmin"`  // Admin has access to all documents
}

// TokenPayload represents JWT token claims
type TokenPayload struct {
	UserID      string              `json:"userId"`
	Email       string              `json:"email,omitempty"`
	Permissions DocumentPermissions `json:"permissions"`
	jwt.RegisteredClaims
}

// Errors for JWT validation
var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("token expired")
	ErrShortSecret  = errors.New("JWT secret must be at least 32 characters")
)

// VerifyToken verifies and decodes a JWT token.
//
// Must match TypeScript behavior exactly:
// - Validate signature with secret
// - Check expiration
// - Return nil on any error (no exceptions propagated)
func VerifyToken(tokenString, secret string) (*TokenPayload, error) {
	// Validate secret length (security requirement)
	if len(secret) < 32 {
		return nil, ErrShortSecret
	}

	token, err := jwt.ParseWithClaims(tokenString, &TokenPayload{}, func(token *jwt.Token) (interface{}, error) {
		// Validate signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		return nil, ErrInvalidToken
	}

	if claims, ok := token.Claims.(*TokenPayload); ok && token.Valid {
		return claims, nil
	}

	return nil, ErrInvalidToken
}

// GenerateAccessToken generates a JWT access token.
func GenerateAccessToken(userID string, email string, permissions DocumentPermissions, secret string, expiresIn time.Duration) (string, error) {
	if len(secret) < 32 {
		return "", ErrShortSecret
	}

	now := time.Now()
	claims := &TokenPayload{
		UserID:      userID,
		Email:       email,
		Permissions: permissions,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(expiresIn)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// GenerateRefreshToken generates a JWT refresh token.
func GenerateRefreshToken(userID, secret string, expiresIn time.Duration) (string, error) {
	if len(secret) < 32 {
		return "", ErrShortSecret
	}

	now := time.Now()
	claims := jwt.RegisteredClaims{
		Subject:   userID,
		ExpiresAt: jwt.NewNumericDate(now.Add(expiresIn)),
		IssuedAt:  jwt.NewNumericDate(now),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// GenerateTokens generates both access and refresh tokens for a user.
func GenerateTokens(userID, email string, permissions DocumentPermissions, secret string) (accessToken, refreshToken string, err error) {
	accessToken, err = GenerateAccessToken(userID, email, permissions, secret, 24*time.Hour)
	if err != nil {
		return "", "", err
	}

	refreshToken, err = GenerateRefreshToken(userID, secret, 7*24*time.Hour)
	if err != nil {
		return "", "", err
	}

	return accessToken, refreshToken, nil
}

// DecodeTokenWithoutVerification decodes token without verification (for debugging).
func DecodeTokenWithoutVerification(tokenString string) (*TokenPayload, error) {
	token, _, err := new(jwt.Parser).ParseUnverified(tokenString, &TokenPayload{})
	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*TokenPayload); ok {
		return claims, nil
	}

	return nil, ErrInvalidToken
}
