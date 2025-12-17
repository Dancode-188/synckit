# React Test Harness (Internal)

**⚠️ This is NOT a user-facing example - it's internal testing infrastructure.**

This React app serves as a test harness for Playwright chaos testing scenarios. It exposes SyncKit internals (leader election, undo/redo state, cross-tab sync) for automated testing.

## Purpose

Used by SDK tests to verify:
- CrossTabSync leader election
- UndoManager state across tabs
- Selection utilities
- Chaos testing scenarios (network partitions, concurrent edits)

## For Users

If you're looking for **real examples**, check out:
- `todo-app/` - Simple getting started example
- `collaborative-editor/` - Production-ready editor with CodeMirror
- `project-management/` - Kanban board with drag-and-drop
- `react-cursors/` - Cursor and selection sharing
- `vue-collaborative-editor/` - Vue 3 adapter example
- `svelte-collaborative-editor/` - Svelte 5 adapter example

## Running This Test Harness

```bash
npm install
npm run dev
```

Then open multiple tabs and run Playwright tests against it.

## Dependencies

This test harness uses:
- `@synckit-js/sdk` - Core SDK
- `@synckit-js/sdk/lite` - MemoryStorage for simpler testing
- `@synckit-js/sdk/cursor/selection` - SelectionUtils
- React 19 + Vite

## Exposed State for Testing

The harness exposes these data attributes for Playwright to query:
- `data-text` - Current text content
- `data-is-leader` - Leader election status
- `data-tab-id` - Current tab identifier
- `data-undo-stack-size` - Undo stack size
- `data-redo-stack-size` - Redo stack size
