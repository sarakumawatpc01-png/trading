'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginClient() {
  const router = useRouter();
  const [userId, setUserId] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password })
      });
      if (!response.ok) throw new Error('Invalid credentials.');
      router.refresh();
    } catch (_error) {
      setError('Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md card space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-wide">ORACLE Login</h1>
          <p className="text-sm text-slate-300 mt-1">Sign in to access trading control panels and AI agent views.</p>
          <p className="text-xs text-slate-400 mt-2">Use the provided userid/password to sign in.</p>
        </div>
        <form className="space-y-3" onSubmit={onSubmit}>
          <input
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600"
            type="text"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="User ID"
            required
          />
          <input
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            required
          />
          <button className="w-full px-4 py-2 rounded bg-accent text-black font-semibold disabled:opacity-70" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Login'}
          </button>
          {error && <div className="text-rose-300 text-sm">{error}</div>}
        </form>
      </div>
    </div>
  );
}
