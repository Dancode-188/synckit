# SyncKit 48-Day Production Stress Test

**Purpose:** Validate v0.3.0 stability under extended production load before launch.

**Timeline:** January 4, 2026 - February 21, 2026 (48 days)

**Status:** 🚧 Setting up infrastructure

---

## Overview

This stress test validates:
1. **Memory leak fixes** from PR #56 (4 leaks patched)
2. **OPFS storage adapter** performance under sustained load
3. **WebSocket connection stability** over extended periods
4. **Server-side resource management** (connections, batching, awareness)
5. **Client-side memory stability** in browser environments

## Test Methodology

### Client Behavior
- **Operations:** 1 operation/second (86,400 ops/day)
- **Operation Mix:**
  - 40% Creates (new todos)
  - 30% Updates (toggle completed)
  - 15% Deletes (remove todos)
  - 15% Reads (list all todos)
- **Storage:** OPFS (Origin Private File System)
- **Connection:** WebSocket with automatic reconnection
- **Monitoring:** Memory snapshots every minute

### Expected Totals (48 days)
- **Total Operations:** ~4,147,200
- **Documents Created:** ~1,658,880
- **Documents Updated:** ~1,244,160
- **Documents Deleted:** ~622,080

### Success Criteria
- ✅ Zero memory leaks (stable heap usage)
- ✅ >99% operation success rate
- ✅ <10 unexpected disconnections
- ✅ No data corruption or loss
- ✅ Client remains responsive throughout

---

## Architecture

```
┌─────────────────────────────────────────────┐
│   Stress Test Client (Browser)              │
│   - OPFS Storage                            │
│   - WebSocket Connection                    │
│   - Metrics Dashboard                       │
└─────────────┬───────────────────────────────┘
              │ WSS (WebSocket Secure)
              │
┌─────────────▼───────────────────────────────┐
│   SyncKit Server (Fly.io)                   │
│   - Memory Leak Fixes Applied               │
│   - LRU Cache (1000 docs)                   │
│   - Batch Timer Cleanup                     │
│   - Event Handler Cleanup                   │
└─────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Deploy Server to Fly.io

```bash
cd server/typescript

# Login to Fly.io
fly auth login

# Create app for stress test
fly launch --name synckit-stress-test --region sjc

# Set secrets
fly secrets set JWT_SECRET=$(openssl rand -base64 32)

# Deploy
fly deploy
```

### 2. Run Stress Test Client

```bash
cd stress-test/client

# Install dependencies
npm install

# Configure server URL
cp .env.example .env
# Edit .env and set VITE_SERVER_URL=wss://synckit-stress-test.fly.dev

# Start client
npm run dev
```

### 3. Access Dashboard

Open browser to http://localhost:3000

The stress test will:
1. Connect to the Fly.io server
2. Initialize OPFS storage
3. Start performing operations (1/second)
4. Display real-time metrics

### 4. Keep Browser Tab Open

**IMPORTANT:** Keep the browser tab open and active for the full 48 days.

**Tips:**
- Use a dedicated browser profile
- Disable sleep mode on the computer
- Use browser extension to prevent tab from sleeping
- Check metrics daily via the dashboard

---

## Monitoring

### Real-Time Dashboard

The client dashboard displays:
- ⏱️ **Uptime** (days, hours, minutes)
- 📈 **Total Operations** (running count)
- ✅ **Success Rate** (percentage)
- ❌ **Failed Operations** (count)
- 🔄 **Reconnects** (connection drops)
- 💾 **Memory Usage** (heap size in MB)
- 📊 **Progress** (% of 48 days completed)

### Exporting Metrics

Click "Export Metrics" button to download JSON file with:
- Full operation history
- Memory usage timeline (last 24 hours)
- Error logs (last 100)
- Timestamps and statistics

### Server-Side Monitoring

```bash
# View server logs
fly logs -a synckit-stress-test

# Check server status
fly status -a synckit-stress-test

