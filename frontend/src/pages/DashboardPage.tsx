import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import type { Board } from '../types'

export default function DashboardPage() {
  const { token, user, logout } = useAuth()
  const [boards, setBoards] = useState<Board[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    (localStorage.getItem('taskboard_theme') as 'light' | 'dark') || 'light',
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('taskboard_theme', theme)
  }, [theme])

  async function refresh() {
    if (!token) return
    const list = await api.boards(token)
    setBoards(list)
  }

  useEffect(() => {
    refresh().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load boards'))
  }, [token])

  async function createBoard(e: FormEvent) {
    e.preventDefault()
    if (!token || !name.trim()) return
    setError('')
    try {
      await api.createBoard(token, name.trim())
      setName('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col mesh-bg">
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-35" aria-hidden />
      <div className="relative z-10 flex min-h-screen flex-col">
      <header className="glass-header flex items-center justify-between px-5 py-4 glow-ring">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 text-xs font-bold text-white shadow-md shadow-cyan-500/20">TB</div>
          <strong className="font-display text-lg text-slate-900 dark:text-slate-100">Task boards</strong>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <span className="text-sm text-slate-600 dark:text-slate-400">{user?.username}</span>
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            onClick={logout}
          >
            Log out
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8">
        <h1 className="mb-2 text-2xl font-bold text-slate-900 dark:text-slate-100">Your boards</h1>
        <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">Create a board and invite your team to collaborate.</p>
        {error ? <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        <form onSubmit={createBoard} className="mb-8 flex flex-wrap gap-2">
          <input
            className="min-w-[200px] flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            placeholder="New board name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-600/20 hover:bg-sky-700"
          >
            Create board
          </button>
        </form>
        <ul className="grid gap-3">
          {boards.map((b) => (
            <li key={b.id}>
              <Link
                to={`/boards/${b.id}`}
                className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-sky-700"
              >
                <div className="font-semibold text-slate-900 dark:text-slate-100">{b.name}</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {b.members.length} member{b.members.length === 1 ? '' : 's'}
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {boards.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
            No boards yet. Create one above to get started.
          </p>
        ) : null}
      </main>
      </div>
    </div>
  )
}
