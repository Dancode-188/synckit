#!/usr/bin/env bash
# Integration test script for AuthController REST endpoints
# Tests all four endpoints: /auth/login, /auth/refresh, /auth/me, /auth/verify

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:8080"

echo "🧪 Testing AuthController REST Endpoints"
echo "==========================================="
echo ""

# Test 1: POST /auth/login
echo "Test 1: POST /auth/login"
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "permissions": {
      "canRead": ["doc-1", "doc-2"],
      "canWrite": ["doc-1"],
      "isAdmin": false
    }
  }')

echo "$LOGIN_RESPONSE" | jq '.' || { echo -e "${RED}❌ Failed to parse login response${NC}"; exit 1; }

ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken')
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.refreshToken')
USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.userId')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" == "null" ]; then
  echo -e "${RED}❌ Login failed - no access token${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Login successful${NC}"
echo "   User ID: $USER_ID"
echo ""

# Test 2: GET /auth/me
echo "Test 2: GET /auth/me"
ME_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

echo "$ME_RESPONSE" | jq '.' || { echo -e "${RED}❌ Failed to parse me response${NC}"; exit 1; }

ME_USER_ID=$(echo "$ME_RESPONSE" | jq -r '.userId')

if [ "$ME_USER_ID" != "$USER_ID" ]; then
  echo -e "${RED}❌ User ID mismatch${NC}"
  exit 1
fi

echo -e "${GREEN}✅ /auth/me successful${NC}"
echo "   Permissions:"
echo "$ME_RESPONSE" | jq '.permissions'
echo ""

# Test 3: POST /auth/verify
echo "Test 3: POST /auth/verify (valid token)"
VERIFY_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/verify" \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"$ACCESS_TOKEN\"}")

echo "$VERIFY_RESPONSE" | jq '.' || { echo -e "${RED}❌ Failed to parse verify response${NC}"; exit 1; }

IS_VALID=$(echo "$VERIFY_RESPONSE" | jq -r '.valid')

if [ "$IS_VALID" != "true" ]; then
  echo -e "${RED}❌ Token verification failed${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Token verification successful${NC}"
echo ""

# Test 4: POST /auth/verify (invalid token)
echo "Test 4: POST /auth/verify (invalid token)"
VERIFY_INVALID_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/verify" \
  -H "Content-Type: application/json" \
  -d '{"token": "invalid-token-xyz"}')

echo "$VERIFY_INVALID_RESPONSE" | jq '.' || { echo -e "${RED}❌ Failed to parse verify invalid response${NC}"; exit 1; }

IS_VALID_INVALID=$(echo "$VERIFY_INVALID_RESPONSE" | jq -r '.valid')

if [ "$IS_VALID_INVALID" != "false" ]; then
  echo -e "${RED}❌ Invalid token should return valid=false${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Invalid token correctly rejected${NC}"
echo ""

# Test 5: POST /auth/refresh
echo "Test 5: POST /auth/refresh"
REFRESH_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}")

echo "$REFRESH_RESPONSE" | jq '.' || { echo -e "${RED}❌ Failed to parse refresh response${NC}"; exit 1; }

NEW_ACCESS_TOKEN=$(echo "$REFRESH_RESPONSE" | jq -r '.accessToken')

if [ -z "$NEW_ACCESS_TOKEN" ] || [ "$NEW_ACCESS_TOKEN" == "null" ]; then
  echo -e "${RED}❌ Refresh failed - no new access token${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Token refresh successful${NC}"
echo ""

# Test 6: Use refreshed token
echo "Test 6: Use refreshed access token in /auth/me"
ME_REFRESH_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $NEW_ACCESS_TOKEN")

echo "$ME_REFRESH_RESPONSE" | jq '.' || { echo -e "${RED}❌ Failed to parse refreshed me response${NC}"; exit 1; }

ME_REFRESH_USER_ID=$(echo "$ME_REFRESH_RESPONSE" | jq -r '.userId')

if [ "$ME_REFRESH_USER_ID" != "$USER_ID" ]; then
  echo -e "${RED}❌ Refreshed token user ID mismatch${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Refreshed token works correctly${NC}"
echo ""

# Test 7: Error handling - missing email
echo "Test 7: Error handling - missing email"
ERROR_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "", "password": "test"}')

ERROR_MSG=$(echo "$ERROR_RESPONSE" | jq -r '.error')

if [ "$ERROR_MSG" != "Email required" ]; then
  echo -e "${RED}❌ Expected 'Email required' error${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Error handling works correctly${NC}"
echo ""

# Summary
echo "==========================================="
echo -e "${GREEN}✅ All AuthController tests passed!${NC}"
echo ""
echo "Summary:"
echo "  ✅ POST /auth/login - Login and token generation"
echo "  ✅ GET /auth/me - User info retrieval"
echo "  ✅ POST /auth/verify - Token validation"
echo "  ✅ POST /auth/verify - Invalid token rejection"
echo "  ✅ POST /auth/refresh - Token refresh"
echo "  ✅ Refreshed token usage"
echo "  ✅ Error handling"
