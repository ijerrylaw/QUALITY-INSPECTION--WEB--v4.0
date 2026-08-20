/**
 * @file msalConfig.ts
 * @description Real MSAL.js configuration for Microsoft Entra ID SSO
 * (NAVIGATION_AND_RBAC.md §3.1). App Registration is a Single-Page
 * Application (no client secret). Redirect URI must exactly match what's
 * registered in Entra or login fails with a redirect-URI-mismatch error —
 * this is an Entra-side allowlist check, unaffected by how the client
 * computes the value below, so each distinct address (localhost, a LAN IP,
 * a future production domain) still needs to be added to the App
 * Registration's Redirect URIs list separately.
 *
 * redirectUri falls back to window.location.origin (same pattern as
 * ConfigContext.tsx's API_BASE_URL) rather than a hardcoded address, so the
 * app self-registers the correct value for whatever address it was actually
 * loaded from — safe here because this is a pure client-side SPA (no SSR)
 * and this module only evaluates once the page (and window.location) is
 * already live. VITE_MSAL_REDIRECT_URI still overrides it when explicitly set.
 *
 * cacheLocation is deliberately 'sessionStorage', not 'localStorage' — this
 * app runs on shared/kiosk-style machines (same reasoning as the PIN side's
 * idle-timeout, see IdleSessionGuard.tsx), so an M365 session should not
 * silently survive a closed tab on a shared computer.
 */

import { PublicClientApplication } from '@azure/msal-browser';
import type { Configuration } from '@azure/msal-browser';

const clientId = import.meta.env['VITE_MSAL_CLIENT_ID'] as string | undefined;
const tenantId = import.meta.env['VITE_MSAL_TENANT_ID'] as string | undefined;
const redirectUri = (import.meta.env['VITE_MSAL_REDIRECT_URI'] as string | undefined) ?? window.location.origin;

if (!clientId || !tenantId) {
  // eslint-disable-next-line no-console
  console.error(
    '[msalConfig] VITE_MSAL_CLIENT_ID / VITE_MSAL_TENANT_ID are not set — ' +
      'copy frontend/.env.example to frontend/.env.local and fill in real Entra ID values.'
  );
}

export const msalConfig: Configuration = {
  auth: {
    clientId: clientId ?? '',
    authority: `https://login.microsoftonline.com/${tenantId ?? 'common'}`,
    redirectUri,
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
};

/** openid/profile/email are implicit in an ID token request; User.Read is the Graph scope this app actually calls (jobTitle lookup). */
export const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
};

/** Scope used for the post-login `acquireTokenSilent` call that fetches jobTitle from Graph. */
export const graphRequest = {
  scopes: ['User.Read'],
};

export const GRAPH_ME_ENDPOINT = 'https://graph.microsoft.com/v1.0/me?$select=jobTitle';

export const msalInstance = new PublicClientApplication(msalConfig);
