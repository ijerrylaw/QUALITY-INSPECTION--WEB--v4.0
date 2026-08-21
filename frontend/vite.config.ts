import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// mkcert-generated, local-CA-trusted cert covering both `localhost` and the
// LAN IP (10.10.110.31 — reserved/static for this laptop per IT). Required
// because Entra ID only allows HTTPS for any non-localhost redirect URI.
// Resolved via import.meta.url rather than a bare relative path so this
// works regardless of the cwd Vite is launched from (root `npm run dev`
// vs. running `vite` directly inside frontend/).
const httpsOptions = {
  key: fs.readFileSync(resolve(__dirname, '10.10.110.31+1-key.pem')),
  cert: fs.readFileSync(resolve(__dirname, '10.10.110.31+1.pem')),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: process.env['PORT'] ? Number(process.env['PORT']) : 4001,
    strictPort: true,
    https: httpsOptions
  }
})
