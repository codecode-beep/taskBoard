import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Column, Label, Task, User } from '../types'
import SortableTaskCard from './SortableTaskCard'

function findContainer(id: string, items: Record<string, string[]>): string | undefined {
  if (id in items) return id
  return Object.keys(items).find((key) => items[key].includes(id))
}

type Props = {
  boardId: string
  token: string
  columns: Column[]
  tasks: Task[]
  labels: Label[]
  userMap: Record<string, User>
  dragDisabled: boolean
  onTasksUpdated: (tasks: Task[]) => void
  onOpenTask: (task: Task) => void
  isAdmin: boolean
  onRenameColumn: (col: Column) => void
  onMoveColumn: (colId: string, delta: number) => void
  onRemoveColumn: (col: Column) => void
  onAddTask: (columnId: string) => void
}

export default function BoardKanban({
  boardId,
  token,
  columns,
  tasks,
  labels,
  userMap,
  dragDisabled,
  onTasksUpdated,
  onOpenTask,
  isAdmin,
  onRenameColumn,
  onMoveColumn,
  onRemoveColumn,
  onAddTask,
}: Props) {
  const [columnItems, setColumnItems] = useState<Record<string, string[]>>({})
  const columnItemsRef = useRef(columnItems)
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    columnItemsRef.current = columnItems
  }, [columnItems])

  useEffect(() => {
    const sorted = [...tasks].sort((a, b) => a.order - b.order)
    const next: Record<string, string[]> = {}
    for (const c of columns) next[c.id] = []
    for (const t of sorted) {
      if (!next[t.column_id]) next[t.column_id] = []
      next[t.column_id].push(t.id)
    }
    for (const c of columns) {
      if (!next[c.id]) next[c.id] = []
    }
    setColumnItems(next)
  }, [columns, tasks])

  const tasksById = new Map(tasks.map((t) => [t.id, t]))

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {}),
  )

  async function persist(items: Record<string, string[]>) {
    if (!token) return
    const payload: { task_id: string; column_id: string; order: number }[] = []
    for (const col of columns) {
      const ids = items[col.id] || []
      ids.forEach((taskId, order) => payload.push({ task_id: taskId, column_id: col.id, order }))
    }
    const updated = await api.reorderTasks(token, boardId, payload)
    onTasksUpdated(updated)
  }

  function handleDragStart(event: DragStartEvent) {
    if (dragDisabled) return
    setActiveId(String(event.active.id))
  }

  function handleDragOver(event: DragOverEvent) {
    if (dragDisabled) return
    const { active, over } = event
    const overId = over?.id != null ? String(over.id) : null
    if (overId == null || active.id === over?.id) return

    const items = columnItemsRef.current
    if (String(active.id) in items) return

    const overContainer = findContainer(overId, items) ?? (overId in items ? overId : undefined)
    const activeContainer = findContainer(String(active.id), items)
    if (!overContainer || !activeContainer) return
    if (activeContainer === overContainer) return

    setColumnItems((prev) => {
      const activeItems = [...prev[activeContainer]]
      const overItems = [...prev[overContainer]]
      const activeIndex = activeItems.indexOf(String(active.id))
      const overIndex = overItems.indexOf(overId)

      let newIndex: number
      if (overId in prev && overId !== String(active.id)) {
        newIndex = overItems.length
      } else {
        const isBelowOverItem =
          !!over &&
          active.rect.current.translated &&
          over.rect &&
          active.rect.current.translated.top > over.rect.top + over.rect.height
        const modifier = isBelowOverItem ? 1 : 0
        newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length
      }

      if (activeIndex < 0) return prev

      return {
        ...prev,
        [activeContainer]: activeItems.filter((id) => id !== String(active.id)),
        [overContainer]: [
          ...overItems.slice(0, newIndex),
          activeItems[activeIndex],
          ...overItems.slice(newIndex, overItems.length),
        ],
      }
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    if (dragDisabled) {
      setActiveId(null)
      return
    }
    const { active, over } = event
    setActiveId(null)

    if (!over) {
      void persist(columnItemsRef.current)
      return
    }

    const activeIdStr = String(active.id)
    const overIdStr = String(over.id)
    const items = columnItemsRef.current

    const activeContainer = findContainer(activeIdStr, items)
    const overContainer = findContainer(overIdStr, items) ?? (overIdStr in items ? overIdStr : undefined)

    if (!activeContainer || !overContainer) {
      void persist(items)
      return
    }

    if (activeContainer === overContainer && activeIdStr !== overIdStr) {
      const list = items[activeContainer]
      const oldIndex = list.indexOf(activeIdStr)
      const newIndex = list.indexOf(overIdStr)
      if (oldIndex !== newIndex && oldIndex >= 0 && newIndex >= 0) {
        const next = { ...items, [activeContainer]: arrayMove(list, oldIndex, newIndex) }
        setColumnItems(next)
        columnItemsRef.current = next
        void persist(next)
        return
      }
    }

    void persist(columnItemsRef.current)
  }

  const activeTask = activeId ? tasksById.get(activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex min-h-[58vh] gap-4 overflow-x-auto pb-2">
        {columns.map((col) => (
          <KanbanColumn
            key={col.id}
            column={col}
            taskIds={columnItems[col.id] || []}
            tasksById={tasksById}
            labels={labels}
            userMap={userMap}
            dragDisabled={dragDisabled}
            onOpenTask={onOpenTask}
            isAdmin={isAdmin}
            onRenameColumn={onRenameColumn}
            onMoveColumn={onMoveColumn}
            onRemoveColumn={onRemoveColumn}
            onAddTask={onAddTask}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {activeTask ? (
          <div className="w-[272px] cursor-grabbing rounded-lg border-2 border-sky-500 bg-white p-3 shadow-2xl ring-2 ring-sky-400/30 dark:bg-slate-800">
            <div className="font-semibold text-slate-900 dark:text-slate-100">{activeTask.title}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function KanbanColumn({
  column,
  taskIds,
  tasksById,
  labels,
  userMap,
  dragDisabled,
  onOpenTask,
  isAdmin,
  onRenameColumn,
  onMoveColumn,
  onRemoveColumn,
  onAddTask,
}: {
  column: Column
  taskIds: string[]
  tasksById: Map<string, Task>
  labels: Label[]
  userMap: Record<string, User>
  dragDisabled: boolean
  onOpenTask: (t: Task) => void
  isAdmin: boolean
  onRenameColumn: (col: Column) => void
  onMoveColumn: (colId: string, delta: number) => void
  onRemoveColumn: (col: Column) => void
  onAddTask: (columnId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: 'column', columnId: column.id },
  })

  return (
    <div className="flex w-[288px] shrink-0 flex-col rounded-xl border border-cyan-500/15 bg-white/70 shadow-lg shadow-slate-900/5 backdrop-blur-md dark:border-cyan-500/20 dark:bg-slate-900/70 dark:shadow-black/20">
      <div className="flex items-center justify-between gap-1 border-b border-slate-200/80 px-2 py-2 dark:border-slate-700">
        {isAdmin ? (
          <button
            type="button"
            className="min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-left text-sm font-bold text-slate-800 hover:bg-white/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
            onClick={() => onRenameColumn(column)}
          >
            {column.name}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate px-1.5 py-1 text-sm font-bold text-slate-800 dark:text-slate-100">{column.name}</span>
        )}
        {isAdmin ? (
          <div className="flex shrink-0 gap-0.5">
            <button
              type="button"
              className="rounded p-1 text-slate-500 hover:bg-white/80 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              aria-label="Move left"
              onClick={() => onMoveColumn(column.id, -1)}
            >
              ←
            </button>
            <button
              type="button"
              className="rounded p-1 text-slate-500 hover:bg-white/80 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              aria-label="Move right"
              onClick={() => onMoveColumn(column.id, 1)}
            >
              →
            </button>
            <button
              type="button"
              className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
              aria-label="Delete column"
              onClick={() => onRemoveColumn(column)}
            >
              ✕
            </button>
          </div>
        ) : null}
      </div>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy} disabled={dragDisabled}>
        <div
          ref={setNodeRef}
          className={`min-h-[120px] flex-1 rounded-b-xl p-2 transition-colors ${
            isOver ? 'bg-sky-50/80 ring-1 ring-inset ring-sky-300/60 dark:bg-sky-950/40 dark:ring-sky-700/50' : ''
          }`}
        >
          {taskIds.length === 0 && !dragDisabled ? (
            <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">Drop tasks here</p>
          ) : null}
          {taskIds.map((id) => {
            const task = tasksById.get(id)
            if (!task) return null
            return (
              <SortableTaskCard
                key={id}
                task={task}
                labels={labels}
                userMap={userMap}
                disabled={dragDisabled}
                onOpen={() => onOpenTask(task)}
              />
            )
          })}
        </div>
      </SortableContext>

      <button
        type="button"
        className="mx-2 mb-2 rounded-lg py-2 text-sm font-medium text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-700/80"
        onClick={() => onAddTask(column.id)}
      >
        + Add task
      </button>
    </div>
  )
}
