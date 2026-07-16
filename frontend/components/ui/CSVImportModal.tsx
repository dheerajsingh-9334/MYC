'use client';
import { useState, useRef, useEffect } from 'react';
import { X, Upload, AlertCircle, CheckCircle, FileText, Eye } from 'lucide-react';

interface CSVImportModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  endpoint: string;
  title: string;
  templateLabel: string;
  templateColumns: string[];
}

// Pipeline mapping mirrors backend logic — used for client-side preview
const PIPELINE_STEPS = [
  { num: 1, name: 'Client Onboarding',   cols: ['Onboarding', 'WA Group', 'CRM Setup', 'Doc', 'doc'] },
  { num: 2, name: 'Strategy Call',        cols: ['Micro Niche', 'Offer', 'Challenge Outline', '1 to 1/ webinar/Event Outline'] },
  { num: 3, name: 'Brand Setup',          cols: ['Ad Account Access', 'Photos'] },
  { num: 4, name: 'Funnel Build',         cols: ['LP Content', 'LP Design'] },
  { num: 5, name: 'Ad Creative',          cols: ['Ad Creative Scripts', 'Ad Creatives', 'Ad Videos Scripts', 'Client Videos', 'AdAssist', 'adassist', 'Ad Assist'] },
  { num: 6, name: 'Automation Setup',     cols: ['WA Templates', 'Automation'] },
  { num: 7, name: 'Ad Launch',            cols: ['Ads Launch'] },
  { num: 8, name: 'Funnel Launch',        cols: ['Funnel Launched'] },
  { num: 9, name: 'WON',                  cols: ['WON'] },
];

function resolveStatus(col: string, raw: any): 'complete' | 'in_progress' | 'blocked' | 'pending' {
  const val = raw != null ? String(raw).trim() : '';
  if (!val || val === '-') return 'pending';
  if (col === 'Funnel Launched') return 'complete';
  if (col === 'WON') {
    const l = val.toLowerCase();
    return (l.startsWith('closed') || l === 'yes' || l === 'one to one' || l.includes('won')) ? 'complete' : 'pending';
  }
  const l = val.toLowerCase();
  if (l.includes('done') || l === 'amost done' || l.includes('complete') || l === 'yes') return 'complete';
  if (l === 'paused' || l.includes('pending') || l.includes('no show')) return 'blocked';
  if (l.startsWith('wip') || l.includes('in review') || l === 'review' || l === 'not started') return 'in_progress';
  return 'in_progress';
}

function getClientCurrentStep(row: any) {
  const rowKeys = Object.keys(row || {}).map(k => k.trim().toLowerCase());
  
  // Calculate active steps for this row
  const activeSteps = PIPELINE_STEPS.map(s => {
    const activeCols = s.cols.filter(c => rowKeys.includes(c.trim().toLowerCase()));
    return { ...s, cols: activeCols };
  }).filter(s => s.cols.length > 0);

  const getValueCaseInsensitive = (key: string, obj: any) => {
    const target = key.trim().toLowerCase();
    const found = Object.keys(obj || {}).find(k => k.trim().toLowerCase() === target);
    return found ? obj[found] : undefined;
  };

  for (const s of activeSteps) {
    const allDone = s.cols.every(c => resolveStatus(c, getValueCaseInsensitive(c, row)) === 'complete');
    if (!allDone) return s;
  }
  return PIPELINE_STEPS[PIPELINE_STEPS.length - 1]; // all complete → WON
}

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  complete:    { bg: '#dcfce7', color: '#16a34a', label: '✓' },
  in_progress: { bg: '#fef9c3', color: '#ca8a04', label: '~' },
  blocked:     { bg: '#fee2e2', color: '#dc2626', label: '!' },
  pending:     { bg: '#f1f5f9', color: '#94a3b8', label: '–' },
};

