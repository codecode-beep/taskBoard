import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Label, Task, User } from '../types'
import { formatDate, initials, priorityLabel } from '../utils'

type Props = {
  task: Task
  labels: Label[]
  userMap: Record<string, User>
  disabled: boolean
  onOpen: () => void
}

export default function SortableTaskCard({ task, labels, userMap, disabled, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group mb-2 rounded-lg border border-slate-200/90 bg-white/95 shadow-sm transition-all dark:border-cyan-950/40 dark:bg-slate-800/95 ${
        isDragging ? 'z-50 scale-[1.02] opacity-95 shadow-xl ring-2 ring-cyan-400/50' : 'hover:border-cyan-500/20 hover:shadow-md dark:hover:border-cyan-500/25'
      }`}
    >
      <div className="flex gap-2 p-2.5">
        <button
          type="button"
          className="mt-0.5 flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing dark:hover:bg-slate-700 dark:hover:text-slate-300"
          aria-label="Drag task"
          disabled={disabled}
          {...listeners}
          {...attributes}
        >
          <span className="text-xs leading-none">⋮⋮</span>
        </button>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
          <div className="font-semibold text-slate-900 dark:text-slate-100">{task.title}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {priorityLabel(task.priority)}
            </span>
            {task.due_date ? (
              <span className="text-[0.7rem] text-slate-500 dark:text-slate-400">Due {formatDate(task.due_date)}</span>
            ) : null}
            {task.assignee_id && userMap[task.assignee_id] ? (
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-600 text-[0.6rem] font-bold text-white"
                title={userMap[task.assignee_id].username}
              >
                {initials(userMap[task.assignee_id].username)}
              </span>
            ) : null}
            {task.label_ids.map((lid) => {
              const lab = labels.find((l) => l.id === lid)
              if (!lab) return null
              return (
                <span
                  key={lid}
                  className="rounded-full px-2 py-0.5 text-[0.65rem] font-semibold text-white"
                  style={{ backgroundColor: lab.color }}
                >
                  {lab.name}
                </span>
              )
            })}
          </div>
        </button>
      </div>
    </div>
  )
}
