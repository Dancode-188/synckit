package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "this-is-a-test-secret-that-is-at-least-32-chars"

func TestVerifyToken_ValidToken(t *testing.T) {
	perms := CreateAdminPermissions()
	token, err := GenerateAccessToken("user-1", "test@example.com", perms, testSecret, time.Hour)
	if err != nil {
		t.Fatalf("GenerateAccessToken failed: %v", err)
	}

	payload, err := VerifyToken(token, testSecret)
	if err != nil {
		t.Fatalf("VerifyToken failed: %v", err)
	}

	if payload.UserID != "user-1" {
		t.Errorf("UserID = %q, want %q", payload.UserID, "user-1")
	}
	if payload.Email != "test@example.com" {
		t.Errorf("Email = %q, want %q", payload.Email, "test@example.com")
	}
	if !payload.Permissions.IsAdmin {
		t.Error("Expected IsAdmin to be true")
	}
}

func TestVerifyToken_InvalidSignature(t *testing.T) {
	token, err := GenerateAccessToken("user-1", "test@example.com", CreateAdminPermissions(), testSecret, time.Hour)
	if err != nil {
		t.Fatalf("GenerateAccessToken failed: %v", err)
	}

	wrongSecret := "a-different-secret-that-is-also-at-least-32-chars"
	_, err = VerifyToken(token, wrongSecret)
	if err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken, got %v", err)
	}
}

func TestVerifyToken_ExpiredToken(t *testing.T) {
	token, err := GenerateAccessToken("user-1", "", CreateAdminPermissions(), testSecret, -time.Hour)
	if err != nil {
		t.Fatalf("GenerateAccessToken failed: %v", err)
	}

	_, err = VerifyToken(token, testSecret)
	if err != ErrExpiredToken {
		t.Errorf("expected ErrExpiredToken, got %v", err)
	}
}

func TestVerifyToken_ShortSecret(t *testing.T) {
	_, err := VerifyToken("some.token.here", "short")
	if err != ErrShortSecret {
		t.Errorf("expected ErrShortSecret, got %v", err)
	}
}

func TestVerifyToken_MalformedToken(t *testing.T) {
	_, err := VerifyToken("not-a-jwt", testSecret)
	if err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken, got %v", err)
	}
}

func TestGenerateAccessToken_ShortSecret(t *testing.T) {
	_, err := GenerateAccessToken("user-1", "", CreateAdminPermissions(), "short", time.Hour)
	if err != ErrShortSecret {
		t.Errorf("expected ErrShortSecret, got %v", err)
	}
}

func TestGenerateRefreshToken(t *testing.T) {
	token, err := GenerateRefreshToken("user-1", testSecret, 7*24*time.Hour)
	if err != nil {
		t.Fatalf("GenerateRefreshToken failed: %v", err)
	}

	// Verify it's a valid JWT by parsing
	parsed, err := jwt.ParseWithClaims(token, &jwt.RegisteredClaims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(testSecret), nil
	})
	if err != nil {
		t.Fatalf("Failed to parse refresh token: %v", err)
	}

	claims, ok := parsed.Claims.(*jwt.RegisteredClaims)
	if !ok {
		t.Fatal("Failed to extract claims")
	}
	if claims.Subject != "user-1" {
		t.Errorf("Subject = %q, want %q", claims.Subject, "user-1")
	}
}

func TestGenerateRefreshToken_ShortSecret(t *testing.T) {
	_, err := GenerateRefreshToken("user-1", "short", 7*24*time.Hour)
	if err != ErrShortSecret {
		t.Errorf("expected ErrShortSecret, got %v", err)
	}
}

func TestGenerateTokens(t *testing.T) {
	perms := CreateUserPermissions([]string{"doc-1", "doc-2"}, []string{"doc-1"})
	access, refresh, err := GenerateTokens("user-1", "test@example.com", perms, testSecret)
	if err != nil {
		t.Fatalf("GenerateTokens failed: %v", err)
	}

	if access == "" {
		t.Error("Expected non-empty access token")
	}
	if refresh == "" {
		t.Error("Expected non-empty refresh token")
	}

	// Verify access token has correct permissions
	payload, err := VerifyToken(access, testSecret)
	if err != nil {
		t.Fatalf("VerifyToken failed: %v", err)
	}
	if len(payload.Permissions.CanRead) != 2 {
		t.Errorf("CanRead length = %d, want 2", len(payload.Permissions.CanRead))
	}
	if len(payload.Permissions.CanWrite) != 1 {
		t.Errorf("CanWrite length = %d, want 1", len(payload.Permissions.CanWrite))
	}
}

