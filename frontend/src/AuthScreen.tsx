import { useState } from 'react';
import type { User } from './types';

interface Props {
    onAuth: (user: User, access: string, refresh: string) => void;
}

export default function AuthScreen({ onAuth }: Props) {
    const [mode, setMode]         = useState<'login' | 'register'>('login');
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw]     = useState(false);
    const [error, setError]       = useState('');
    const [loading, setLoading]   = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await fetch(`/api/auth/${mode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
            });
            const text = await res.text();
            let data: Record<string, unknown>;
            try { data = JSON.parse(text); } catch { data = { message: text }; }

            if (!res.ok) {
                setError((data.message as string) || text || 'Something went wrong');
                return;
            }
            onAuth(data.user as User, data.accessToken as string, data.refreshToken as string);
        } catch {
            setError('Network error — please try again');
        } finally {
            setLoading(false);
        }
    };

    const toggleMode = () => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); setShowPw(false); };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
            <div className="bg-white p-10 rounded-2xl shadow-sm border border-gray-100 w-full max-w-md">
                <h1 className="text-3xl font-black text-gray-800 mb-2">Finance Tracker</h1>
                <p className="text-gray-500 mb-8">
                    {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                        placeholder="Email" className="w-full border p-3 rounded-lg" required />
                    <div className="relative">
                        <input
                            type={showPw ? 'text' : 'password'}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Password (min 6 characters)"
                            className="w-full border p-3 rounded-lg pr-11"
                            minLength={6}
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowPw(v => !v)}
                            className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                            aria-label={showPw ? 'Hide password' : 'Show password'}
                        >
                            {showPw ? (
                                /* Eye-off icon */
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.97 9.97 0 012.08-3.667M6.34 6.34A9.97 9.97 0 0112 5c4.477 0 8.268 2.943 9.542 7a10.05 10.05 0 01-4.342 5.345M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                                </svg>
                            ) : (
                                /* Eye icon */
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            )}
                        </button>
                    </div>
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                    <button type="submit" disabled={loading}
                        className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 transition disabled:opacity-50">
                        {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
                    </button>
                </form>

                <p className="text-center text-sm text-gray-500 mt-6">
                    {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                    <button onClick={toggleMode} className="text-indigo-600 font-bold hover:underline">
                        {mode === 'login' ? 'Register' : 'Sign In'}
                    </button>
                </p>
            </div>
        </div>
    );
}
