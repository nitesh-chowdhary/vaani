import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useAuth } from '../hooks/useAuth';
import { credentialsSchema } from '../services/auth.validation';
export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const { user, loading, authenticate } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  if (loading) return <p role="status">Checking authentication…</p>;
  if (user) return <Navigate to="/app" replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setPending(true);
    try {
      await authenticate(mode, parsed.data.email, parsed.data.password);
      setPassword('');
      navigate('/app', { replace: true });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Authentication failed. Please try again.',
      );
    } finally {
      setPending(false);
    }
  }
  const title = mode === 'signup' ? 'Create account' : 'Log in';
  return (
    <section className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-sm">
      <p className="mb-2 text-sm font-semibold text-slate-400">Vaani</p>
      <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
      <form onSubmit={submit} noValidate className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            required
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={
                mode === 'signup' ? 'new-password' : 'current-password'
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              maxLength={128}
              className="pr-12"
              required
              disabled={pending}
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              aria-controls="password"
              disabled={pending}
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-slate-400 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                {showPassword && <path d="m3 3 18 18" />}
              </svg>
            </button>
          </div>
          {mode === 'signup' && (
            <p className="text-xs text-slate-400">
              Use 8–128 characters. A passphrase works well.
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Please wait…' : title}
        </Button>
      </form>
      <p className="mt-6 text-sm text-slate-300">
        {mode === 'signup' ? 'Already have an account?' : 'New to Vaani?'}{' '}
        <Link
          className="font-medium text-slate-100 transition-colors hover:text-white focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          to={mode === 'signup' ? '/login' : '/signup'}
        >
          {mode === 'signup' ? 'Log in' : 'Create account'}
        </Link>
      </p>
    </section>
  );
}