func TestGenerateTokens_ShortSecret(t *testing.T) {
	_, _, err := GenerateTokens("user-1", "", CreateAdminPermissions(), "short")
	if err != ErrShortSecret {
		t.Errorf("expected ErrShortSecret, got %v", err)
	}
}

func TestDecodeTokenWithoutVerification(t *testing.T) {
	token, err := GenerateAccessToken("user-1", "test@example.com", CreateAdminPermissions(), testSecret, time.Hour)
	if err != nil {
		t.Fatalf("GenerateAccessToken failed: %v", err)
	}

	payload, err := DecodeTokenWithoutVerification(token)
	if err != nil {
		t.Fatalf("DecodeTokenWithoutVerification failed: %v", err)
	}
	if payload.UserID != "user-1" {
		t.Errorf("UserID = %q, want %q", payload.UserID, "user-1")
	}
}

func TestCanReadDocument_Admin(t *testing.T) {
	payload := &TokenPayload{
		Permissions: CreateAdminPermissions(),
	}
	if !CanReadDocument(payload, "any-doc") {
		t.Error("Admin should be able to read any document")
	}
}

func TestCanReadDocument_SpecificDoc(t *testing.T) {
	payload := &TokenPayload{
		Permissions: CreateUserPermissions([]string{"doc-1", "doc-2"}, nil),
	}
	if !CanReadDocument(payload, "doc-1") {
		t.Error("User should be able to read doc-1")
	}
	if CanReadDocument(payload, "doc-3") {
		t.Error("User should not be able to read doc-3")
	}
}

func TestCanReadDocument_Wildcard(t *testing.T) {
	payload := &TokenPayload{
		Permissions: CreateUserPermissions([]string{"*"}, nil),
	}
	if !CanReadDocument(payload, "any-doc") {
		t.Error("Wildcard should allow reading any document")
	}
}

func TestCanReadDocument_NilPayload(t *testing.T) {
	if CanReadDocument(nil, "doc-1") {
		t.Error("Nil payload should not allow read")
	}
}

func TestCanWriteDocument_Admin(t *testing.T) {
	payload := &TokenPayload{
		Permissions: CreateAdminPermissions(),
	}
	if !CanWriteDocument(payload, "any-doc") {
		t.Error("Admin should be able to write any document")
	}
}

func TestCanWriteDocument_SpecificDoc(t *testing.T) {
	payload := &TokenPayload{
		Permissions: CreateUserPermissions(nil, []string{"doc-1"}),
	}
	if !CanWriteDocument(payload, "doc-1") {
		t.Error("User should be able to write doc-1")
	}
	if CanWriteDocument(payload, "doc-2") {
		t.Error("User should not be able to write doc-2")
	}
}

func TestCanWriteDocument_NilPayload(t *testing.T) {
	if CanWriteDocument(nil, "doc-1") {
		t.Error("Nil payload should not allow write")
	}
}

func TestCreateAdminPermissions(t *testing.T) {
	perms := CreateAdminPermissions()
	if !perms.IsAdmin {
		t.Error("Expected IsAdmin true")
	}
	if len(perms.CanRead) != 1 || perms.CanRead[0] != "*" {
		t.Error("Expected CanRead to be [*]")
	}
	if len(perms.CanWrite) != 1 || perms.CanWrite[0] != "*" {
		t.Error("Expected CanWrite to be [*]")
	}
}

func TestCreateUserPermissions(t *testing.T) {
	perms := CreateUserPermissions([]string{"a", "b"}, []string{"a"})
	if perms.IsAdmin {
		t.Error("Expected IsAdmin false")
	}
	if len(perms.CanRead) != 2 {
		t.Errorf("CanRead length = %d, want 2", len(perms.CanRead))
	}
	if len(perms.CanWrite) != 1 {
		t.Errorf("CanWrite length = %d, want 1", len(perms.CanWrite))
	}
}
