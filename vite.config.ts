import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    minify: 'terser',
    terserOptions: {
      compress: { passes: 2, drop_console: true },
      mangle: { toplevel: true },
      format: { comments: false },
    },
  },
})
