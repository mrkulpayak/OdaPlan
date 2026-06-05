import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError('Geçersiz e-posta veya şifre.');
    }

    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center w-full h-screen bg-background">
      <div
        className="bg-surface rounded p-8 w-full max-w-sm"
        style={{ boxShadow: 'var(--shadow-modal)' }}
      >
        <h1
          className="text-lg font-semibold text-[var(--color-text)] mb-6"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          OdaPlan
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="email"
              className="text-sm text-[var(--color-text)]"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              E-posta
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="border border-border rounded px-3 py-1.5 text-base bg-surface text-[var(--color-text)] focus:outline-none focus:border-primary"
              style={{ fontFamily: 'var(--font-body)' }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="password"
              className="text-sm text-[var(--color-text)]"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Şifre
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="border border-border rounded px-3 py-1.5 text-base bg-surface text-[var(--color-text)] focus:outline-none focus:border-primary"
              style={{ fontFamily: 'var(--font-body)' }}
            />
          </div>

          {error && (
            <p className="text-sm text-error" style={{ fontFamily: 'var(--font-body)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 bg-primary hover:bg-primary-hover text-white rounded px-4 py-2 text-base font-medium cursor-pointer transition-colors duration-fast disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ fontFamily: 'var(--font-body)', minHeight: '36px' }}
          >
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>
      </div>
    </div>
  );
}
