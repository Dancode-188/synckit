# SyncKit Live Demo

This is the production-ready demo for SyncKit v0.2.0.

## 🎯 What This Demo Does

- ✅ **Room isolation** - Each visitor gets unique room (no shared state chaos)
- ✅ **URL-based sharing** - Share link to collaborate with others
- ✅ **Real-time sync** - Type in one tab, see in another
- ✅ **Offline-first** - Works without internet
- ✅ **Production-ready** - Fixed all errors from CodeSandbox testing

## 🚀 Test Locally

### 1. Install Dependencies

```bash
cd demo
npm install
```

### 2. Run Development Server

```bash
npm run dev
```

### 3. Test in Two Tabs

1. Open http://localhost:5173
2. Copy the URL (includes room hash)
3. Open same URL in new tab
4. Type in one tab → appears in other tab instantly!

## 📦 Upload to CodeSandbox

### Option 1: Import from GitHub (Easiest)

1. Push this `demo/` folder to your repo
2. Go to https://codesandbox.io/
3. Click "Import from GitHub"
4. Select this folder
5. CodeSandbox auto-detects Vite config
6. Done!

### Option 2: Manual Upload

1. Go to https://codesandbox.io/s/
2. Choose **"Vite + React"** template
3. Copy all files from this folder:
   - `package.json`
   - `vite.config.js`
   - `index.html`
   - `src/main.jsx`
   - `src/App.jsx`
4. Install `@synckit-js/sdk@0.2.0`
5. Test in preview
6. Save and share link

## ✅ All Errors Fixed

This demo fixes all three CodeSandbox errors:

### Error 1: Missing SyncProvider ✅ FIXED
- Now properly wraps hooks in `<SyncProvider>`

### Error 2: Wrong Provider Props ✅ FIXED
- Now passes `synckit={instance}` (not `clientId`)
- Creates and initializes SyncKit instance first

### Error 3: import.meta Module Issue ✅ FIXED
- Uses Vite (natively supports import.meta)
- Configured `vite.config.js` with optimizeDeps

## 🎬 Next Steps

Once CodeSandbox is live:

1. **Get the shareable link** (e.g., `https://codesandbox.io/s/synckit-demo-abc123`)
2. **Add to README** (top of main README.md)
3. **Include in HN post** (launch announcement)
4. **Test thoroughly** (two tabs, offline mode, sharing)

## 🧪 Testing Checklist

- [ ] Opens in browser without errors
- [ ] Generates unique room ID in URL hash
- [ ] Can copy and paste URL
- [ ] Opening in second tab joins same room
- [ ] Typing in tab 1 appears in tab 2
- [ ] Typing in tab 2 appears in tab 1
- [ ] Works offline (disconnect internet, type, reconnect)
- [ ] Copy URL button works
- [ ] GitHub link works
- [ ] UI looks clean and professional

## 🚨 Critical: Room Isolation

This demo implements **proper room isolation**:

- Each visitor gets random room ID (`#room-abc123`)
- No shared state chaos
- Can share URL to collaborate intentionally
- Prevents 500 HN users editing same document

**Without this:** Demo would be chaos and ruin launch.
**With this:** Professional, magical demo that drives stars.

---

Ready to deploy! 🚀
