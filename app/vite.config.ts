import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process entry
        entry: 'electron/main.ts',
      },
      {
        // Preload script entry
        entry: 'electron/preload.ts',
        onstart(args) {
          // Notify the renderer process to reload when preload changes
          args.reload()
        },
      },
    ]),
    renderer(),
  ],
})
