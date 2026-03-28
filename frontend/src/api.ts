import type {
  ActivityItem,
  Board,
  Column,
  Comment,
  Label,
  Notification,
  Priority,
  Task,
  User,
} from './types'

const base = () => (import.meta.env.VITE_API_URL || '') + '/api/v1'

function authHeader(token: string | null): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText
    try {
      const j = await res.json()
      if (j?.detail) msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  register: (body: { email: string; username: string; password: string }) =>
    fetch(`${base()}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => parse<User>(r)),

  login: (body: { username: string; password: string }) =>
    fetch(`${base()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => parse<{ access_token: string }>(r)),

  me: (token: string) =>
    fetch(`${base()}/users/me`, { headers: authHeader(token) }).then((r) => parse<User>(r)),

  searchUsers: (token: string, q: string) =>
    fetch(`${base()}/users/search?q=${encodeURIComponent(q)}`, {
      headers: authHeader(token),
    }).then((r) => parse<User[]>(r)),

  usersByIds: (token: string, ids: string[]) =>
    fetch(`${base()}/users/by-ids?ids=${encodeURIComponent(ids.join(','))}`, {
      headers: authHeader(token),
    }).then((r) => parse<User[]>(r)),

  boards: (token: string) =>
    fetch(`${base()}/boards`, { headers: authHeader(token) }).then((r) => parse<Board[]>(r)),

  createBoard: (token: string, name: string) =>
    fetch(`${base()}/boards`, {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ name }),
    }).then((r) => parse<Board>(r)),

  getBoard: (token: string, id: string) =>
    fetch(`${base()}/boards/${id}`, { headers: authHeader(token) }).then((r) => parse<Board>(r)),

  invite: (token: string, boardId: string, body: { email?: string; username?: string; role: string }) =>
    fetch(`${base()}/boards/${boardId}/invite`, {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify(body),
    }).then((r) => parse<Board>(r)),

  removeMember: (token: string, boardId: string, userId: string) =>
    fetch(`${base()}/boards/${boardId}/members/${userId}`, {
      method: 'DELETE',
      headers: authHeader(token),
    }).then((r) => parse<Board>(r)),

  updateMemberRole: (token: string, boardId: string, userId: string, role: string) =>
    fetch(`${base()}/boards/${boardId}/members`, {
      method: 'PATCH',
      headers: authHeader(token),
      body: JSON.stringify({ user_id: userId, role }),
    }).then((r) => parse<Board>(r)),

  exportBoard: (token: string, boardId: string) =>
    fetch(`${base()}/boards/${boardId}/export`, { headers: authHeader(token) }).then((r) =>
      parse<Record<string, unknown>>(r),
    ),

  analytics: (token: string, boardId: string) =>
    fetch(`${base()}/boards/${boardId}/analytics`, { headers: authHeader(token) }).then((r) =>
      parse<{ by_column: { column_id: string; name: string; count: number }[] }>(r),
    ),

  columns: (token: string, boardId: string) =>
    fetch(`${base()}/boards/${boardId}/columns`, { headers: authHeader(token) }).then((r) =>
      parse<Column[]>(r),
    ),

  createColumn: (token: string, boardId: string, name: string) =>
    fetch(`${base()}/boards/${boardId}/columns`, {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ name }),
    }).then((r) => parse<Column>(r)),

  updateColumn: (token: string, boardId: string, columnId: string, name: string) =>
    fetch(`${base()}/boards/${boardId}/columns/${columnId}`, {
      method: 'PATCH',
      headers: authHeader(token),
      body: JSON.stringify({ name }),
    }).then((r) => parse<Column>(r)),

  deleteColumn: (token: string, boardId: string, columnId: string) =>
    fetch(`${base()}/boards/${boardId}/columns/${columnId}`, {
      method: 'DELETE',
      headers: authHeader(token),
    }).then((r) => parse<void>(r)),

  reorderColumns: (token: string, boardId: string, ordered_column_ids: string[]) =>
    fetch(`${base()}/boards/${boardId}/columns/reorder`, {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ ordered_column_ids }),
    }).then((r) => parse<Column[]>(r)),

  tasks: (
    token: string,
    boardId: string,
    params: Record<string, string | undefined>,
  ) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v) q.set(k, v)
    })
    const qs = q.toString()
    const url = `${base()}/boards/${boardId}/tasks${qs ? `?${qs}` : ''}`
    return fetch(url, { headers: authHeader(token) }).then((r) => parse<Task[]>(r))
  },

  createTask: (
    token: string,
    boardId: string,
    body: {
      title: string
      description?: string
      column_id: string
      priority?: Priority
      due_date?: string | null
      assignee_id?: string | null
      label_ids?: string[]
    },
  ) =>
    fetch(`${base()}/boards/${boardId}/tasks`, {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify(body),
    }).then((r) => parse<Task>(r)),

  updateTask: (token: string, boardId: string, taskId: string, patch: Partial<Task> & Record<string, unknown>) =>
    fetch(`${base()}/boards/${boardId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: authHeader(token),
      body: JSON.stringify(patch),
    }).then((r) => parse<Task>(r)),

  deleteTask: (token: string, boardId: string, taskId: string) =>
    fetch(`${base()}/boards/${boardId}/tasks/${taskId}`, {
      method: 'DELETE',
      headers: authHeader(token),
    }).then((r) => parse<void>(r)),

  reorderTasks: (
    token: string,
    boardId: string,
    items: { task_id: string; column_id: string; order: number }[],
  ) =>
    fetch(`${base()}/boards/${boardId}/tasks/reorder`, {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ items }),
    }).then((r) => parse<Task[]>(r)),

  labels: (token: string, boardId: string) =>
    fetch(`${base()}/boards/${boardId}/labels`, { headers: authHeader(token) }).then((r) =>
      parse<Label[]>(r),
    ),

  createLabel: (token: string, boardId: string, name: string, color: string) =>
    fetch(`${base()}/boards/${boardId}/labels`, {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ name, color }),
    }).then((r) => parse<Label>(r)),

  deleteLabel: (token: string, boardId: string, labelId: string) =>
    fetch(`${base()}/boards/${boardId}/labels/${labelId}`, {
      method: 'DELETE',
      headers: authHeader(token),
    }).then((r) => parse<void>(r)),

  comments: (token: string, boardId: string, taskId: string) =>
    fetch(`${base()}/boards/${boardId}/tasks/${taskId}/comments`, {
      headers: authHeader(token),
    }).then((r) => parse<Comment[]>(r)),

  addComment: (token: string, boardId: string, taskId: string, body: string) =>
    fetch(`${base()}/boards/${boardId}/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ body }),
    }).then((r) => parse<Comment>(r)),

  taskActivity: (token: string, boardId: string, taskId: string) =>
    fetch(`${base()}/boards/${boardId}/tasks/${taskId}/activity`, {
      headers: authHeader(token),
    }).then((r) => parse<ActivityItem[]>(r)),

  notifications: (token: string, unreadOnly?: boolean) =>
    fetch(`${base()}/notifications${unreadOnly ? '?unread_only=true' : ''}`, {
      headers: authHeader(token),
    }).then((r) => parse<Notification[]>(r)),

  markNotifRead: (token: string, id: string) =>
    fetch(`${base()}/notifications/${id}/read`, {
      method: 'POST',
      headers: authHeader(token),
    }).then((r) => parse<{ ok: boolean }>(r)),

  markAllNotifRead: (token: string) =>
    fetch(`${base()}/notifications/read-all`, {
      method: 'POST',
      headers: authHeader(token),
    }).then((r) => parse<{ ok: boolean }>(r)),

  aiPolish: (token: string, text: string, taskTitle?: string) =>
    fetch(`${base()}/ai/polish`, {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ text, task_title: taskTitle || null }),
    }).then((r) => parse<{ result: string; mode: string }>(r)),

  aiTitleIdeas: (token: string, seed: string, context?: string) =>
    fetch(`${base()}/ai/title-ideas`, {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ seed, context: context || null }),
    }).then((r) => parse<{ result: string; mode: string }>(r)),

  aiBoardBrief: (token: string, boardName: string, tasks: { title: string; column: string; priority: string }[]) =>
    fetch(`${base()}/ai/board-brief`, {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ board_name: boardName, tasks }),
    }).then((r) => parse<{ result: string; mode: string }>(r)),

  aiChat: (token: string, message: string, boardName?: string, taskTitle?: string) =>
    fetch(`${base()}/ai/chat`, {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({
        message,
        board_name: boardName || null,
        task_title: taskTitle || null,
      }),
    }).then((r) => parse<{ result: string; mode: string }>(r)),
}

/** WebSocket URL for board updates. In dev, connects straight to the API to avoid flaky Vite `ws` proxy (ECONNRESET). */
export function wsBoardUrl(boardId: string, token: string): string {
  const q = `token=${encodeURIComponent(token)}`
  const path = `/ws/boards/${boardId}?${q}`

  if (import.meta.env.VITE_API_URL) {
    const u = new URL(import.meta.env.VITE_API_URL)
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${u.host}${path}`
  }

  if (import.meta.env.DEV) {
    const origin = (import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8000').replace(/\/$/, '')
    return `${origin}${path}`
  }

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}`
}
