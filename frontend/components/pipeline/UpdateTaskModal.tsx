'use client';
import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { X, Eye, Folder, Check, CircleCheck } from 'lucide-react';
import { LoadingSpinner, BtnSpinner } from '@/components/ui/LoadingSpinner';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  task: any;
  users: any[];
  isAdmin?: boolean;
}

type UpdateTaskData = {
  title: string;
  description: string;
  priority: string;
  dueDate: string;
  teamName: string;
  assignedToId: string;
  status: string;
  timeSpentSeconds: number;
  isTimerRunning: boolean;
};

export default function UpdateTaskModal({ open, onClose, onSuccess, task, users, isAdmin }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<UpdateTaskData>({
    title: '',
    description: '',
    priority: 'normal',
    dueDate: '',
    teamName: '',
    assignedToId: '',
    status: 'pending',
    timeSpentSeconds: 0,
    isTimerRunning: false,
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
        timeSpentSeconds: task.timeSpentSeconds || 0,
        isTimerRunning: task.isTimerRunning || false,
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
          timeSpentSeconds: data.timeSpentSeconds,
          isTimerRunning: data.isTimerRunning,
        }),
      });
    },
    onMutate: async (data: UpdateTaskData) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const previousTasks = qc.getQueryData(['tasks']);
      qc.setQueryData(['tasks'], (old: any) => {
        if (!old) return old;
        return old.map((t: any) => {
          if (t.id === task.id) {
            return {
              ...t,
              title: data.title,
              description: data.description,
              priority: data.priority,
              dueDate: data.dueDate,
              assignedToId: data.assignedToId,
              status: data.status,
              timeSpentSeconds: data.timeSpentSeconds,
              isTimerRunning: data.isTimerRunning,
            };
          }
          return t;
        });
      });
      return { previousTasks };
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err: any, variables, context: any) => {
      if (context?.previousTasks) qc.setQueryData(['tasks'], context.previousTasks);
      setError(err.message || 'Failed to update task');
    },
  });

  const approveExtensionMut = useMutation({
    mutationFn: async ({ approved }: { approved: boolean }) => {
      return await apiFetch(`/api/tasks/${task.id}/approve-extension`, {
        method: 'PATCH',
        body: JSON.stringify({ approved }),
      });
    },
    onMutate: async ({ approved }) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const previousTasks = qc.getQueryData(['tasks']);
      qc.setQueryData(['tasks'], (old: any) => {
        if (!old) return old;
        return old.map((t: any) => t.id === task.id ? { ...t, status: approved ? 'in_progress' : 'pending' } : t); // approximate UI state for feedback
      });
      return { previousTasks };
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err: any, variables, context: any) => {
      if (context?.previousTasks) qc.setQueryData(['tasks'], context.previousTasks);
      setError(err.message || 'Failed to process extension');
    }
  });

  const resolveMut = useMutation({
    mutationFn: async () => {
      return await apiFetch(`/api/tasks/${task.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'pending' }),
      });
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const previousTasks = qc.getQueryData(['tasks']);
      qc.setQueryData(['tasks'], (old: any) => {
        if (!old) return old;
        return old.map((t: any) => t.id === task.id ? { ...t, status: 'pending', blockerNote: null } : t);
      });
      return { previousTasks };
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err: any, variables, context: any) => {
      if (context?.previousTasks) qc.setQueryData(['tasks'], context.previousTasks);
      setError(err.message || 'Failed to resolve issue');
    }
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
            <div style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', fontSize: 22, color: 'var(--ink)' }}>Update Task</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Modify details for task "{task?.title}".</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Modal body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {task?.status === 'blocked' && task?.blockerNote && (
            <div style={{ marginBottom: 16, padding: 14, background: 'var(--blocked-bg, #F0E8FA)', borderRadius: 8, border: '1px solid #E9D5FF' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--blocked, #6B3FA0)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Raised Hand (Blocker)</span>
              </div>
              <p style={{ margin: '0 0 12px 0', fontSize: 13.5, color: 'var(--ink)' }}>{task.blockerNote}</p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => resolveMut.mutate()}
                  disabled={resolveMut.isPending}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: resolveMut.isPending ? 0.6 : 1 }}
                >
                  {resolveMut.isPending ? <BtnSpinner /> : <CircleCheck size={14} />} Resolve This
                </button>
              )}
            </div>
          )}

          {task?.status === 'extension_requested' && (
            <div style={{ marginBottom: 16, padding: 14, background: 'var(--amber-bg)', borderRadius: 8, border: '1px solid #FDE68A' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Extension Requested</span>
              </div>
              <p style={{ margin: '0 0 12px 0', fontSize: 13.5, color: 'var(--ink)' }}>
                <strong>Reason:</strong> {task.extensionReason || 'No reason provided'} <br />
                <strong>Requested Due Date:</strong> {task.extensionRequestedDate ? new Date(task.extensionRequestedDate).toLocaleDateString() : 'Unknown'}
              </p>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => approveExtensionMut.mutate({ approved: true })}
                    disabled={approveExtensionMut.isPending}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: approveExtensionMut.isPending ? 0.6 : 1 }}
                  >
                    {approveExtensionMut.isPending && approveExtensionMut.variables?.approved === true ? <BtnSpinner /> : <Check size={14} />} Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => approveExtensionMut.mutate({ approved: false })}
                    disabled={approveExtensionMut.isPending}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: approveExtensionMut.isPending ? 0.6 : 1 }}
                  >
                    {approveExtensionMut.isPending && approveExtensionMut.variables?.approved === false ? <BtnSpinner /> : <X size={14} />} Reject
                  </button>
                </div>
              )}
            </div>
          )}

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
              {(!isAdmin || form.status === 'extension_requested') && <option value="extension_requested">Extension Requested</option>}
              <option value="cancelled">Cancelled</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Time Spent (seconds)</label>
              <input
                type="number"
                value={form.timeSpentSeconds}
                onChange={(e) => setForm(f => ({ ...f, timeSpentSeconds: parseInt(e.target.value) || 0 }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Timer Running</label>
              <select
                value={form.isTimerRunning ? 'true' : 'false'}
                onChange={(e) => setForm(f => ({ ...f, isTimerRunning: e.target.value === 'true' }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
              >
                <option value="false">Stopped</option>
                <option value="true">Running</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Briefly outline requirements..."
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', resize: 'vertical', minHeight: 60, fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', }}
            />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', flexShrink: 0 }}>
          <div>
            {task?.client?.id && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <a href={`/clients/${task.client.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--olive)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                  <Eye size={14} /> View Client
                </a>
                <a href={`/clients/${task.client.id}?tab=vault`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--olive)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                  <Folder size={14} /> Vault
                </a>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
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
    </div>
  );
}
