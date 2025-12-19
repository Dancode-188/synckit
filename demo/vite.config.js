import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@synckit-js/sdk'],
    include: ['lz-string']
  },
  build: {
    commonjsOptions: {
      include: [/lz-string/, /node_modules/]
    }
  }
})
