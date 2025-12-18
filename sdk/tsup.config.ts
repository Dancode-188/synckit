import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/index-lite.ts',
    'src/adapters/react.tsx',
    'src/adapters/vue/index.ts',
    'src/adapters/svelte/index.ts',
    'src/cursor/selection.ts',
  ],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  minify: true,
  treeshake: true,
  splitting: false,
  metafile: true,
  external: [
    // Keep WASM bindings external so they can use import.meta.url natively
    '../wasm/default/synckit_core.js',
    '../wasm/lite/synckit_core.js',
    // Svelte store types
    'svelte/store',
    'svelte',
    // Vue and Svelte component files (shipped as source, compiled by consumer)
    /\.vue$/,
    /\.svelte$/,
  ],
  // Don't bundle WASM files
  noExternal: [],
  esbuildOptions(options) {
    // Temporarily keep console.log for debugging cross-tab sync
    // options.drop = ['console', 'debugger']
  },
})
