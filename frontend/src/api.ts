// API client: token storage, JWT helpers, and authenticated fetch with
// automatic proactive + reactive token refresh.
//
// Security model:
//   - Access token: stored in localStorage (short-lived, 15 min).
//   - Refresh token: stored in an HttpOnly Secure SameSite=Strict cookie set
//     by the server. JavaScript never reads or writes it — the browser sends
//     it automatically on requests to the same origin. This prevents XSS from
//     stealing the refresh token even if the access token is compromised.

const ACCESS_KEY = 'finance_access_token';

// ---------------------------------------------------------------------------
// Token Storage — access token only
// ---------------------------------------------------------------------------

export function getAccessToken():  string | null { try { return localStorage.getItem(ACCESS_KEY); } catch { return null; } }

export function saveAccessToken(access: string) {
    try { localStorage.setItem(ACCESS_KEY, access); } catch { /* storage blocked */ }
}

export function clearTokens() {
    try { localStorage.removeItem(ACCESS_KEY); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// JWT Helpers
// ---------------------------------------------------------------------------

/** Decode JWT payload without verifying — client-side claims reading only. */
export function decodeJWTPayload(token: string): Record<string, unknown> | null {
    try {
        const payload = token.split('.')[1];
        return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    } catch {
        return null;
    }
}

/** Returns true if the token is missing, invalid, or within 60s of expiry. */
export function isTokenExpired(token: string): boolean {
    const payload = decodeJWTPayload(token);
    if (!payload || typeof payload.exp !== 'number') return true;
    return payload.exp * 1000 < Date.now() + 60_000;
}

// ---------------------------------------------------------------------------
// Session Expiry Callback
// ---------------------------------------------------------------------------

// Registered by App so apiFetch can trigger logout from anywhere without
// prop-drilling.
export let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: (() => void) | null) {
    onSessionExpired = fn;
}

// ---------------------------------------------------------------------------
// Token Refresh
// ---------------------------------------------------------------------------

export async function attemptRefresh(): Promise<string | null> {
    try {
        // The HttpOnly refresh cookie is sent automatically by the browser —
        // no need to read it from JS or include it in the body.
        const res = await fetch('/api/auth/refresh', {
            method:      'POST',
            credentials: 'same-origin', // ensures cookie is sent
            headers:     { 'Content-Type': 'application/json' },
        });
        if (!res.ok) { clearTokens(); onSessionExpired?.(); return null; }
        const data = await res.json();
        saveAccessToken(data.accessToken);
        return data.accessToken;
    } catch {
        clearTokens();
        onSessionExpired?.();
        return null;
    }
}

// ---------------------------------------------------------------------------
// Authenticated Fetch
// ---------------------------------------------------------------------------

function fetchWithToken(path: string, options: RequestInit, token: string | null): Promise<Response> {
    return fetch(path, {
        ...options,
        credentials: 'same-origin', // always send cookies (refresh cookie on auth routes)
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers ?? {}),
        },
    });
}

/**
 * apiFetch — drop-in replacement for fetch on protected routes.
 * - Proactively refreshes the access token when near expiry.
 * - Retries once with a fresh token on a 401 response.
 * - Calls onSessionExpired and returns the 401 if refresh also fails.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
    let accessToken = getAccessToken();

    if (accessToken && isTokenExpired(accessToken)) {
        accessToken = await attemptRefresh();
    }

    const response = await fetchWithToken(path, options, accessToken);

    if (response.status === 401) {
        const newToken = await attemptRefresh();
        if (!newToken) { onSessionExpired?.(); return response; }
        return fetchWithToken(path, options, newToken);
    }

    return response;
}
