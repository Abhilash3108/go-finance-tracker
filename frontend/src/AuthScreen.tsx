import { useState, useMemo } from 'react';
import type { User } from './types';

interface Props {
    onAuth: (user: User, access: string, refresh: string) => void;
}

// ---------------------------------------------------------------------------
// Static style constants — allocated once, never recreated on render
// ---------------------------------------------------------------------------

const STYLES = {
    wrapper: {
        background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
    } as React.CSSProperties,

    card: {
        background: 'rgba(255,255,255,0.07)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 32px 64px rgba(0,0,0,0.4)',
    } as React.CSSProperties,

    logoMark: {
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    } as React.CSSProperties,

    labelColor: { color: 'rgba(255,255,255,0.55)' } as React.CSSProperties,

    input: {
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.1)',
    } as React.CSSProperties,

    inputFocus: { border: '1px solid rgba(99,102,241,0.8)' } as React.CSSProperties,
    inputBlur:  { border: '1px solid rgba(255,255,255,0.1)' } as React.CSSProperties,

    errorBox: {
        background: 'rgba(239,68,68,0.15)',
        border: '1px solid rgba(239,68,68,0.3)',
        color: '#fca5a5',
    } as React.CSSProperties,

    toggleLink: { color: '#818cf8' } as React.CSSProperties,
    subText:    { color: 'rgba(255,255,255,0.35)' } as React.CSSProperties,
    eyeIcon:    { color: 'rgba(255,255,255,0.35)' } as React.CSSProperties,
    badgeText:  { color: 'rgba(255,255,255,0.45)' } as React.CSSProperties,
} as const;

// ---------------------------------------------------------------------------
// Standalone auth request — separated from component to reduce its responsibility
// ---------------------------------------------------------------------------

interface AuthResult {
    ok:   true;
    user: User;
    accessToken:  string;
    refreshToken: string;
}
interface AuthError {
    ok:      false;
    message: string;
}

async function authRequest(
    mode: 'login' | 'register',
    email: string,
    password: string,
): Promise<AuthResult | AuthError> {
    try {
        const res  = await fetch(`/api/auth/${mode}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ email: email.trim().toLowerCase(), password }),
        });
        const text = await res.text();
        let data: Record<string, unknown>;
        try { data = JSON.parse(text); } catch { data = { message: text }; }

        if (!res.ok) {
            return { ok: false, message: (data.message as string) || text || 'Something went wrong' };
        }
        return {
            ok:           true,
            user:         data.user         as User,
            accessToken:  data.accessToken  as string,
            refreshToken: data.refreshToken as string,
        };
    } catch {
        return { ok: false, message: 'Network error — please try again' };
    }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AuthScreen({ onAuth }: Props) {
    const [mode,     setMode]     = useState<'login' | 'register'>('login');
    const [email,    setEmail]    = useState('');
    const [password, setPassword] = useState('');
    const [showPw,   setShowPw]   = useState(false);
    const [error,    setError]    = useState('');
    const [loading,  setLoading]  = useState(false);

    // Only recompute the submit button style when `loading` changes
    const submitStyle = useMemo<React.CSSProperties>(() => ({
        background: loading
            ? 'rgba(99,102,241,0.5)'
            : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        boxShadow: loading ? 'none' : '0 8px 24px rgba(99,102,241,0.4)',
    }), [loading]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        const result = await authRequest(mode, email, password);
        setLoading(false);
        if (!result.ok) { setError(result.message); return; }
        onAuth(result.user, result.accessToken, result.refreshToken);
    };

    const toggleMode = () => {
        setMode(m => m === 'login' ? 'register' : 'login');
        setError('');
        setShowPw(false);
    };

    return (
        <div
            className="min-h-screen flex items-center justify-center p-4 sm:p-6"
            style={STYLES.wrapper}
        >
            {/* Glassy card — p-6 on mobile, p-10 on sm+ */}
            <div className="w-full max-w-md rounded-3xl p-6 sm:p-10" style={STYLES.card}>

                {/* Logo mark */}
                <div className="flex items-center gap-3 mb-8">
                    <div
                        className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl font-black text-white"
                        style={STYLES.logoMark}
                    >
                        ₹
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-white leading-none">Finance Tracker</h1>
                        <p className="text-xs mt-0.5" style={STYLES.badgeText}>
                            {mode === 'login' ? 'Welcome back' : 'Create your account'}
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">

                    {/* Email */}
                    <div>
                        <label className="block text-xs font-semibold mb-1.5" style={STYLES.labelColor}>
                            EMAIL
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition-all"
                            style={STYLES.input}
                            onFocus={e => Object.assign(e.currentTarget.style, STYLES.inputFocus)}
                            onBlur={e  => Object.assign(e.currentTarget.style, STYLES.inputBlur)}
                            required
                        />
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-xs font-semibold mb-1.5" style={STYLES.labelColor}>
                            PASSWORD
                        </label>
                        <div className="relative">
                            <input
                                type={showPw ? 'text' : 'password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Min 6 characters"
                                className="w-full rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder-gray-500 outline-none transition-all"
                                style={STYLES.input}
                                onFocus={e => Object.assign(e.currentTarget.style, STYLES.inputFocus)}
                                onBlur={e  => Object.assign(e.currentTarget.style, STYLES.inputBlur)}
                                minLength={6}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPw(v => !v)}
                                className="absolute inset-y-0 right-3 flex items-center transition-colors"
                                style={STYLES.eyeIcon}
                                aria-label={showPw ? 'Hide password' : 'Show password'}
                            >
                                {showPw ? (
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.97 9.97 0 012.08-3.667M6.34 6.34A9.97 9.97 0 0112 5c4.477 0 8.268 2.943 9.542 7a10.05 10.05 0 01-4.342 5.345M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                                    </svg>
                                ) : (
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm" style={STYLES.errorBox}>
                            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {error}
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-60"
                        style={submitStyle}
                    >
                        {loading ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Please wait…
                            </span>
                        ) : mode === 'login' ? 'Sign In' : 'Create Account'}
                    </button>
                </form>

                <p className="text-center text-sm mt-6" style={STYLES.subText}>
                    {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                    <button onClick={toggleMode} className="font-bold transition-colors" style={STYLES.toggleLink}>
                        {mode === 'login' ? 'Register' : 'Sign In'}
                    </button>
                </p>
            </div>
        </div>
    );
}
