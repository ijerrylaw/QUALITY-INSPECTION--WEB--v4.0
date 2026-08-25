import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'

// Separate from vite.config.ts deliberately — the dev/build config needs
// the mkcert HTTPS setup (required for Entra ID's redirect URI rules) and a
// fixed port/host, neither of which the test runner needs or should share.
//
// `test.browser` (not the default jsdom/node environment) is load-bearing,
// not a preference: jsdom has NO layout engine at all — every
// getBoundingClientRect() call in jsdom returns all-zero rects regardless
// of any CSS applied, so a jsdom-based "does this element's width leak"
// test would be structurally incapable of ever failing — it would pass
// whether the underlying bug was fixed or not. The regression this project
// needs to guard against (see history.widthRegression.test.tsx) is
// specifically about a real browser's real layout/table-layout algorithm,
// so the test has to run in one. Playwright's Chromium is the provider.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Pre-bundle these up front — without it, Vite's dependency optimizer
  // discovers them mid-run (only once a test actually imports something
  // deep enough to need them) and reloads, which hands React-using
  // components a SECOND copy of React mid-test, breaking every hook call
  // ("Invalid hook call... more than one copy of React"). Not a code bug;
  // a one-time discovery-order issue solved by listing them explicitly.
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react-dom/client', '@testing-library/react', 'react-router-dom',
      'lucide-react', 'motion/react', '@azure/msal-browser',
    ],
  },
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
  },
})
