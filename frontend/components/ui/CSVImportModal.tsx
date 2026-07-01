'use client';
import { useState, useRef } from 'react';
import { X, Upload, AlertCircle, CheckCircle, FileText } from 'lucide-react';

interface CSVImportModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  endpoint: string;
  title: string;
  templateLabel: string;
  templateColumns: string[];
}

export default function CSVImportModal({
  open,
  onClose,
  onSuccess,
  endpoint,
  title,
  templateLabel,
  templateColumns,
}: CSVImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: { row: number; reason: string }[] } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setResult(null);
      setErrorMsg('');
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setErrorMsg('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to upload CSV');
      }

      const data = await res.json();
      setResult(data);
      if (data.imported > 0) {
        onSuccess();
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An error occurred during upload.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.4)',
        backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 100, padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
        width: '100%', maxWidth: 520, boxShadow: 'var(--shadow-lg)',
        animation: 'modalIn 0.2s ease-out',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>{title}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Bulk upload data from a CSV file.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          
          {/* Template guidelines */}
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Expected CSV Columns for {templateLabel}:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {templateColumns.map(col => (
                <span key={col} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: 4, color: 'var(--ink-2)' }}>
                  {col}
                </span>
              ))}
            </div>
          </div>

          {/* File selector */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border)',
              borderRadius: 'var(--radius)',
              padding: '32px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              background: 'var(--surface-2)',
              transition: 'border-color 0.15s, background-color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--olive)';
              e.currentTarget.style.backgroundColor = 'var(--surface)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.backgroundColor = 'var(--surface-2)';
            }}
          >
            <input type="file" ref={fileInputRef} accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              {file ? (
                <>
                  <FileText size={32} style={{ color: 'var(--olive)' }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{(file.size / 1024).toFixed(1)} KB · Click to change</div>
                </>
              ) : (
                <>
                  <Upload size={32} style={{ color: 'var(--muted)' }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Click to select a CSV file</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Maximum file size: 5MB</div>
                </>
              )}
            </div>
          </div>

          {/* Result / feedback */}
          {errorMsg && (
            <div style={{ display: 'flex', gap: 8, background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginTop: 16 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{errorMsg}</div>
            </div>
          )}

          {result && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {result.imported > 0 && (
                <div style={{ display: 'flex', gap: 8, background: 'var(--olive-50)', color: 'var(--olive)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500 }}>
                  <CheckCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>Successfully imported {result.imported} rows!</div>
                </div>
              )}
              {result.errors.length > 0 && (
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--red)', marginBottom: 6 }}>
                    Import Issues ({result.errors.length} failed rows):
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', maxHeight: 150, overflowY: 'auto' }}>
                    {result.errors.map((err, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8, padding: '8px 12px', borderBottom: idx < result.errors.length - 1 ? '1px solid var(--border)' : 'none', background: 'var(--surface-2)', fontSize: 12 }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: 'var(--muted)' }}>Row {err.row}</span>
                        <span style={{ color: 'var(--ink)' }}>{err.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 12px 12px' }}>
          <button onClick={onClose} style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>
            Close
          </button>
          <button
            onClick={handleUpload}
            disabled={isUploading || !file}
            style={{
              padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600,
              background: isUploading || !file ? 'var(--soft)' : 'var(--olive)', color: '#fff',
              cursor: isUploading || !file ? 'not-allowed' : 'pointer',
              opacity: isUploading || !file ? 0.6 : 1,
            }}
          >
            {isUploading ? 'Uploading…' : 'Upload & Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
