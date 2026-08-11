import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import { BrowserUtils } from '@azure/msal-browser'
import './index.css'
import App from './App.tsx'
import { msalInstance } from './lib/msalConfig'

/**
 * msal-browser v5's popup/silent-iframe flow hands the auth response back to
 * the opener via a BroadcastChannel — the opener's loginPopup()/
 * acquireTokenSilent() waits on a message posted from *inside* the popup or
 * hidden iframe once it lands back on the redirect URI. Nothing does that
 * automatically: MSAL ships broadcastResponseToMainFrame() as a separate,
 * not-auto-invoked entry point (@azure/msal-browser/redirect-bridge)
 * specifically for apps whose redirectUri is their own app root (like this
 * one), where the popup/iframe would otherwise boot the full SPA instead of
 * reporting back. Without this check, the popup silently renders our app and
 * never closes, and the opener's loginPopup() call (and Graph token
 * acquisition, which also opens a hidden iframe on this same redirect URI)
 * hangs until popupBridgeTimeout/iframeBridgeTimeout.
 *
 * isInPopup()/isInIframe() only return true when the current URL actually
 * carries a valid MSAL response tagged with that interaction type, so this
 * never fires on normal navigation. If the broadcast itself fails (e.g. a
 * malformed/foreign response), fall through to normal app bootstrap rather
 * than leaving the window blank.
 */
async function bootstrap() {
  if (BrowserUtils.isInPopup() || BrowserUtils.isInIframe()) {
    try {
      const { broadcastResponseToMainFrame } = await import('@azure/msal-browser/redirect-bridge')
      await broadcastResponseToMainFrame()
      return
    } catch (err) {
      console.warn('[main] MSAL redirect-bridge broadcast failed; falling back to normal app bootstrap.', err)
    }
  }

  await msalInstance.initialize()
  await msalInstance.handleRedirectPromise()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </StrictMode>,
  )
}

bootstrap()
