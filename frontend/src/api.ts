// API client: token storage, JWT helpers, and authenticated fetch with
// automatic proactive + reactive token refresh.

const ACCESS_KEY  = 'finance_access_token';
const REFRESH_KEY = 'finance_refresh_token';

// ---------------------------------------------------------------------------
// Token Storage
// ---------------------------------------------------------------------------

export function getAccessToken():  string | null { try { return localStorage.getItem(ACCESS_KEY);  } catch { return null; } }
export function getRefreshToken(): string | null { try { return localStorage.getItem(REFRESH_KEY); } catch { return null; } }

export function saveTokens(access: string, refresh: string) {
    try {
        localStorage.setItem(ACCESS_KEY,  access);
        localStorage.setItem(REFRESH_KEY, refresh);
    } catch { /* storage blocked — session still works in-memory */ }
}

export function clearTokens() {
    try {
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
    } catch { /* ignore */ }
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
    const refreshToken = getRefreshToken();
    if (!refreshToken || isTokenExpired(refreshToken)) {
        clearTokens();
        onSessionExpired?.();
        return null;
    }
    try {
        const res = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) { clearTokens(); onSessionExpired?.(); return null; }
        const data = await res.json();
        saveTokens(data.accessToken, data.refreshToken);
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
