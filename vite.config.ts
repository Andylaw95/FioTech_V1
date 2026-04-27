import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
      // web-ifc-three@0.0.125 imports legacy `mergeBufferGeometries` which Three.js r152+ removed.
      // Shim it back via a re-export.
      'three/examples/jsm/utils/BufferGeometryUtils': path.resolve(__dirname, './src/shims/BufferGeometryUtils.ts'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  server: {
    proxy: {
      // Dev-only: proxy Supabase Edge Function calls so the browser sees
      // them as same-origin (avoids CORS preflight rejection from prod
      // edge function which only allows fiotech-app.vercel.app).
      '/sb': {
        target: 'https://wjvbojulgpmpblmterfy.supabase.co',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/sb/, ''),
      },
    },
  },
})
