# SyncKit Stress Test Client - Node.js
# Runs 24/7 on Fly.io for 48-day stress test

FROM node:20-alpine AS builder

WORKDIR /app

# Copy SDK first (local dependency)
COPY ../../sdk /app/sdk
WORKDIR /app/sdk
RUN npm install && npm run build

# Copy stress test client
WORKDIR /app/client
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

# Install dependencies and build
RUN npm install
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy SDK
COPY --from=builder /app/sdk /app/sdk

# Copy built client
COPY --from=builder /app/client/dist ./dist
COPY --from=builder /app/client/package*.json ./
COPY --from=builder /app/client/node_modules ./node_modules

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

# Start the stress test
CMD ["node", "dist/index.js"]
