import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import { api } from '../api'
import { useSSE } from '../hooks/useSSE'
import StageTag from '../components/StageTag'

// ── Draggable card ────────────────────────────────────────────────────────────

function KanbanCard({ account, isDraggingThis }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: account.id })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`kanban-card${isDraggingThis ? ' is-dragging' : ''}`}
    >
      <div className="kanban-card-name">
        <Link to={`/accounts/${account.id}`} onClick={e => e.stopPropagation()}>
          {account.name}
        </Link>
      </div>
      <div className="kanban-card-meta">
        {account.entry_count} {account.entry_count === 1 ? 'activity' : 'activities'}
      </div>
    </div>
  )
}

// ── Overlay (ghost while dragging) ────────────────────────────────────────────

function CardOverlay({ account }) {
  return (
    <div
      className="kanban-card"
      style={{
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        transform: 'rotate(1.5deg)',
        cursor: 'grabbing',
      }}
    >
      <div className="kanban-card-name">{account.name}</div>
      <div className="kanban-card-meta">
        {account.entry_count} {account.entry_count === 1 ? 'activity' : 'activities'}
      </div>
    </div>
  )
}

// ── Droppable column ──────────────────────────────────────────────────────────

function KanbanColumn({ stage, accounts, activeId }) {
  const { isOver, setNodeRef } = useDroppable({ id: stage.id })

  return (
    <div ref={setNodeRef} className={`kanban-column${isOver ? ' is-over' : ''}`}>
      <div className="kanban-col-header">
        <StageTag name={stage.name} colorHex={stage.color_hex} textColorHex={stage.text_color_hex} />
        <span className="kanban-col-count">{accounts.length}</span>
      </div>
      <div className="kanban-col-cards">
        {accounts.map(a => (
          <KanbanCard key={a.id} account={a} isDraggingThis={activeId === a.id} />
        ))}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

const REFRESH_EVENTS = new Set(['stage_change', 'account_created', 'account_updated', 'account_deleted', 'new_entry'])

export default function Pipeline() {
  const [stages, setStages] = useState([])
  const [accounts, setAccounts] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(true)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const load = useCallback(() => {
    Promise.all([api.get('/stages'), api.get('/accounts?limit=500')])
      .then(([s, a]) => {
        setStages(s.stages)
        setAccounts(a.accounts)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  useSSE(event => { if (REFRESH_EVENTS.has(event.type)) load() })

  const byStage = (stageId) => accounts.filter(a => a.current_stage_id === stageId)
  const unassigned = accounts.filter(a => !a.current_stage_id)
  const activeAccount = activeId != null ? accounts.find(a => a.id === activeId) : null

  async function handleDragEnd({ active, over }) {
    setActiveId(null)
    if (!over) return
    const accountId = active.id
    const newStageId = over.id
    const account = accounts.find(a => a.id === accountId)
    if (!account || account.current_stage_id === newStageId) return

    // Optimistic update
    setAccounts(prev =>
      prev.map(a => a.id === accountId ? { ...a, current_stage_id: newStageId } : a)
    )

    try {
      await api.post(`/accounts/${accountId}/stage`, { to_stage_id: newStageId })
    } catch {
      load() // revert on failure
    }
  }

  if (loading) return <div className="loading">Loading pipeline…</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pipeline</h1>
          <p className="page-subtitle">Drag accounts between stages to update status</p>
        </div>
        <Link to="/log/new" className="btn btn-primary">+ Log Activity</Link>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="kanban-board">
          {/* Unassigned column */}
          {unassigned.length > 0 && (
            <div className="kanban-column">
              <div className="kanban-col-header">
                <span
                  className="stage-tag"
                  style={{ backgroundColor: '#e2e8f0', color: '#64748b' }}
                >
                  Unassigned
                </span>
                <span className="kanban-col-count">{unassigned.length}</span>
              </div>
              <div className="kanban-col-cards">
                {unassigned.map(a => (
                  <KanbanCard key={a.id} account={a} isDraggingThis={activeId === a.id} />
                ))}
              </div>
            </div>
          )}

          {/* Stage columns */}
          {stages.map(stage => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              accounts={byStage(stage.id)}
              activeId={activeId}
            />
          ))}
        </div>

        <DragOverlay>
          {activeAccount && <CardOverlay account={activeAccount} />}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