export default function CSVImportModal({ open, onClose, onSuccess, endpoint, title, templateLabel, templateColumns }: CSVImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ imported: number; errors: { row: number; reason: string }[] } | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [isCustomExcel, setIsCustomExcel] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setIsUploading(false);
      setElapsed(0);
      setResult(null);
      setProgress(null);
      setErrorMsg('');
      setPreviewRows([]);
      setTotalRows(0);
      setShowPreview(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [open]);

  if (!open) return null;

  const parseFileForPreview = async (f: File) => {
    try {
      const XLSX = await import('xlsx');
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws) as any[];
      const keys = Object.keys(rows[0] || {});
      const isCustom = keys.some(k => k.trim() === 'Clients Name' || k.trim() === 'Clients name');
      setIsCustomExcel(isCustom);
      setTotalRows(rows.length);
      setPreviewRows(rows.slice(0, 50)); // preview first 50
      setShowPreview(true);
    } catch {
      setPreviewRows([]);
      setTotalRows(0);
      setIsCustomExcel(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const f = e.target.files[0];
      setFile(f);
      setResult(null);
      setErrorMsg('');
      setShowPreview(false);
      await parseFileForPreview(f);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setElapsed(0);
    setErrorMsg('');
    setResult(null);
    setProgress(null);
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || `${window.location.protocol}//${window.location.hostname}:4000`;
      const token = localStorage.getItem('access_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const fullUrl = (endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`) + (isCustomExcel ? `?updateExisting=${updateExisting}` : '');
      const res = await fetch(fullUrl, { method: 'POST', headers, body: formData });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || 'Failed to upload file');
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === 'progress') {
              setProgress({ current: parsed.imported, total: parsed.total });
            } else if (parsed.type === 'result') {
              finalResult = parsed;
            }
          } catch (e) {
            console.error('Error parsing NDJSON line:', e);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer);
          if (parsed.type === 'progress') {
            setProgress({ current: parsed.imported, total: parsed.total });
          } else if (parsed.type === 'result') {
            finalResult = parsed;
          }
        } catch (e) {
          console.error('Error parsing remaining buffer:', e);
        }
      }

      if (finalResult) {
        setResult(finalResult);
        if (finalResult.imported > 0) onSuccess();
      } else {
        throw new Error('Import completed but no result received.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during upload.');
    } finally {
      setIsUploading(false);
      setElapsed(0);
      setProgress(null);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: showPreview && isCustomExcel ? 1100 : 540, boxShadow: 'var(--shadow-lg)', animation: 'modalIn 0.2s ease-out', maxHeight: '92vh', display: 'flex', flexDirection: 'column', transition: 'max-width 0.3s ease' }}>
        
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>{title.replace('CSV', 'CSV / Excel')}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Bulk upload clients from a CSV or Excel status sheet.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {result ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center', gap: 16, width: '100%', overflowY: 'auto' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--olive-50)', color: 'var(--olive)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <CheckCircle size={36} />
              </div>
              <h3 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 28, margin: 0, color: 'var(--ink)' }}>Import Completed!</h3>
              <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, maxWidth: 360 }}>
                Successfully imported and mapped <strong>{result.imported}</strong> clients into their respective custom pipelines.
              </p>

              {result.errors.length > 0 && (
                <div style={{ width: '100%', maxWidth: 480, textAlign: 'left', marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)', marginBottom: 6 }}>Issues encountered ({result.errors.length} rows skipped):</div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', maxHeight: 180, overflowY: 'auto' }}>
                    {result.errors.map((err, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 8, padding: '8px 12px', borderBottom: idx < result.errors.length - 1 ? '1px solid var(--border)' : 'none', background: 'var(--surface-2)', fontSize: 11.5 }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: 'var(--muted)' }}>Row {err.row}</span>
                        <span style={{ color: 'var(--ink)' }}>{err.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Left panel — upload controls */}
              <div style={{ padding: '20px 24px', overflowY: 'auto', flex: showPreview && isCustomExcel ? '0 0 320px' : '1', borderRight: showPreview && isCustomExcel ? '1px solid var(--border)' : 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
                
                {/* Format guide */}
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Format A — Standard CSV</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {templateColumns.map(col => (
                      <span key={col} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, background: 'var(--bg)', border: '1px solid var(--border)', padding: '2px 5px', borderRadius: 3, color: 'var(--ink-2)' }}>{col}</span>
                    ))}
                  </div>
                  {templateLabel === 'Clients' && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Format B — Pipeline Status Sheet (Excel)</div>
                      <div style={{ color: 'var(--muted)', marginBottom: 6 }}>Auto-maps column statuses to steps. Each row = 1 client. Columns: <span style={{ fontFamily: 'JetBrains Mono' }}>Clients Name, Onboarding, WA Group…WON</span></div>
                      <div style={{ color: 'var(--olive-dark)', fontWeight: 500 }}>💡 <span style={{ fontFamily: 'JetBrains Mono' }}>Done</span> = complete · <span style={{ fontFamily: 'JetBrains Mono' }}>WIP</span> = in_progress · empty = pending</div>
                    </div>
                  )}
                </div>

                {/* File selector */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{ border: '2px dashed var(--border)', borderRadius: 'var(--radius)', padding: '24px 16px', textAlign: 'center', cursor: 'pointer', background: 'var(--surface-2)', transition: 'border-color 0.15s, background-color 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--olive)'; e.currentTarget.style.backgroundColor = 'var(--surface)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.backgroundColor = 'var(--surface-2)'; }}
                >
                  <input type="file" ref={fileInputRef} accept=".csv,.xlsx,.xls" onChange={handleFileChange} style={{ display: 'none' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    {file ? (
                      <>
                        <FileText size={28} style={{ color: 'var(--olive)' }} />
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{file.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{(file.size / 1024).toFixed(1)} KB · Click to change</div>
                        {totalRows > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--olive)', fontWeight: 600 }}>
                            <Eye size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                            {totalRows} rows detected · {isCustomExcel ? 'Pipeline Status Sheet' : 'Standard CSV'}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <Upload size={28} style={{ color: 'var(--muted)' }} />
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Click to select a CSV or Excel file</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Max 5MB · .csv / .xlsx / .xls</div>
                      </>
                    )}
                  </div>
                </div>

                {file && isCustomExcel && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer', userSelect: 'none', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}>
                    <input
                      type="checkbox"
                      checked={updateExisting}
                      onChange={(e) => setUpdateExisting(e.target.checked)}
                      style={{ accentColor: 'var(--olive)', width: 14, height: 14, cursor: 'pointer' }}
                    />
                    <span>Update existing clients' tasks and details</span>
                  </label>
                )}

                {/* Progress bar */}
                {isUploading && progress && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>
                      <span>Importing clients...</span>
                      <span>{progress.current} / {progress.total} ({Math.round((progress.current / (progress.total || 1)) * 100)}%)</span>
                    </div>
                    <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${(progress.current / (progress.total || 1)) * 100}%`, height: '100%', background: 'var(--olive)', borderRadius: 3, transition: 'width 0.15s ease' }} />
                    </div>
                  </div>
                )}

                {/* Error message */}
                {errorMsg && (
                  <div style={{ display: 'flex', gap: 8, background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>{errorMsg}</div>
                  </div>
                )}
              </div>

              {/* Right panel — row-wise preview */}
              {showPreview && isCustomExcel && previewRows.length > 0 && (() => {
                const firstRow = previewRows[0] || {};
                const excelKeys = Object.keys(firstRow).map(k => k.trim().toLowerCase());
                const activePipelineSteps = PIPELINE_STEPS.map(s => {
                  const activeCols = s.cols.filter(c => excelKeys.includes(c.trim().toLowerCase()));
                  return { ...s, cols: activeCols };
                }).filter(s => s.cols.length > 0);
                
                const getValueCaseInsensitive = (key: string, obj: any) => {
                  const target = key.trim().toLowerCase();
                  const found = Object.keys(obj || {}).find(k => k.trim().toLowerCase() === target);
                  return found ? obj[found] : undefined;
                };

                return (
                  <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-2)', position: 'sticky', top: 0, zIndex: 2 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
                        Row-wise Mapping Preview
                        <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>{totalRows} rows · each column = a pipeline task</span>
                      </div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                        {Object.entries(STATUS_COLORS).map(([k, v]) => (
                          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: v.color }}>
                            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: v.bg, border: `1px solid ${v.color}` }} />
                            {k === 'complete' ? 'Done' : k === 'in_progress' ? 'In Progress' : k === 'blocked' ? 'Blocked' : 'Pending'}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ padding: '0 0 16px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 41, zIndex: 1 }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--ink)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap', minWidth: 140 }}>Client Name</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--olive)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>Current Step</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--ink-2)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>Status</th>
                            {activePipelineSteps.map(s => (
                              <th key={s.num} colSpan={s.cols.length} style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: 'var(--ink)', borderBottom: '2px solid var(--border)', borderLeft: '1px solid var(--border)', whiteSpace: 'nowrap', fontSize: 10.5 }}>
                                Step {s.num}<br /><span style={{ fontWeight: 400, color: 'var(--muted)' }}>{s.name}</span>
                              </th>
                            ))}
                          </tr>
                          <tr style={{ background: 'var(--bg)' }}>
                            <td colSpan={3} style={{ borderBottom: '1px solid var(--border)' }} />
                            {activePipelineSteps.flatMap(s => s.cols.map((col, ci) => (
                              <td key={col} style={{ padding: '4px 6px', fontSize: 10, color: 'var(--muted)', borderBottom: '1px solid var(--border)', borderLeft: ci === 0 ? '1px solid var(--border)' : undefined, whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace' }}>{col}</td>
                            )))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, ri) => {
                            const name = row['Clients Name'] || row['Clients name'] || '(blank)';
                            const currStep = getClientCurrentStep(row);
                            const allComplete = activePipelineSteps.every(s => s.cols.every(c => resolveStatus(c, getValueCaseInsensitive(c, row)) === 'complete'));
                            return (
                              <tr key={ri} style={{ background: ri % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                                <td style={{ padding: '7px 12px', fontWeight: 600, color: 'var(--ink)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{name}</td>
                                <td style={{ padding: '7px 12px', color: 'var(--olive)', fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                                  {allComplete ? '🏆 WON' : `Step ${currStep.num}: ${currStep.name}`}
                                </td>
                                <td style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                                  <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: allComplete ? '#dcfce7' : '#f0fdf4', color: allComplete ? '#16a34a' : 'var(--olive)', border: `1px solid ${allComplete ? '#86efac' : 'var(--border)'}` }}>
                                    {allComplete ? 'Completed' : 'Active'}
                                  </span>
                                </td>
                                {activePipelineSteps.flatMap(s => s.cols.map((col, ci) => {
                                  const rawVal = getValueCaseInsensitive(col, row);
                                  const st = resolveStatus(col, rawVal);
                                  const sc = STATUS_COLORS[st];
                                  return (
                                    <td key={col} title={`${col}: ${rawVal ?? '—'}`} style={{ padding: '5px 6px', textAlign: 'center', borderBottom: '1px solid var(--border)', borderLeft: ci === 0 ? '1px solid var(--border)' : undefined }}>
                                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 4, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700, cursor: 'default' }}>
                                        {sc.label}
                                      </span>
                                    </td>
                                  );
                                }))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', flexShrink: 0 }}>
          {isUploading ? (
            <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--olive)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
              {progress 
                ? `Importing row ${progress.current} of ${progress.total} (${Math.round((progress.current / (progress.total || 1)) * 100)}%)… ${elapsed}s`
                : `Uploading & Initializing… ${elapsed}s`
              }
            </div>
          ) : result ? (
            <div style={{ fontSize: 12, color: 'var(--olive)', fontWeight: 600 }}>Import complete</div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB · ${totalRows} rows` : 'No file selected'}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            {result ? (
              <button onClick={onClose} style={{ padding: '8px 18px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: 'var(--olive)', color: '#fff', cursor: 'pointer' }}>
                Done
              </button>
            ) : (
              <>
                <button onClick={onClose} disabled={isUploading} style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: isUploading ? 'not-allowed' : 'pointer', color: 'var(--ink-2)', opacity: isUploading ? 0.5 : 1 }}>
                  Close
                </button>
                <button onClick={handleUpload} disabled={isUploading || !file} style={{ padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: isUploading || !file ? 'var(--soft)' : 'var(--olive)', color: '#fff', cursor: isUploading || !file ? 'not-allowed' : 'pointer', opacity: isUploading || !file ? 0.6 : 1 }}>
                  {isUploading ? `Importing… (${elapsed}s)` : `Upload & Import${totalRows ? ` (${totalRows} rows)` : ''}`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
