'use client';

import { FormEvent, useEffect, useState } from 'react';
import Dashboard from '../components/Dashboard';
import { apiGet } from '../lib/api';

const SESSION_KEY = 'oracle-ui-session';
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL || 'admin@oracle.local';
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || 'oracle123';

export default function Page() {
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem(SESSION_KEY) : null;
    if (!token) {
      setChecking(false);
      return;
    }
    apiGet('/health')
      .then(() => {
        setAuthenticated(true);
        setChecking(false);
      })
      .catch(() => {
        localStorage.removeItem(SESSION_KEY);
        setChecking(false);
      });
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await apiGet('/health');
      if (email.trim().toLowerCase() !== DEMO_EMAIL.toLowerCase() || password !== DEMO_PASSWORD) {
        throw new Error('Invalid credentials');
      }
      localStorage.setItem(SESSION_KEY, 'active');
      setAuthenticated(true);
    } catch (_error) {
      setError('Login failed. Check your credentials and backend health.');
    }
  };

  if (checking) {
    return <div className="min-h-screen bg-bg text-slate-100 flex items-center justify-center">Checking session...</div>;
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-bg text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md card space-y-4">
          <div>
            <h1 className="text-2xl font-bold tracking-wide">ORACLE Login</h1>
            <p className="text-sm text-slate-300 mt-1">Sign in to access trading control panels and AI agent views.</p>
          </div>
          <form className="space-y-3" onSubmit={onSubmit}>
            <input
              className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
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
            <button className="w-full px-4 py-2 rounded bg-accent text-black font-semibold" type="submit">Login</button>
            {error && <div className="text-rose-300 text-sm">{error}</div>}
          </form>
        </div>
      </div>
    );
  }

  return <Dashboard />;
}
