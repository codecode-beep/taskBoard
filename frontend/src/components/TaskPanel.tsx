import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { ActivityItem, Column, Comment, Label, Priority, Task, User } from '../types'
import { api } from '../api'
import { formatDateTime, initials, priorityLabel } from '../utils'

type Props = {
  token: string
  boardId: string
  task: Task
  columns: Column[]
  labels: Label[]
  userMap: Record<string, User>
  onClose: () => void
  onSaved: (t: Task) => void
  onDeleted: () => void
  /** Opens Neural assist with this task in context */
  onNeuralAssist?: () => void
}

function sameLabels(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((x) => s.has(x))
}

export default function TaskPanel({
  token,
  boardId,
  task,
  columns,
  labels,
  userMap,
  onClose,
  onSaved,
  onDeleted,
  onNeuralAssist,
}: Props) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [priority, setPriority] = useState<Priority>(task.priority)
  const [columnId, setColumnId] = useState(task.column_id)
  const [due, setDue] = useState(task.due_date?.slice(0, 10) ?? '')
  const [assigneeId, setAssigneeId] = useState(task.assignee_id ?? '')
  const [labelIds, setLabelIds] = useState<string[]>(task.label_ids)
  const [comments, setComments] = useState<Comment[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [commentBody, setCommentBody] = useState('')
  const [userQuery, setUserQuery] = useState('')
  const [userHits, setUserHits] = useState<User[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description)
    setPriority(task.priority)
    setColumnId(task.column_id)
    setDue(task.due_date?.slice(0, 10) ?? '')
    setAssigneeId(task.assignee_id ?? '')
    setLabelIds(task.label_ids)
  }, [task])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [c, a] = await Promise.all([
          api.comments(token, boardId, task.id),
          api.taskActivity(token, boardId, task.id),
        ])
        if (!cancelled) {
          setComments(c)
          setActivity(a)
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, boardId, task.id])

  useEffect(() => {
    if (userQuery.length < 2) {
      setUserHits([])
      return
    }
    const t = setTimeout(() => {
      api.searchUsers(token, userQuery).then(setUserHits).catch(() => setUserHits([]))
    }, 200)
    return () => clearTimeout(t)
  }, [token, userQuery])

  const dirty = useMemo(() => {
    const dueNext = due || null
    const duePrev = task.due_date?.slice(0, 10) || null
    return (
      title.trim() !== task.title ||
      description !== task.description ||
      priority !== task.priority ||
      columnId !== task.column_id ||
      dueNext !== duePrev ||
      (assigneeId || '') !== (task.assignee_id || '') ||
      !sameLabels(labelIds, task.label_ids)
    )
  }, [title, description, priority, columnId, due, assigneeId, labelIds, task])

  async function save() {
    if (!dirty) return
    setSaving(true)
    setError('')
    const patch: Record<string, unknown> = {}
    if (title.trim() !== task.title) patch.title = title.trim()
    if (description !== task.description) patch.description = description
    if (priority !== task.priority) patch.priority = priority
    if (columnId !== task.column_id) patch.column_id = columnId
    const dueNext = due || null
    const duePrev = task.due_date?.slice(0, 10) || null
    if (dueNext !== duePrev) patch.due_date = dueNext
    if ((assigneeId || '') !== (task.assignee_id || '')) {
      patch.assignee_id = assigneeId || null
    }
    if (!sameLabels(labelIds, task.label_ids)) patch.label_ids = labelIds

    try {
      const t = await api.updateTask(token, boardId, task.id, patch)
      onSaved(t)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function onAddComment(e: FormEvent) {
    e.preventDefault()
    if (!commentBody.trim()) return
    try {
      const c = await api.addComment(token, boardId, task.id, commentBody.trim())
      setComments((prev) => [...prev, c])
      setCommentBody('')
      const a = await api.taskActivity(token, boardId, task.id)
      setActivity(a)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comment failed')
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this task?')) return
    try {
      await api.deleteTask(token, boardId, task.id)
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  function toggleLabel(id: string) {
    setLabelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px] dark:bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-cyan-500/15 bg-white/95 shadow-2xl shadow-cyan-950/10 backdrop-blur-xl dark:border-cyan-500/10 dark:bg-slate-900/95"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start gap-2 border-b border-slate-200/80 p-4 dark:border-slate-700/80">
          <input
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-lg font-bold text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error ? <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
            Created {formatDateTime(task.created_at)} · Updated {formatDateTime(task.updated_at)}
          </p>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => void save()}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Update task'}
            </button>
            {onNeuralAssist ? (
              <button
                type="button"
                className="rounded-lg border border-cyan-500/40 bg-gradient-to-r from-cyan-500/10 to-violet-500/10 px-3 py-2 text-xs font-bold tracking-wide text-cyan-700 hover:border-cyan-400/60 dark:text-cyan-300"
                onClick={onNeuralAssist}
              >
                ✦ Neural
              </button>
            ) : null}
            {dirty ? <span className="self-center text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span> : null}
          </div>

          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Description</span>
            <textarea
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Status</span>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={columnId}
                onChange={(e) => setColumnId(e.target.value)}
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Priority</span>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                {(['low', 'medium', 'high'] as const).map((p) => (
                  <option key={p} value={p}>
                    {priorityLabel(p)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Due date</span>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>

          <div className="mb-4">
            <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Assignee</div>
            <div className="flex flex-wrap items-center gap-2">
              {assigneeId && userMap[assigneeId] ? (
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white"
                  title={userMap[assigneeId].username}
                >
                  {initials(userMap[assigneeId].username)}
                </span>
              ) : null}
              <input
                className="min-w-[120px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Search users…"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
              />
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
                onClick={() => setAssigneeId('')}
              >
                Clear
              </button>
            </div>
            {userHits.length > 0 ? (
              <ul className="mt-2 max-h-28 overflow-auto rounded-lg border border-slate-200 dark:border-slate-600">
                {userHits.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                      onClick={() => {
                        setAssigneeId(u.id)
                        setUserQuery('')
                        setUserHits([])
                      }}
                    >
                      {u.username} <span className="text-slate-500">({u.email})</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="mb-6">
            <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Labels</div>
            <div className="flex flex-wrap gap-2">
              {labels.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={`rounded-full border-2 px-3 py-1 text-xs font-semibold transition-colors ${
                    labelIds.includes(l.id) ? 'text-white' : 'border-current bg-transparent text-slate-700 dark:text-slate-200'
                  }`}
                  style={{
                    borderColor: l.color,
                    backgroundColor: labelIds.includes(l.id) ? l.color : 'transparent',
                  }}
                  onClick={() => toggleLabel(l.id)}
                >
                  {l.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Comments</h3>
            <ul className="mb-3 space-y-2">
              {comments.map((c) => (
                <li key={c.id} className="rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800/80">
                  <strong>{userMap[c.user_id]?.username ?? c.user_id.slice(-6)}</strong>{' '}
                  <span className="text-xs text-slate-500">{formatDateTime(c.created_at)}</span>
                  <div className="mt-1 whitespace-pre-wrap">{c.body}</div>
                </li>
              ))}
            </ul>
            <form onSubmit={onAddComment} className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Write a comment…"
              />
              <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">
                Add
              </button>
            </form>
          </div>

          <div className="mb-6">
            <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Activity</h3>
            <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-slate-500 dark:text-slate-400">
              {activity.map((a) => (
                <li key={a.id}>
                  <span className="font-medium text-slate-700 dark:text-slate-300">{a.action.replace(/_/g, ' ')}</span> ·{' '}
                  {formatDateTime(a.created_at)}
                  {a.user_id && userMap[a.user_id] ? ` · ${userMap[a.user_id].username}` : ''}
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50"
            onClick={handleDelete}
          >
            Delete task
          </button>
        </div>
      </div>
    </div>
  )
}
