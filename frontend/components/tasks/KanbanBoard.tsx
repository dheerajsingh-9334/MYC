import React, { useMemo, useState } from 'react';
import { isPast, isToday, differenceInDays, format } from 'date-fns';
import { Clock, TriangleAlert, CircleCheck, Play, Pause, AlertCircle, Pin, Eye, Edit2, Trash2, Search } from 'lucide-react';


const STATUS_LABELS: Record<string, string> = {
  pending: 'To Do',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  extension_requested: 'Extension',
  complete: 'Done',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending: { bg: 'var(--pending-bg)', color: 'var(--pending)' },
  in_progress: { bg: '#FCE7F3', color: '#EC4899' },
  blocked: { bg: 'var(--blocked-bg)', color: 'var(--blocked)' },
  extension_requested: { bg: 'var(--amber-bg)', color: 'var(--amber)' },
  complete: { bg: 'var(--green-bg)', color: 'var(--green)' },
  rejected: { bg: 'var(--rejected-bg)', color: 'var(--rejected)' },
  cancelled: { bg: 'var(--red-bg)', color: 'var(--red)' },
};

export default function KanbanBoard({
  tasks,
  isAdmin,
  isLeader,
  onStatusChange,
  onStartTimer,
  onStopTimer,
  onUpdateTask,
  onDeleteTask,
  onPinToggle,
  onAlertToggle,
  onReorder,
}: any) {
  // Track per-column search filters
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [openFilters, setOpenFilters] = useState<Record<string, boolean>>({});
  const [localTasks, setLocalTasks] = useState(tasks);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [draggedHeight, setDraggedHeight] = useState<number>(64);

  React.useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const activeStatuses = isAdmin
    ? ['pending', 'in_progress', 'blocked', 'complete', 'rejected', 'cancelled']
    : ['pending', 'in_progress', 'extension_requested', 'complete', 'rejected', 'cancelled'];

  // Group and sort tasks by status (most recent first)
  const groupedTasks = useMemo(() => {
    const groups: Record<string, any[]> = {};
    activeStatuses.forEach(s => groups[s] = []);

    // Sort by position ascending, fallback to createdAt descending
    const sorted = [...localTasks].sort((a: any, b: any) => {
      const posA = a.position ?? 0;
      const posB = b.position ?? 0;
      if (posA !== posB) return posA - posB;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    sorted.forEach((t: any) => {
      if (groups[t.status]) {
        groups[t.status].push(t);
      }
    });
    return groups;
  }, [localTasks]);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    setDraggedTaskId(taskId);
    setDraggedHeight((e.currentTarget as HTMLElement).offsetHeight);
    // Needed for Firefox
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    setDragOverTaskId(null);
    setDraggedTaskId(null);
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;

    const draggedTask = localTasks.find((t: any) => t.id === taskId);
    if (!draggedTask) return;

    const updatedTask = { ...draggedTask, status };
    const colTasks = groupedTasks[status] ? [...groupedTasks[status]] : [];

    // Remove dragged task from colTasks if it was already there
    const existingIndex = colTasks.findIndex(t => t.id === taskId);
    if (existingIndex > -1) colTasks.splice(existingIndex, 1);

    // Find where to insert in colTasks
    let insertIndex = colTasks.length;
    if (dragOverTaskId && dragOverTaskId !== taskId) {
      insertIndex = colTasks.findIndex(t => t.id === dragOverTaskId);
      if (insertIndex === -1) insertIndex = colTasks.length;
    }

    colTasks.splice(insertIndex, 0, updatedTask);

    // Now update positions for this column
    const idToPosition = new Map();
    colTasks.forEach((t, i) => idToPosition.set(t.id, i));

    // Update localTasks
    const newLocal = localTasks.map((t: any) => {
      if (t.id === taskId) {
        return { ...updatedTask, position: idToPosition.get(taskId) };
      }
      if (t.status === status && idToPosition.has(t.id)) {
        return { ...t, position: idToPosition.get(t.id) };
      }
      return t;
    });

    setLocalTasks(newLocal);

    if (draggedTask.status !== status) {
      onStatusChange(taskId, status);
    }

    // Trigger reorder API
    if (colTasks.length > 0 && typeof onReorder === 'function') {
      const reorderIds = colTasks.map(t => t.id);
      onReorder(reorderIds);
    }
  };

  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    const isOverTaskInThisCol = localTasks.some((t: any) => t.id === dragOverTaskId && t.status === status);
    if (dragOverTaskId !== status && !isOverTaskInThisCol) {
      setDragOverTaskId(status);
    }
  };

  const renderColumn = (status: string) => {
    const allColTasks = groupedTasks[status] || [];
    const filterTerm = (colFilters[status] || '').toLowerCase();
    const colTasks = allColTasks.filter((t: any) => !filterTerm || t.title.toLowerCase().includes(filterTerm) || t.client?.brandName?.toLowerCase().includes(filterTerm) || t.client?.fullName?.toLowerCase().includes(filterTerm));

    if (allColTasks.length === 0 && (status === 'rejected' || status === 'cancelled')) return null;

    return (
      <div
        key={status}
        onDrop={(e) => handleDrop(e, status)}
        onDragOver={(e) => handleDragOver(e, status)}
        style={{
          flex: '1 1 0',
          minWidth: 220,
          background: STATUS_STYLE[status]?.bg || 'var(--surface-2)',
          borderRadius: 'var(--radius)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          border: '1px solid var(--border)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        {/* Banner Header */}
        <div style={{
          padding: '14px 16px 10px',
          background: STATUS_STYLE[status]?.bg || 'var(--surface)',
          borderBottom: !openFilters[status] ? `2px solid ${STATUS_STYLE[status]?.color || 'var(--border)'}` : 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: STATUS_STYLE[status]?.color || 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {STATUS_LABELS[status]}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={(e) => { e.stopPropagation(); setOpenFilters(prev => ({ ...prev, [status]: !prev[status] })) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: STATUS_STYLE[status]?.color || 'var(--muted)', opacity: 0.8, padding: 0, display: 'flex', alignItems: 'center' }}
            >
              <Search size={14} />
            </button>
            <div style={{
              fontSize: 11,
              color: '#fff',
              background: STATUS_STYLE[status]?.color || 'var(--muted)',
              padding: '3px 10px',
              borderRadius: 99,
              fontWeight: 800,
              boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
            }}>
              {allColTasks.length} {allColTasks.length === 1 ? 'Issue' : 'Issues'}
            </div>
          </div>
        </div>

        {/* Column Filter */}
        {openFilters[status] && (
          <div style={{ padding: '0 16px 12px', background: STATUS_STYLE[status]?.bg || 'var(--surface)', borderBottom: `2px solid ${STATUS_STYLE[status]?.color || 'var(--border)'}` }}>
            <input
              type="text"
              autoFocus
              placeholder={`Filter ${STATUS_LABELS[status]}...`}
              value={colFilters[status] || ''}
              onChange={(e) => setColFilters(prev => ({ ...prev, [status]: e.target.value }))}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                fontSize: 11.5,
                outline: 'none',
                boxSizing: 'border-box',
                background: 'var(--surface)'
              }}
            />
          </div>
        )}

        <div style={{ padding: 12, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }} className="custom-scrollbar">
          {colTasks.map(t => {
            const isDropTarget = dragOverTaskId === t.id && draggedTaskId !== t.id;
            return (
              <React.Fragment key={t.id}>
                <div style={{
                  height: isDropTarget ? draggedHeight : 0,
                  marginBottom: isDropTarget ? 12 : 0,
                  opacity: isDropTarget ? 1 : 0,
                  background: 'var(--surface-2)',
                  border: isDropTarget ? '2px dashed var(--border)' : 'none',
                  borderRadius: 8,
                  transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
                  pointerEvents: 'none'
                }} />
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, t.id)}
                  onDragEnd={() => { setDraggedTaskId(null); setDragOverTaskId(null); }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverTaskId(t.id); }}
                  onClick={() => onUpdateTask(t)}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderLeft: `4px solid ${STATUS_STYLE[status]?.color || 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    padding: 14,
                    marginBottom: 12,
                    cursor: 'grab',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                    position: 'relative',
                    transition: 'transform 0.1s, box-shadow 0.1s',
                    opacity: draggedTaskId === t.id ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.04)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.4 }}>{t.title}</div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {t.priority === 'high' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', marginTop: 4, boxShadow: '0 0 0 2px var(--red-bg)' }} title="High Priority" />}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
                    <span style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4, fontWeight: 600, color: 'var(--ink-2)' }}>{t.client?.brandName || t.client?.fullName}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>• {t.assignedTo?.fullName || 'Unassigned'}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 12 }}>
                    {/* Due Date Indicator */}
                    {(() => {
                      const done = t.status === 'complete';
                      const rej = t.status === 'rejected' || t.status === 'cancelled';
                      const overdue = !done && !rej && isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate));
                      const today = !done && !rej && isToday(new Date(t.dueDate));

                      return (
                        <div style={{ fontSize: 11, color: done ? 'var(--green)' : overdue ? 'var(--red)' : today ? 'var(--amber)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {!done && !rej && (overdue ? <TriangleAlert size={10} /> : today ? <Clock size={10} /> : null)}
                          {format(new Date(t.dueDate), 'd MMM')}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          <div style={{
            height: dragOverTaskId === status ? draggedHeight : 0,
            marginTop: 'auto',
            opacity: dragOverTaskId === status ? 1 : 0,
            background: 'var(--surface-2)',
            border: dragOverTaskId === status ? '2px dashed var(--border)' : 'none',
            borderRadius: 8,
            transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
            pointerEvents: 'none'
          }} />
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', gap: 16, overflowX: 'auto', padding: '4px 0', height: '100%' }} className="custom-scrollbar">
      {activeStatuses.map(renderColumn)}
    </div>
  );
}
