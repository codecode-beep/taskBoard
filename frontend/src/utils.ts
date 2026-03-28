export function initials(username: string): string {
  const parts = username.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  const s = parts[0] || '?'
  return s.slice(0, 2).toUpperCase()
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

export function priorityLabel(p: string): string {
  return p.charAt(0).toUpperCase() + p.slice(1)
}

export function prioritySortKey(p: string): number {
  return PRIORITY_ORDER[p] ?? 99
}
