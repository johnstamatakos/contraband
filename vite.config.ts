import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// CAPACITOR=1 npm run build → base './' for native WebView file:// loading
// (default)  npm run build → base '/contraband/' for GitHub Pages
const isMobileBuild = process.env.CAPACITOR === '1'

export default defineConfig({
  plugins: [react()],
  base: isMobileBuild ? './' : '/contraband/',
  build: {
    minify: 'terser',
    terserOptions: {
      compress: { passes: 2, drop_console: true },
      mangle: { toplevel: true },
      format: { comments: false },
    },
  },
})
