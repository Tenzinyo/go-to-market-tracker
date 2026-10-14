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
import { tagColor } from '../lib/tagColors'

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
      {account.industry && (
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{account.industry}</div>
      )}
      <div className="kanban-card-meta">
        {account.entry_count} {account.entry_count === 1 ? 'activity' : 'activities'}
      </div>
      <CardTags tags={account.tags} />
    </div>
  )
}

function CardTags({ tags }) {
  let parsed
  try { parsed = JSON.parse(tags || '[]') } catch { parsed = [] }
  if (!parsed.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 6 }}>
      {parsed.map(t => {
        const c = tagColor(t)
        return (
          <span key={t} style={{
            background: c.bg, color: c.text,
            padding: '1px 6px', borderRadius: 99, fontSize: 10, fontWeight: 500,
          }}>{t}</span>
        )
      })}
    </div>
  )
}

function CardOverlay({ account }) {
  return (
    <div className="kanban-card" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.18)', transform: 'rotate(1.5deg)', cursor: 'grabbing' }}>
      <div className="kanban-card-name">{account.name}</div>
      <div className="kanban-card-meta">
        {account.entry_count} {account.entry_count === 1 ? 'activity' : 'activities'}
      </div>
      <CardTags tags={account.tags} />
    </div>
  )
}

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

// ── Page ──────────────────────────────────────────────────────────────────────

const REFRESH_EVENTS = new Set(['stage_change', 'account_created', 'account_updated', 'account_deleted', 'new_entry'])

export default function Pipeline() {
  const [pipelines,        setPipelines]        = useState([])
  const [allStages,        setAllStages]        = useState([])
  const [accounts,         setAccounts]         = useState([])
  const [activePipelineId, setActivePipelineId] = useState(null)
  const [activeId,         setActiveId]         = useState(null)
  const [loading,          setLoading]          = useState(true)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const load = useCallback(() => {
    Promise.all([
      api.get('/pipelines'),
      api.get('/stages'),
      api.get('/accounts?limit=500'),
    ])
      .then(([p, s, a]) => {
        setPipelines(p.pipelines)
        setAllStages(s.stages)
        setAccounts(a.accounts)
        // Default to the default pipeline (is_default=1) or first
        setActivePipelineId(prev => {
          if (prev) return prev
          const def = p.pipelines.find(pl => pl.is_default) ?? p.pipelines[0]
          return def?.id ?? null
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  useSSE(event => { if (REFRESH_EVENTS.has(event.type)) load() })

  // Stages for the active pipeline
  const stages = allStages.filter(s => s.pipeline_id === activePipelineId)

  // Accounts whose current stage belongs to the active pipeline
  const stageIds = new Set(stages.map(s => s.id))
  const pipelineAccounts = accounts.filter(a => a.current_stage_id && stageIds.has(a.current_stage_id))
  const unassigned = activePipelineId
    ? accounts.filter(a => !a.current_stage_id)
    : []

  const byStage = (stageId) => pipelineAccounts.filter(a => a.current_stage_id === stageId)
  const activeAccount = activeId != null ? accounts.find(a => a.id === activeId) : null

  async function handleDragEnd({ active, over }) {
    setActiveId(null)
    if (!over) return
    const accountId  = active.id
    const newStageId = over.id
    const account    = accounts.find(a => a.id === accountId)
    if (!account || account.current_stage_id === newStageId) return

    setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, current_stage_id: newStageId } : a))
    try {
      await api.post(`/accounts/${accountId}/stage`, { to_stage_id: newStageId })
    } catch {
      load()
    }
  }

  if (loading) return <div className="loading">Loading pipeline…</div>

  const activePipeline = pipelines.find(p => p.id === activePipelineId)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pipeline</h1>
          <p className="page-subtitle">
            {activePipeline?.description ?? 'Drag accounts between stages to update status'}
          </p>
        </div>
        <Link to="/log/new" className="btn btn-primary">+ Log Activity</Link>
      </div>

      {/* Pipeline tabs */}
      {pipelines.length > 1 && (
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 20, overflowX: 'auto' }}>
          {pipelines.map(p => (
            <button
              key={p.id}
              onClick={() => setActivePipelineId(p.id)}
              style={{
                background: 'none', border: 'none', padding: '10px 20px',
                cursor: 'pointer', fontSize: 13, fontWeight: activePipelineId === p.id ? 600 : 400,
                color: activePipelineId === p.id ? '#4f46e5' : '#6b7280',
                borderBottom: activePipelineId === p.id ? '2px solid #4f46e5' : '2px solid transparent',
                marginBottom: -1, whiteSpace: 'nowrap',
              }}
            >
              {p.name}
              <span style={{
                marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 99,
                background: activePipelineId === p.id ? '#ede9fe' : '#f3f4f6',
                color: activePipelineId === p.id ? '#6366f1' : '#9ca3af',
              }}>
                {p.stage_count}
              </span>
            </button>
          ))}
        </div>
      )}

      {stages.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: '60px 0' }}>
            <div className="empty-icon">⊞</div>
            <div className="empty-label">No stages in this pipeline — add some in Settings › Stages</div>
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={({ active }) => setActiveId(active.id)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="kanban-board">
            {unassigned.length > 0 && (
              <div className="kanban-column">
                <div className="kanban-col-header">
                  <span className="stage-tag" style={{ backgroundColor: '#e2e8f0', color: '#64748b' }}>
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
      )}
    </div>
  )
}