# Monitor resource usage
fly dashboard -a synckit-stress-test
```

---

## Files

```
stress-test/
├── client/
│   ├── index.html          # Dashboard UI
│   ├── stress-test.ts      # Client implementation
│   ├── package.json        # Dependencies
│   ├── vite.config.js      # Dev server config
│   └── .env.example        # Server URL config
├── fly.toml                # Fly.io deployment config (custom)
└── README.md               # This file
```

---

## Expected Results

### Memory Baseline (From PR #56 Audit)

**Leaks Fixed:**
1. **Batch Timers** - Cleared on disconnect ✅
2. **Event Handlers** - Explicit cleanup ✅
3. **Documents Cache** - LRU eviction (1000 docs) ✅
4. **Awareness States** - Removed when empty ✅

**Expected Behavior:**
- Client heap should stabilize after initial ramp-up (~100-200 MB)
- Server memory should remain stable with LRU eviction
- No unbounded growth in any data structures

### Performance Baseline (From BENCHMARK_RESULTS.md)

**OPFS Performance:**
- Write Small (10 items): 0.52ms avg
- Write Medium (100 items): 1.52ms avg
- Write Large (1000 items): 5.30ms avg
- Read: 0.68ms avg
- Delete: 0.44ms avg

**Target:** Operations should maintain these latencies throughout 48 days.

---

## Troubleshooting

### Client Disconnects Frequently

**Check:**
1. Fly.io server status: `fly status -a synckit-stress-test`
2. Server logs for errors: `fly logs -a synckit-stress-test`
3. Network connectivity on client machine
4. Browser console for WebSocket errors

**Fix:**
- Server may have crashed (check logs, redeploy if needed)
- Network issues (check firewall, proxy settings)
- Fly.io may have scaled down (increase min_machines_running in fly.toml)

### Memory Usage Growing Unbounded

**This indicates a memory leak!**

**Action:**
1. Export metrics immediately (click "Export Metrics")
2. Save browser DevTools heap snapshot
3. File GitHub issue with:
   - Exported metrics JSON
   - Heap snapshot
   - Browser version
   - Time when growth started

### Operations Failing

**Check:**
- Success rate in dashboard
- Error logs in console
- Server logs: `fly logs -a synckit-stress-test`

**Common Causes:**
- Server overload (scale up resources)
- OPFS storage quota exceeded (check quota in DevTools)
- Network timeouts (increase timeout config)

---

## Cost Estimate (Fly.io)

**Server Resources:**
- CPU: 1 shared vCPU
- Memory: 512MB
- Region: San Jose (sjc)

**Expected Cost:** ~$5-10/month

**Notes:**
- Fly.io free tier includes $5/month credit
- Stress test should cost <$10 for 48 days
- No database or Redis needed for this test (using OPFS client-side)

---

## What Happens After 48 Days?

### If Successful ✅

**Criteria Met:**
- Memory stable (no leaks)
- >99% success rate
- <10 disconnections

**Next Steps:**
1. Export final metrics
2. Create completion report
3. Merge to main branch
4. Prepare v0.3.0 launch
5. Publish results as blog post

### If Issues Found ❌

**Action Plan:**
1. Export metrics and logs
2. Identify root cause
3. Fix issues in new PR
4. Restart 48-day test
5. Delay v0.3.0 launch if needed

**Priority:** Stability > Launch Date

---

## Development Notes

### Why 48 Days?

- Validates memory leaks don't manifest over time
- Tests connection stability through network variations
- Simulates real-world long-running client sessions
- Proves production readiness

### Why OPFS?

- Benchmarks show 4-30x faster than IndexedDB
- Immune to Safari's 7-day eviction policy
- Client-side storage (no server database needed for test)
- Tests the new v0.3.0 feature directly

### Why Browser Client?

- Real production environment (not synthetic load)
- Tests actual SDK code users will run
- Validates browser memory management
- Easy to monitor with DevTools

---

## Support

- **Issues:** https://github.com/Dancode-188/synckit/issues
- **Discussion:** https://github.com/Dancode-188/synckit/discussions
- **Server Logs:** `fly logs -a synckit-stress-test`

---

**Last Updated:** January 4, 2026
**Test Status:** 🚧 Infrastructure Setup Phase
**Expected Start:** January 4, 2026 (Today!)
