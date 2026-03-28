export type Priority = 'low' | 'medium' | 'high'
export type BoardRole = 'admin' | 'member'

export interface User {
  id: string
  email: string
  username: string
  created_at: string
}

export interface BoardMember {
  user_id: string
  role: BoardRole
}

export interface Board {
  id: string
  name: string
  owner_id: string
  members: BoardMember[]
  pending_invites: { email?: string; username?: string; role: string }[]
  created_at: string
  updated_at?: string | null
}

export interface Column {
  id: string
  board_id: string
  name: string
  order: number
  created_at: string
}

export interface Task {
  id: string
  board_id: string
  column_id: string
  title: string
  description: string
  priority: Priority
  due_date: string | null
  assignee_id: string | null
  label_ids: string[]
  order: number
  created_at: string
  updated_at: string
}

export interface Label {
  id: string
  board_id: string
  name: string
  color: string
}

export interface Comment {
  id: string
  task_id: string
  user_id: string
  body: string
  created_at: string
}

export interface ActivityItem {
  id: string
  board_id: string
  task_id: string | null
  user_id: string | null
  action: string
  details: Record<string, unknown>
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: string
  message: string
  board_id: string | null
  task_id: string | null
  read: boolean
  created_at: string
}
