import { useState } from 'react';
import type { User } from './types';

interface Props {
    onAuth: (user: User, access: string, refresh: string) => void;
}

export default function AuthScreen({ onAuth }: Props) {
    const [mode, setMode]         = useState<'login' | 'register'>('login');
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
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

    const toggleMode = () => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); };

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
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                        placeholder="Password (min 6 characters)" className="w-full border p-3 rounded-lg"
                        minLength={6} required />
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
