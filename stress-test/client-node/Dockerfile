# SyncKit Stress Test Client - Node.js
# Runs 24/7 on Fly.io for 48-day stress test

FROM node:20-alpine AS builder

WORKDIR /app

# Copy SDK first (local dependency)
COPY sdk /app/sdk
WORKDIR /app/sdk
RUN npm install && npm run build

# Copy stress test client
WORKDIR /app/client
COPY stress-test/client-node/package*.json ./
COPY stress-test/client-node/tsconfig.json ./
COPY stress-test/client-node/src ./src

# Fix SDK path in package.json for Docker build context
RUN sed -i 's|"file:../../sdk"|"file:../sdk"|g' package.json

# Install dependencies and build
RUN npm install
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy SDK with proper structure
COPY --from=builder /app/sdk /app/sdk

# Create client directory and copy files with proper structure
WORKDIR /app/client
COPY --from=builder /app/client/dist ./dist
COPY --from=builder /app/client/package*.json ./

# Install production dependencies fresh (ensures proper path resolution)
RUN npm install --production

# Create metrics directory
RUN mkdir -p /app/metrics

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs

# Set environment
ENV NODE_ENV=production
ENV METRICS_DIR=/app/metrics

# Start the stress test from /app/client directory
# Use sh -c to ensure we're in the right directory
CMD ["sh", "-c", "cd /app/client && exec node dist/index.js"]
