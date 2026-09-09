import { useState, useEffect } from 'react';
import type { User } from './types';
import {
    getAccessToken, getRefreshToken,
    saveTokens, clearTokens,
    decodeJWTPayload, isTokenExpired,
    attemptRefresh,
    setSessionExpiredHandler,
} from './api';
import AuthScreen from './AuthScreen';
import Dashboard  from './Dashboard';

export default function App() {
    const [user,  setUser]  = useState<User | null>(null);
    const [ready, setReady] = useState(false); // prevents flash of login screen on load

    // Register the global session-expiry handler so apiFetch can log the user
    // out from anywhere when both tokens are exhausted.
    useEffect(() => {
        setSessionExpiredHandler(() => { clearTokens(); setUser(null); });
        return () => setSessionExpiredHandler(null);
    }, []);

    // On mount: restore the session from localStorage without a server round-trip.
    useEffect(() => {
        const access  = getAccessToken();
        const refresh = getRefreshToken();

        if (access && !isTokenExpired(access)) {
            // Access token still valid — decode user directly from its payload.
            const ap = decodeJWTPayload(access);
            const rp = refresh ? decodeJWTPayload(refresh) : null;
            if (ap && typeof ap.sub === 'number') {
                setUser({ id: ap.sub, email: (rp?.email as string) ?? '' });
            }
            setReady(true);
        } else if (refresh && !isTokenExpired(refresh)) {
            // Access token expired but refresh valid — silently get a new pair.
            attemptRefresh().then(newAccess => {
                if (newAccess) {
                    const ap = decodeJWTPayload(newAccess);
                    const rp = decodeJWTPayload(getRefreshToken() ?? '');
                    if (ap && typeof ap.sub === 'number') {
                        setUser({ id: ap.sub, email: (rp?.email as string) ?? '' });
                    }
                } else {
                    clearTokens();
                }
            }).finally(() => setReady(true));
        } else {
            clearTokens();
            setReady(true);
        }
    }, []);

    const handleAuth = (u: User, access: string, refresh: string) => {
        saveTokens(access, refresh);
        setUser(u);
    };

    const handleLogout = async () => {
        const refreshToken = getRefreshToken();
        // Best-effort server-side revocation — don't block the UI on it.
        if (refreshToken) {
            fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
            }).catch(() => {});
        }
        clearTokens();
        setUser(null);
    };

    if (!ready) return null; // brief pause while checking stored tokens
    if (!user)  return <AuthScreen onAuth={handleAuth} />;
    return <Dashboard user={user} onLogout={handleLogout} />;
}
