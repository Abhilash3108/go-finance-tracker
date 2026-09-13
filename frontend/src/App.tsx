import { useState, useEffect } from 'react';
import type { User } from './types';
import {
    getAccessToken,
    saveAccessToken, clearTokens,
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

    // On mount: restore the session without a server round-trip if the access
    // token is still valid; otherwise let the HttpOnly cookie carry the refresh
    // token to the server silently.
    useEffect(() => {
        const access = getAccessToken();

        if (access && !isTokenExpired(access)) {
            // Access token still valid — decode user directly from its payload.
            const ap = decodeJWTPayload(access);
            if (ap && typeof ap.sub === 'number') {
                setUser({ id: ap.sub, email: (ap.email as string) ?? '' });
            }
            setReady(true);
        } else {
            // Access token missing or expired — attempt a silent refresh using
            // the HttpOnly cookie (browser sends it automatically).
            attemptRefresh().then(newAccess => {
                if (newAccess) {
                    const ap = decodeJWTPayload(newAccess);
                    if (ap && typeof ap.sub === 'number') {
                        setUser({ id: ap.sub, email: (ap.email as string) ?? '' });
                    }
                } else {
                    clearTokens();
                }
            }).finally(() => setReady(true));
        }
    }, []);

    const handleAuth = (u: User, access: string) => {
        saveAccessToken(access);
        setUser(u);
    };

    const handleLogout = async () => {
        // Best-effort server-side revocation — clears the HttpOnly cookie too.
        fetch('/api/auth/logout', {
            method:      'POST',
            credentials: 'same-origin',
            headers:     { 'Content-Type': 'application/json' },
        }).catch(() => {});
        clearTokens();
        setUser(null);
    };

    if (!ready) return null; // brief pause while checking stored tokens
    if (!user)  return <AuthScreen onAuth={handleAuth} />;
    return <Dashboard user={user} onLogout={handleLogout} />;
}
