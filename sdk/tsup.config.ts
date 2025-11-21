import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/index-lite.ts', 'src/adapters/react.tsx'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  external: [
    // Keep WASM bindings external so they can use import.meta.url natively
    '../wasm/default/synckit_core.js',
    '../wasm/lite/synckit_core.js',
  ],
  // Don't bundle WASM files
  noExternal: [],
})
