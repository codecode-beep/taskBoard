import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'

export default function RegisterPage() {
  const { register } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await register(email, username, password)
      nav('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center mesh-bg px-4 py-12">
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-40" aria-hidden />
      <div className="relative z-10 w-full max-w-md">
        <form
          className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 pt-8 shadow-xl shadow-slate-200/50 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 dark:shadow-black/20"
          onSubmit={onSubmit}
        >
          <div className="mb-6 border-b border-slate-200/80 pb-6 text-center dark:border-slate-700">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-600 text-lg font-bold text-white shadow-lg shadow-sky-600/25">
              TB
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Create account
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Join a shared board in seconds</p>
          </div>
          {error ? <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{error}</div> : null}
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Email</span>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Username</span>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          </label>
          <label className="mb-6 block">
            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Password</span>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>
          <button
            className="w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-600/25 transition hover:bg-sky-700 disabled:opacity-50"
            type="submit"
            disabled={busy}
          >
            {busy ? 'Creating…' : 'Register'}
          </button>
          <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
            Have an account?{' '}
            <Link className="font-medium text-sky-600 hover:underline dark:text-sky-400" to="/login">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
