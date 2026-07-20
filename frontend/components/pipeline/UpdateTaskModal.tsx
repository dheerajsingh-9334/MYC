'use client';
import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { X } from 'lucide-react';
import { LoadingSpinner, BtnSpinner } from '@/components/ui/LoadingSpinner';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  task: any;
  users: any[];
}

type UpdateTaskData = {
  title: string;
  description: string;
  priority: string;
  dueDate: string;
  teamName: string;
  assignedToId: string;
  status: string;
};

export default function UpdateTaskModal({ open, onClose, onSuccess, task, users }: Props) {
  const [form, setForm] = useState<UpdateTaskData>({
    title: '',
    description: '',
    priority: 'normal',
    dueDate: '',
    teamName: '',
    assignedToId: '',
    status: 'pending',
  });

  const [error, setError] = useState('');

  useEffect(() => {
    if (task && open) {
      setForm({
        title: task.title || '',
        description: task.description || '',
        priority: task.priority || 'normal',
        dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
        teamName: task.step?.owningTeamName || task.assignedTo?.teamName || '',
        assignedToId: task.assignedToId || task.assignedTo?.id || '',
        status: task.status || 'pending',
      });
    }
  }, [task, open]);

  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) => {
      if (u.teamName && u.isActive !== false) set.add(u.teamName);
    });
    return Array.from(set).sort();
  }, [users]);

  const assignees = useMemo(() => {
    if (!form.teamName) return users;
    return users.filter((u) => u.teamName === form.teamName && u.isActive !== false);
  }, [users, form.teamName]);

  const mutation = useMutation({
    mutationFn: async (data: UpdateTaskData) => {
      return await apiFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: data.title,
          description: data.description || null,
          priority: data.priority,
          dueDate: new Date(data.dueDate).toISOString(),
          assignedToId: data.assignedToId,
          status: data.status,
        }),
      });
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to update task');
    },
  });

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)',
        backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 100, padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
        width: '100%', maxWidth: 500, boxShadow: 'var(--shadow-lg)',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'modalIn 0.2s ease-out',
        position: 'relative',
      }}>
        {/* Loading overlay */}
        {mutation.isPending && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 10, borderRadius: 'var(--radius-lg)',
          }}>
            <LoadingSpinner size={36} color="var(--olive)" label="Updating task..." />
          </div>
        )}
        {/* Modal header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Update Task</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Modify details for task "{task?.title}".</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Modal body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Task Title *</label>
            <input
              value={form.title}
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Write Facebook Ad Copy"
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Team *</label>
              <select
                value={form.teamName}
                onChange={(e) => setForm(f => ({ ...f, teamName: e.target.value, assignedToId: '' }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
              >
                <option value="">Select team...</option>
                {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Assignee *</label>
              <select
                value={form.assignedToId}
                onChange={(e) => setForm(f => ({ ...f, assignedToId: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
              >
                <option value="">Select assignee...</option>
                {assignees.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm(f => ({ ...f, priority: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Due Date *</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="complete">Complete</option>
              <option value="blocked">Blocked</option>
              <option value="extension_requested">Extension Requested</option>
              <option value="cancelled">Cancelled</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Briefly outline requirements..."
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', resize: 'vertical', minHeight: 60, fontFamily: 'inherit' }}
            />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>
            Cancel
          </button>
          <button
            onClick={() => { setError(''); mutation.mutate(form); }}
            disabled={mutation.isPending || !form.title.trim() || !form.dueDate || !form.assignedToId}
            style={{ padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: 'var(--olive)', color: '#fff', cursor: 'pointer', opacity: (mutation.isPending || !form.title.trim() || !form.dueDate || !form.assignedToId) ? 0.6 : 1 }}
          >
            {mutation.isPending ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><BtnSpinner /> Updating...</span>
            ) : 'Update Task'}
          </button>
        </div>
      </div>
    </div>
  );
}
