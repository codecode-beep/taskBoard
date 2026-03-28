import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import type { Column, Task } from '../types'

type Tab = 'copilot' | 'tools'

function aiEngineBadge(mode: string): { label: string; className: string } {
  switch (mode) {
    case 'gemini':
      return { label: 'Live · Gemini', className: 'text-cyan-400/90' }
    case 'gemini_quota':
      return { label: 'Gemini · quota / rate limit', className: 'text-amber-400/95' }
    case 'gemini_auth':
      return { label: 'Gemini · invalid key', className: 'text-rose-400/95' }
    case 'demo':
    default:
      return { label: 'Demo', className: 'text-slate-500/85' }
  }
}

type Props = {
  token: string
  boardName: string
  columns: Column[]
  tasks: Task[]
  selectedTask: Task | null
  /** Controlled open state (optional). When set, fab toggles call onOpenChange only. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export default function AIAssistant({
  token,
  boardName,
  columns,
  tasks,
  selectedTask,
  open: openProp,
  onOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const controlled = typeof openProp === 'boolean'
  const open = controlled ? openProp : internalOpen
  const [tab, setTab] = useState<Tab>('copilot')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string; mode?: string }[]>([])

  const [polishText, setPolishText] = useState('')
  const [polishOut, setPolishOut] = useState('')
  const [polishMode, setPolishMode] = useState('')
  const [titleSeed, setTitleSeed] = useState('')
  const [titleOut, setTitleOut] = useState('')
  const [titleMode, setTitleMode] = useState('')
  const [briefOut, setBriefOut] = useState('')
  const [briefMode, setBriefMode] = useState('')

  const setPanelOpen = useCallback(
    (v: boolean) => {
      if (!controlled) setInternalOpen(v)
      onOpenChange?.(v)
    },
    [controlled, onOpenChange],
  )

  useEffect(() => {
    if (selectedTask && open && tab === 'tools') {
      setPolishText(selectedTask.description || '')
    }
  }, [selectedTask, open, tab])

  async function sendChat() {
    const q = chatInput.trim()
    if (!q) return
    setError('')
    setBusy(true)
    setChatInput('')
    setMessages((m) => [...m, { role: 'user', text: q }])
    try {
      const { result, mode } = await api.aiChat(token, q, boardName, selectedTask?.title)
      setMessages((m) => [...m, { role: 'assistant', text: result, mode }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  async function runPolish() {
    const t = polishText.trim()
    if (!t) return
    setError('')
    setBusy(true)
    setPolishOut('')
    setPolishMode('')
    try {
      const { result, mode } = await api.aiPolish(token, t, selectedTask?.title)
      setPolishOut(result)
      setPolishMode(mode)
      setMessages((m) => [
        ...m,
        { role: 'user', text: '[Polish description]' },
        { role: 'assistant', text: result, mode },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function runTitles() {
    const s = titleSeed.trim()
    if (!s) return
    setError('')
    setBusy(true)
    setTitleOut('')
    setTitleMode('')
    try {
      const ctx = selectedTask?.description?.slice(0, 500)
      const { result, mode } = await api.aiTitleIdeas(token, s, ctx)
      setTitleOut(result)
      setTitleMode(mode)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function runBrief() {
    setError('')
    setBusy(true)
    setBriefOut('')
    setBriefMode('')
    try {
      const colName = (id: string) => columns.find((c) => c.id === id)?.name ?? '?'
      const snapshot = tasks.slice(0, 100).map((t) => ({
        title: t.title,
        column: colName(t.column_id),
        priority: t.priority,
      }))
      const { result, mode } = await api.aiBoardBrief(token, boardName, snapshot)
      setBriefOut(result)
      setBriefMode(mode)
      setMessages((m) => [
        ...m,
        { role: 'user', text: '[Board pulse]' },
        { role: 'assistant', text: result, mode },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  function copy(txt: string) {
    void navigator.clipboard.writeText(txt)
  }

  return (
    <>
      <button
        id="neural-fab"
        type="button"
        aria-expanded={open}
        aria-label="Open Neural assist"
        className={`fixed bottom-6 right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/40 bg-gradient-to-br from-cyan-500 via-sky-600 to-violet-600 text-white shadow-lg shadow-cyan-500/25 transition hover:scale-105 hover:shadow-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900 dark:focus:ring-offset-slate-950 ${
          open ? 'ring-2 ring-cyan-300' : ''
        }`}
        onClick={() => setPanelOpen(!open)}
      >
        <span className="font-display text-lg font-bold tracking-tight">✦</span>
        <span className="pointer-events-none absolute inset-0 animate-pulse rounded-2xl border border-white/20" />
      </button>

      {open ? (
        <div className="fixed bottom-24 right-6 z-[60] flex max-h-[min(72vh,640px)] w-[min(100vw-2rem,420px)] flex-col overflow-hidden rounded-2xl border border-cyan-500/25 bg-slate-950/90 shadow-2xl shadow-cyan-950/40 backdrop-blur-2xl dark:border-cyan-400/20">
          <div className="relative border-b border-cyan-500/20 bg-gradient-to-r from-cyan-950/80 via-slate-950/90 to-violet-950/80 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-bold tracking-wide text-cyan-200">NEURAL ASSIST</h2>
                <p className="text-[0.65rem] uppercase tracking-widest text-cyan-500/80">Copilot · Board intelligence</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                onClick={() => setPanelOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent"
              aria-hidden
            />
          </div>

          <div className="flex border-b border-slate-800">
            {(['copilot', 'tools'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider ${
                  tab === t ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-500 hover:text-slate-300'
                }`}
                onClick={() => setTab(t)}
              >
                {t === 'copilot' ? 'Copilot' : 'Quick tools'}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {error ? <p className="mb-2 rounded-lg bg-red-950/50 px-2 py-1.5 text-xs text-red-300">{error}</p> : null}

            {selectedTask ? (
              <p className="mb-3 rounded-lg border border-violet-500/20 bg-violet-950/30 px-2 py-1.5 text-[0.7rem] text-violet-200/90">
                Context: <strong>{selectedTask.title}</strong>
              </p>
            ) : (
              <p className="mb-3 text-[0.7rem] text-slate-500">Open a task for richer context, or work board-wide.</p>
            )}

            {tab === 'copilot' ? (
              <div className="flex flex-col gap-2">
                <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/50 p-2">
                  {messages.length === 0 ? (
                    <p className="text-center text-xs text-slate-500">
                      Ask about priorities, risks, or how to phrase work. Live model if API key is set.
                    </p>
                  ) : (
                    messages.map((m, i) => (
                      <div
                        key={i}
                        className={`rounded-lg px-2 py-1.5 text-xs ${
                          m.role === 'user' ? 'ml-4 bg-slate-800 text-slate-200' : 'mr-4 border border-cyan-500/15 bg-cyan-950/40 text-cyan-50'
                        }`}
                      >
                        {m.mode ? (
                          <span
                            className={`mb-1 block text-[0.6rem] font-semibold uppercase tracking-wide ${aiEngineBadge(m.mode).className}`}
                          >
                            {aiEngineBadge(m.mode).label}
                          </span>
                        ) : null}
                        <div className="whitespace-pre-wrap">{m.text}</div>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none"
                    placeholder="Message copilot…"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), void sendChat())}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    className="shrink-0 rounded-xl bg-gradient-to-r from-cyan-600 to-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    onClick={() => void sendChat()}
                  >
                    Send
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <section>
                  <h3 className="mb-1 font-display text-xs font-bold text-cyan-400/90">Polish description</h3>
                  <textarea
                    className="mb-2 min-h-[88px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-cyan-500/40 focus:outline-none"
                    placeholder="Paste or edit task description…"
                    value={polishText}
                    onChange={(e) => setPolishText(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    className="w-full rounded-xl border border-cyan-500/30 bg-cyan-950/40 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/40 disabled:opacity-50"
                    onClick={() => void runPolish()}
                  >
                    Run polish
                  </button>
                  {polishOut ? (
                    <div className="mt-2 rounded-xl border border-slate-700 bg-slate-900/80 p-2">
                      {polishMode ? (
                        <span
                          className={`mb-1 block text-[0.6rem] font-semibold uppercase tracking-wide ${aiEngineBadge(polishMode).className}`}
                        >
                          {aiEngineBadge(polishMode).label}
                        </span>
                      ) : null}
                      <div className="mb-1 flex justify-end">
                        <button type="button" className="text-[0.65rem] text-cyan-400 hover:underline" onClick={() => copy(polishOut)}>
                          Copy
                        </button>
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-[0.75rem] text-slate-300">{polishOut}</pre>
                    </div>
                  ) : null}
                </section>

                <section>
                  <h3 className="mb-1 font-display text-xs font-bold text-violet-400/90">Title ideas</h3>
                  <input
                    className="mb-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-violet-500/40 focus:outline-none"
                    placeholder="Seed idea or current title…"
                    value={titleSeed}
                    onChange={(e) => setTitleSeed(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    className="w-full rounded-xl border border-violet-500/30 bg-violet-950/40 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-900/40 disabled:opacity-50"
                    onClick={() => void runTitles()}
                  >
                    Generate titles
                  </button>
                  {titleOut ? (
                    <div className="mt-2 rounded-xl border border-slate-700 bg-slate-900/80 p-2">
                      {titleMode ? (
                        <span
                          className={`mb-1 block text-[0.6rem] font-semibold uppercase tracking-wide ${aiEngineBadge(titleMode).className}`}
                        >
                          {aiEngineBadge(titleMode).label}
                        </span>
                      ) : null}
                      <pre className="whitespace-pre-wrap font-sans text-[0.75rem] text-slate-300">{titleOut}</pre>
                    </div>
                  ) : null}
                </section>

                <section>
                  <h3 className="mb-1 font-display text-xs font-bold text-sky-400/90">Board pulse</h3>
                  <p className="mb-2 text-[0.65rem] text-slate-500">Snapshot of this board ({tasks.length} tasks).</p>
                  <button
                    type="button"
                    disabled={busy}
                    className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-violet-600 py-2 text-xs font-bold text-white shadow-lg shadow-violet-900/30 disabled:opacity-50"
                    onClick={() => void runBrief()}
                  >
                    Analyze workload
                  </button>
                  {briefOut ? (
                    <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/80 p-2">
                      {briefMode ? (
                        <span
                          className={`mb-1 block text-[0.6rem] font-semibold uppercase tracking-wide ${aiEngineBadge(briefMode).className}`}
                        >
                          {aiEngineBadge(briefMode).label}
                        </span>
                      ) : null}
                      <pre className="whitespace-pre-wrap font-sans text-[0.75rem] text-slate-300">{briefOut}</pre>
                    </div>
                  ) : null}
                </section>
              </div>
            )}
          </div>

          {busy ? (
            <div className="border-t border-slate-800 px-3 py-2 text-center text-[0.65rem] text-cyan-400/80">
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-cyan-400" />
                Processing…
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
