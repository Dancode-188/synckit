import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/index-lite.ts',
    'src/adapters/react.tsx',
    'src/adapters/vue/index.ts',
    'src/adapters/svelte/index.ts',
  ],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  external: [
    // Keep WASM bindings external so they can use import.meta.url natively
    '../wasm/default/synckit_core.js',
    '../wasm/lite/synckit_core.js',
    // Svelte store types
    'svelte/store',
    'svelte',
  ],
  // Don't bundle WASM files
  noExternal: [],
})
