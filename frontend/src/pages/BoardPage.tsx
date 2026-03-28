import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, wsBoardUrl } from '../api'
import { useAuth } from '../AuthContext'
import AIAssistant from '../components/AIAssistant'
import BoardKanban from '../components/BoardKanban'
import TaskPanel from '../components/TaskPanel'
import type { Board, Column, Label, Notification, Task, User } from '../types'
import { prioritySortKey } from '../utils'

function roleOnBoard(board: Board, userId: string): 'admin' | 'member' | null {
  if (board.owner_id === userId) return 'admin'
  const m = board.members.find((x) => x.user_id === userId)
  return m ? m.role : null
}

export default function BoardPage() {
  const { boardId = '' } = useParams()
  const { token, user } = useAuth()
  const nav = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)

  const [board, setBoard] = useState<Board | null>(null)
  const [columns, setColumns] = useState<Column[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [userMap, setUserMap] = useState<Record<string, User>>({})
  const [activeUserIds, setActiveUserIds] = useState<string[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifOpen, setNotifOpen] = useState(false)

  const [q, setQ] = useState('')
  const [fpriority, setFpriority] = useState('')
  const [fcolumn, setFcolumn] = useState('')
  const [fassignee, setFassignee] = useState('')
  const [flabel, setFlabel] = useState('')
  const [sort, setSort] = useState('')

  const [selected, setSelected] = useState<Task | null>(null)
  const [newColOpen, setNewColOpen] = useState(false)
  const [newColName, setNewColName] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteUser, setInviteUser] = useState('')
  const [analytics, setAnalytics] = useState<{ by_column: { column_id: string; name: string; count: number }[] } | null>(null)
  const [error, setError] = useState('')
  const [neuralOpen, setNeuralOpen] = useState(false)

  const isAdmin = board && user ? roleOnBoard(board, user.id) === 'admin' : false

  const loadAll = useCallback(async () => {
    if (!token || !boardId) return
    const [b, cols, ts, labs] = await Promise.all([
      api.getBoard(token, boardId),
      api.columns(token, boardId),
      api.tasks(token, boardId, {}),
      api.labels(token, boardId),
    ])
    setBoard(b)
    setColumns(cols.sort((a, c) => a.order - c.order))
    setTasks(ts)
    setLabels(labs)

    const ids = new Set<string>()
    ids.add(b.owner_id)
    b.members.forEach((m) => ids.add(m.user_id))
    ts.forEach((t) => {
      if (t.assignee_id) ids.add(t.assignee_id)
    })
    const users = await api.usersByIds(token, [...ids])
    const um: Record<string, User> = {}
    users.forEach((u) => {
      um[u.id] = u
    })
    setUserMap(um)
  }, [token, boardId])

  useEffect(() => {
    loadAll().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load board'))
  }, [loadAll])

  useEffect(() => {
    const t = (localStorage.getItem('taskboard_theme') as 'light' | 'dark') || 'light'
    document.documentElement.dataset.theme = t
  }, [])

  useEffect(() => {
    if (!token || !boardId) return
    const url = wsBoardUrl(boardId, token)
    const ws = new WebSocket(url)
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string)
        if (msg.type === 'tasks_changed') loadAll().catch(() => {})
        if (msg.type === 'columns_changed') loadAll().catch(() => {})
        if (msg.type === 'labels_changed') loadAll().catch(() => {})
        if (msg.type === 'presence' && Array.isArray(msg.user_ids)) setActiveUserIds(msg.user_ids)
      } catch {
        /* ignore */
      }
    }
    return () => ws.close()
  }, [token, boardId, loadAll])

  useEffect(() => {
    if (!token) return
    const poll = () =>
      api.notifications(token, true).then(setNotifications).catch(() => {})
    poll()
    const id = window.setInterval(poll, 25000)
    return () => clearInterval(id)
  }, [token])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const dragDisabled = !!(q.trim() || fpriority || fcolumn || fassignee || flabel || sort)

  const filteredTasks = useMemo(() => {
    let list = [...tasks]
    const ql = q.trim().toLowerCase()
    if (ql) list = list.filter((t) => t.title.toLowerCase().includes(ql) || t.description.toLowerCase().includes(ql))
    if (fpriority) list = list.filter((t) => t.priority === fpriority)
    if (fcolumn) list = list.filter((t) => t.column_id === fcolumn)
    if (fassignee === '__none__') list = list.filter((t) => !t.assignee_id)
    else if (fassignee) list = list.filter((t) => t.assignee_id === fassignee)
    if (flabel) list = list.filter((t) => t.label_ids.includes(flabel))

    if (sort === 'due_date_asc') list.sort((a, b) => (a.due_date || '9999') > (b.due_date || '9999') ? 1 : -1)
    else if (sort === 'due_date_desc') list.sort((a, b) => (a.due_date || '') < (b.due_date || '') ? 1 : -1)
    else if (sort === 'priority_asc') list.sort((a, b) => prioritySortKey(a.priority) - prioritySortKey(b.priority))
    else if (sort === 'priority_desc') list.sort((a, b) => prioritySortKey(b.priority) - prioritySortKey(a.priority))

    return list
  }, [tasks, q, fpriority, fcolumn, fassignee, flabel, sort])

  const tasksForBoard = dragDisabled ? filteredTasks : tasks

  async function addTask(columnId: string) {
    if (!token) return
    const title = window.prompt('Task title')
    if (!title?.trim()) return
    await api.createTask(token, boardId, { title: title.trim(), column_id: columnId })
    await loadAll()
  }

  async function addColumn(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !newColName.trim()) return
    await api.createColumn(token, boardId, newColName.trim())
    setNewColName('')
    setNewColOpen(false)
    await loadAll()
  }

  async function moveColumn(colId: string, delta: number) {
    if (!token || !isAdmin) return
    const idx = columns.findIndex((c) => c.id === colId)
    const j = idx + delta
    if (j < 0 || j >= columns.length) return
    const order = [...columns]
    const [x] = order.splice(idx, 1)
    order.splice(j, 0, x)
    await api.reorderColumns(
      token,
      boardId,
      order.map((c) => c.id),
    )
    await loadAll()
  }

  async function removeColumn(col: Column) {
    if (!token || !isAdmin) return
    if (!confirm(`Delete column “${col.name}”? It must be empty.`)) return
    await api.deleteColumn(token, boardId, col.id)
    await loadAll()
  }

  async function renameColumn(col: Column) {
    if (!token || !isAdmin) return
    const name = window.prompt('Column name', col.name)
    if (!name?.trim()) return
    await api.updateColumn(token, boardId, col.id, name.trim())
    await loadAll()
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    if (!inviteEmail.trim() && !inviteUser.trim()) {
      setError('Enter an email or username to invite')
      return
    }
    const body: { email?: string; username?: string; role: string } = { role: 'member' }
    if (inviteEmail.trim()) body.email = inviteEmail.trim()
    if (inviteUser.trim()) body.username = inviteUser.trim()
    await api.invite(token, boardId, body)
    setInviteOpen(false)
    setInviteEmail('')
    setInviteUser('')
    await loadAll()
  }

  async function exportJson() {
    if (!token) return
    const data = await api.exportBoard(token, boardId)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `board-${boardId}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function loadAnalytics() {
    if (!token) return
    const a = await api.analytics(token, boardId)
    setAnalytics(a)
  }

  if (!token || !user) {
    nav('/login')
    return null
  }

  return (
    <div className="relative flex min-h-screen flex-col mesh-bg">
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-50" aria-hidden />
      <div className="relative z-10 flex min-h-screen flex-col">
      <header className="glass-header flex flex-wrap items-center gap-2 px-4 py-3 glow-ring">
        <Link
          to="/"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/50"
        >
          ← Boards
        </Link>
        <h1 className="font-display min-w-0 flex-1 truncate bg-gradient-to-r from-slate-900 via-sky-800 to-violet-800 bg-clip-text text-lg font-bold text-transparent dark:from-slate-100 dark:via-cyan-200 dark:to-violet-300">
          {board?.name ?? '…'}
        </h1>
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">Active</span>
          {activeUserIds.slice(0, 8).map((id) => (
            <span
              key={id}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-[0.65rem] font-bold text-white"
              title={userMap[id]?.username ?? id}
            >
              {userMap[id] ? userMap[id].username.slice(0, 2).toUpperCase() : '?'}
            </span>
          ))}
          {activeUserIds.length === 0 ? <span className="text-xs text-slate-400">—</span> : null}
        </div>
        <button
          type="button"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          onClick={() => setNotifOpen((o) => !o)}
        >
          Alerts {notifications.length ? `(${notifications.length})` : ''}
        </button>
        {isAdmin ? (
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            onClick={() => setInviteOpen(true)}
          >
            Invite
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          onClick={exportJson}
        >
          Export JSON
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          onClick={() => void loadAnalytics()}
        >
          Analytics
        </button>
      </header>

      <p className="border-b border-cyan-500/10 bg-white/50 px-4 py-2 text-xs text-slate-600 backdrop-blur-md dark:border-cyan-500/10 dark:bg-slate-950/40 dark:text-slate-400">
        <span className="font-semibold text-cyan-900 dark:text-cyan-200/90">Collaboration</span> · everyone can edit tasks · live sync · admins{' '}
        <strong>Invite</strong> by email or username.
      </p>

      <div className="flex flex-wrap items-center gap-2 border-b border-cyan-500/10 bg-white/60 px-4 py-3 backdrop-blur-md dark:border-cyan-500/10 dark:bg-slate-900/60">
        <input
          ref={searchRef}
          className="min-w-[160px] max-w-xs flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          placeholder="Search… (press /)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          value={fpriority}
          onChange={(e) => setFpriority(e.target.value)}
        >
          <option value="">All priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <select
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          value={fcolumn}
          onChange={(e) => setFcolumn(e.target.value)}
        >
          <option value="">All columns</option>
          {columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          value={fassignee}
          onChange={(e) => setFassignee(e.target.value)}
        >
          <option value="">All assignees</option>
          <option value="__none__">Unassigned</option>
          {[...new Set(tasks.map((t) => t.assignee_id).filter(Boolean))].map((id) => (
            <option key={id} value={id!}>
              {userMap[id!]?.username ?? id}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          value={flabel}
          onChange={(e) => setFlabel(e.target.value)}
        >
          <option value="">All labels</option>
          {labels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="">Column order</option>
          <option value="due_date_asc">Due date ↑</option>
          <option value="due_date_desc">Due date ↓</option>
          <option value="priority_asc">Priority ↑</option>
          <option value="priority_desc">Priority ↓</option>
        </select>
        {isAdmin ? (
          <button
            type="button"
            className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            onClick={() => setNewColOpen(true)}
          >
            + Column
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
          onClick={async () => {
            if (!token) return
            const name = window.prompt('Label name')
            if (!name?.trim()) return
            const color = window.prompt('Color (#RRGGBB)', '#6366f1') || '#6366f1'
            await api.createLabel(token, boardId, name.trim(), color)
            await loadAll()
          }}
        >
          + Label
        </button>
      </div>

      {error ? <p className="px-4 py-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <div className="flex-1 overflow-auto p-4">
        {dragDisabled ? (
          <p className="mb-3 text-sm text-amber-800 dark:text-amber-200/90">
            Drag-and-drop is paused while search, filters, or sort are active. Clear them to reorder tasks.
          </p>
        ) : null}
        <BoardKanban
          boardId={boardId}
          token={token}
          columns={columns}
          tasks={tasksForBoard}
          labels={labels}
          userMap={userMap}
          dragDisabled={dragDisabled}
          onTasksUpdated={setTasks}
          onOpenTask={setSelected}
          isAdmin={!!isAdmin}
          onRenameColumn={renameColumn}
          onMoveColumn={moveColumn}
          onRemoveColumn={removeColumn}
          onAddTask={addTask}
        />
      </div>

      {selected && token ? (
        <TaskPanel
          token={token}
          boardId={boardId}
          task={tasks.find((t) => t.id === selected.id) || selected}
          columns={columns}
          labels={labels}
          userMap={userMap}
          onClose={() => setSelected(null)}
          onNeuralAssist={() => setNeuralOpen(true)}
          onSaved={(t) => {
            setTasks((prev) => prev.map((x) => (x.id === t.id ? t : x)))
            setSelected(t)
          }}
          onDeleted={() => {
            setSelected(null)
            void loadAll()
          }}
        />
      ) : null}

      {token && board ? (
        <AIAssistant
          token={token}
          boardName={board.name}
          columns={columns}
          tasks={tasks}
          selectedTask={selected}
          open={neuralOpen}
          onOpenChange={setNeuralOpen}
        />
      ) : null}

      {newColOpen ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4"
          onMouseDown={() => setNewColOpen(false)}
        >
          <form
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onSubmit={addColumn}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">New column</h3>
            <input
              className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              autoFocus
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              placeholder="Name"
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-lg px-4 py-2 text-sm" onClick={() => setNewColOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white">
                Create
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {inviteOpen ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4"
          onMouseDown={() => setInviteOpen(false)}
        >
          <form
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onSubmit={onInvite}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">Invite member</h3>
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">Invite an existing user by email or username.</p>
            <label className="mb-3 block">
              <span className="text-xs text-slate-500">Email</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </label>
            <label className="mb-4 block">
              <span className="text-xs text-slate-500">Username</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
                value={inviteUser}
                onChange={(e) => setInviteUser(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-lg px-4 py-2 text-sm" onClick={() => setInviteOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white">
                Send invite
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {notifOpen ? (
        <div
          className="fixed right-4 top-16 z-50 max-h-80 w-80 overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
          onMouseLeave={() => setNotifOpen(false)}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
            <strong className="text-slate-900 dark:text-slate-100">Notifications</strong>
            <button
              type="button"
              className="text-xs text-sky-600 dark:text-sky-400"
              onClick={() =>
                token && api.markAllNotifRead(token).then(() => api.notifications(token, true).then(setNotifications))
              }
            >
              Mark all read
            </button>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.length === 0 ? (
              <li className="px-3 py-4 text-sm text-slate-500">No unread notifications</li>
            ) : (
              notifications.map((n) => (
                <li key={n.id} className="px-3 py-2 text-sm">
                  {n.message}
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      className="text-xs text-sky-600"
                      onClick={() =>
                        token &&
                        api.markNotifRead(token, n.id).then(() => api.notifications(token, true).then(setNotifications))
                      }
                    >
                      Mark read
                    </button>
                    {n.board_id ? (
                      <Link to={`/boards/${n.board_id}`} className="text-xs text-sky-600" onClick={() => setNotifOpen(false)}>
                        Open board
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {analytics ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4"
          onMouseDown={() => setAnalytics(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 font-semibold text-slate-900 dark:text-slate-100">Tasks per column</h3>
            <ul className="list-inside list-disc space-y-1 text-sm text-slate-700 dark:text-slate-300">
              {analytics.by_column.map((row) => (
                <li key={row.column_id}>
                  {row.name}: <strong>{row.count}</strong>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-4 rounded-lg bg-slate-200 px-4 py-2 text-sm dark:bg-slate-700"
              onClick={() => setAnalytics(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  )
}
