#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
COMPOSE_FILE="$(cd "$(dirname "$0")" && pwd)/docker-compose.test.yml"
ARTIFACTS_DIR="$ROOT_DIR/artifacts/e2e-tests"
mkdir -p "$ARTIFACTS_DIR"

echo "Starting test environment..."
docker compose -f "$COMPOSE_FILE" up -d --build

# Wait for composed services to be healthy (docker-compose healthchecks + container health status)
echo "Waiting for synckit-dotnet to be healthy..."
# Poll health status
for i in {1..60}; do
  container_id=$(docker compose -f "$COMPOSE_FILE" ps -q synckit-dotnet || true)
  if [[ -n "$container_id" ]]; then
    status=$(docker inspect --format='{{.State.Health.Status}}' "$container_id" 2>/dev/null || true)
    if [[ "$status" == "healthy" ]]; then
      echo "synckit-dotnet is healthy"
      break
    fi
  fi
  echo -n "."
  sleep 2
done

# Show container logs for debugging if not healthy
if [[ "$status" != "healthy" ]]; then
  echo "Server never became healthy. Dumping logs..."
  container_id=$(docker compose -f "$COMPOSE_FILE" ps -q synckit-dotnet || true)
  if [[ -n "$container_id" ]]; then
    docker logs "$container_id" > "$ARTIFACTS_DIR/server.log" || true
    docker inspect "$container_id" > "$ARTIFACTS_DIR/server.inspect.json" || true
  else
    echo "No container id found for synckit-dotnet; collecting compose logs instead"
    docker compose -f "$COMPOSE_FILE" logs synckit-dotnet > "$ARTIFACTS_DIR/server.log" || true
    docker compose -f "$COMPOSE_FILE" ps -a > "$ARTIFACTS_DIR/compose.ps.txt" || true
  fi
  docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans
  exit 1
fi

# Test runner: run JS test suite in repo/tests (bun)
export SYNCKIT_SERVER_URL=ws://localhost:8080/ws
cd "$ROOT_DIR/tests"

# Check for bun; if not present, try to use node/npm as fallback
if command -v bun >/dev/null 2>&1; then
  echo "Using bun to run tests"
  bun test --reporter junit --reporter-outfile="$ARTIFACTS_DIR/junit-default.xml" || true
  echo "Running parallel (4 jobs) to validate parallel execution"
  bun test --jobs 4 --reporter junit --reporter-outfile="$ARTIFACTS_DIR/junit-parallel-4.xml" || true
else
  echo "bun not found. Please install bun (https://bun.sh) or run the tests locally with bun. Attempting using npm test..."
  npm ci
  npm test || true
fi

# Collect logs and docker inspect
container_id=$(docker compose -f "$COMPOSE_FILE" ps -q synckit-dotnet || true)
if [[ -n "$container_id" ]]; then
  docker logs "$container_id" > "$ARTIFACTS_DIR/server.log" || true
  docker inspect "$container_id" > "$ARTIFACTS_DIR/server.inspect.json" || true
fi

# Cleanup
echo "Cleaning up test environment..."
docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans

echo "Artifacts available in: $ARTIFACTS_DIR"
