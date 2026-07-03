'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, getUser } from '@/lib/api';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { 
  Briefcase, Users, UserCheck, 
  X, Download, Eye, Printer, Loader2,
  FileSpreadsheet
} from 'lucide-react';

interface ReportType {
  id: string;
  title: string;
  description: string;
  icon: any;
  adminOnly?: boolean;
}

const REPORT_TYPES: ReportType[] = [
  { id: 'project', title: 'Project Report', description: 'Milestone tracking, budgets, burndown, margins & risk analysis', icon: Briefcase },
  { id: 'team', title: 'Team Performance', description: 'Average turnarounds, ratings, commits & team highlights', icon: Users },
  { id: 'employee', title: 'Employee Report', description: 'Roles, workloads, leaves, scores & manager feedback', icon: UserCheck },
];

// ==========================================
// CUSTOM INTERACTIVE SVG CHART COMPONENTS
// ==========================================

function SVGDonutChart({ data, labels, colors }: { data: number[]; labels: string[]; colors: string[] }) {
  const total = data.reduce((sum, val) => sum + val, 0);
  if (total === 0) {
    return <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '10px 0' }}>No tasks assigned to display chart.</div>;
  }

  let accumulatedAngle = 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 12 }}>
      <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
        {data.map((value, idx) => {
          const percentage = value / total;
          const strokeLength = percentage * circumference;
          const strokeOffset = circumference - strokeLength + (accumulatedAngle / 360) * circumference;
          accumulatedAngle += percentage * 360;

          return (
            <circle
              key={idx}
              cx="50"
              cy="50"
              r={radius}
              fill="transparent"
              stroke={colors[idx]}
              strokeWidth="12"
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
              style={{ transition: 'stroke-dashoffset 0.3s ease' }}
            />
          );
        })}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {labels.map((label, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: colors[idx], display: 'inline-block' }} />
            <span style={{ color: 'var(--ink)' }}>
              {label}: <strong>{data[idx]}</strong> ({Math.round((data[idx] / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SVGBarChart({ budget, spent, profit }: { budget: number; spent: number; profit: number }) {
  const maxVal = Math.max(budget, spent, profit) || 1;
  const items = [
    { label: 'Total Budget', value: budget, color: '#2E5077' },
    { label: 'Resource Spent', value: spent, color: '#C84B31' },
    { label: 'Operating Margin', value: profit, color: '#5F6F52' }
  ];

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item, idx) => {
        const pct = (item.value / maxVal) * 100;
        return (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
              <span style={{ fontWeight: 500, color: 'var(--muted)' }}>{item.label}</span>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>${item.value}</span>
            </div>
            <div style={{ height: 10, background: 'var(--surface-2)', borderRadius: 5, overflow: 'hidden' }}>
              <div 
                style={{ 
                  height: '100%', 
                  width: `${pct}%`, 
                  background: item.color, 
                  borderRadius: 5, 
                  transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)' 
                }} 
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SVGLineChart({ labels, datasets }: { labels: string[]; datasets: { label: string; data: number[]; color: string; dashed?: boolean }[] }) {
  const allData = datasets.flatMap(d => d.data);
  const maxVal = Math.max(...allData) || 10;
  const width = 450;
  const height = 150;
  const paddingX = 40;
  const paddingY = 20;

  const pointsCount = labels.length;
  const stepX = (width - paddingX * 2) / (pointsCount - 1 || 1);

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        {/* Y Axis Gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
          const y = paddingY + (height - paddingY * 2) * (1 - ratio);
          const gridVal = Math.round(maxVal * ratio);
          return (
            <g key={idx}>
              <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 3" />
              <text x={paddingX - 8} y={y + 3} fontSize="9" textAnchor="end" fill="var(--soft)" fontFamily="Outfit">{gridVal}</text>
            </g>
          );
        })}

        {/* X Axis Labels */}
        {labels.map((label, idx) => {
          const x = paddingX + idx * stepX;
          return (
            <text key={idx} x={x} y={height - 2} fontSize="9.5" textAnchor="middle" fill="var(--soft)" fontFamily="Outfit">{label}</text>
          );
        })}

        {/* Lines & Area Fills */}
        {datasets.map((ds, dsIdx) => {
          const points = ds.data.map((val, idx) => {
            const x = paddingX + idx * stepX;
            const y = paddingY + (height - paddingY * 2) * (1 - val / maxVal);
            return `${x},${y}`;
          }).join(' ');

          const fillPoints = ds.dashed ? '' : `${paddingX},${height - paddingY} ` + points + ` ${paddingX + (pointsCount - 1) * stepX},${height - paddingY}`;

          return (
            <g key={dsIdx}>
              {!ds.dashed && fillPoints && (
                <polygon
                  fill={`${ds.color}15`}
                  points={fillPoints}
                  style={{ transition: 'all 0.3s ease' }}
                />
              )}
              <polyline
                fill="none"
                stroke={ds.color}
                strokeWidth="2"
                strokeDasharray={ds.dashed ? "3 3" : undefined}
                points={points}
                style={{ transition: 'all 0.3s ease' }}
              />
              {/* Dots */}
              {ds.data.map((val, idx) => {
                const x = paddingX + idx * stepX;
                const y = paddingY + (height - paddingY * 2) * (1 - val / maxVal);
                return (
                  <circle
                    key={idx}
                    cx={x}
                    cy={y}
                    r="3.5"
                    fill={ds.color}
                    stroke="var(--surface)"
                    strokeWidth="1"
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
        {datasets.map((ds, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ width: 12, height: 3, borderTop: `2px ${ds.dashed ? 'dashed' : 'solid'} ${ds.color}`, display: 'inline-block' }} />
            <span style={{ color: 'var(--muted)' }}>{ds.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Form parameters
  const [paramClientId, setParamClientId] = useState('');
  const [paramTeamName, setParamTeamName] = useState('');
  const [paramEmployeeId, setParamEmployeeId] = useState('');
  const [paramBudget, setParamBudget] = useState('');

  useEffect(() => {
    setMounted(true);
    setUser(getUser());
  }, []);

  // Fetch lists for parameter selection
  const { data: metadata = { clients: [], employees: [], teams: [] } } = useQuery({
    queryKey: ['reports-metadata'],
    queryFn: () => apiFetch('/api/reports/metadata'),
    enabled: mounted,
    retry: false
  });

  const handleOpenReport = (report: ReportType) => {
    setSelectedReport(report);
    setIsDrawerOpen(true);
    setPreviewData(null);
    // Reset parameters
    setParamClientId('');
    setParamTeamName('');
    setParamEmployeeId('');
    setParamBudget('');
  };

  const handlePreview = async () => {
    if (!selectedReport) return;
    setIsPreviewLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('type', selectedReport.id);
      if (paramClientId) params.set('clientId', paramClientId);
      if (paramTeamName) params.set('teamName', paramTeamName);
      if (paramEmployeeId) params.set('employeeId', paramEmployeeId);
      if (paramBudget) params.set('budget', paramBudget);

      const res = await apiFetch(`/api/reports/data?${params.toString()}`);
      setPreviewData(res);
    } catch (err: any) {
      console.error(err);
      alert('Error fetching report preview.');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleExport = (format: 'pdf' | 'csv') => {
    if (!selectedReport) return;
    const params = new URLSearchParams();
    params.set('type', selectedReport.id);
    params.set('format', format);
    if (paramClientId) params.set('clientId', paramClientId);
    if (paramTeamName) params.set('teamName', paramTeamName);
    if (paramEmployeeId) params.set('employeeId', paramEmployeeId);
    if (paramBudget) params.set('budget', paramBudget);

    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
    if (token) params.set('token', token);

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const url = `${baseUrl}/api/reports/data?${params.toString()}`;

    if (format === 'pdf') {
      window.open(url, '_blank');
    } else {
      // CSV Download
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedReport.id}_report_${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const isFormValid = () => {
    if (!selectedReport) return false;
    if (selectedReport.id === 'project' && !paramClientId) return false;
    if (selectedReport.id === 'team' && !paramTeamName) return false;
    if (selectedReport.id === 'employee' && !paramEmployeeId) return false;
    return true;
  };

  return (
    <AppLayout>
      <Topbar 
        title="Operations & Business Analytics" 
        subtitle="Generate data-driven client, team, and employee performance audits" 
      />
      
      <div style={{ padding: '24px 30px', flex: 1, display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto' }}>
        
        {/* Intro Banner */}
        <div style={{
          background: 'linear-gradient(135deg, var(--olive) 0%, var(--olive-light) 100%)',
          borderRadius: 'var(--radius)',
          padding: '24px 30px',
          color: '#ffffff',
          boxShadow: 'var(--shadow)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, fontFamily: 'Instrument Serif, serif', letterSpacing: '0.5px' }}>Business Intelligence Hub</h2>
          <p style={{ margin: 0, fontSize: 13.5, opacity: 0.9 }}>Select an operations report type below to configure parameter filters, preview real-time charts, and download print-ready dossiers.</p>
        </div>

        {/* Reports Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 20
        }}>
          {REPORT_TYPES.map((report) => {
            const Icon = report.icon;
            return (
              <div 
                key={report.id}
                onClick={() => handleOpenReport(report)}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: 20,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative'
                }}
                className="report-card"
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--olive)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: 'var(--olive-50)',
                  color: 'var(--olive)',
                  display: 'inline-flex',
                  justifyContent: 'center',
                  alignItems: 'center'
                }}>
                  <Icon size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{report.title}</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.4 }}>{report.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── DRAWER POPUP ── */}
        {isDrawerOpen && selectedReport && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20,25,12,0.4)',
            backdropFilter: 'blur(3px)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'flex-end'
          }} onClick={(e) => { if (e.target === e.currentTarget) setIsDrawerOpen(false); }}>
            
            <div style={{
              width: '100%',
              maxWidth: 620,
              background: 'var(--surface)',
              height: '100vh',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideIn 0.25s ease-out'
            }}>
              
              {/* Drawer Header */}
              <div style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0
              }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{selectedReport.title} Options</h2>
                  <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--muted)' }}>Configure filters to generate live reports.</p>
                </div>
                <button 
                  onClick={() => setIsDrawerOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 6 }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Drawer Body (Form & Preview) */}
              <div style={{
                padding: '20px 24px',
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 20
              }}>
                
                {/* Inputs configuration based on report type */}
                <div style={{
                  background: 'var(--surface-2)',
                  borderRadius: 10,
                  padding: 16,
                  display: 'grid',
                  gridTemplateColumns: '1fr',
                  gap: 12
                }}>
                  {selectedReport.id === 'project' && (
                    <>
                      <div>
                        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Select Project Pipeline</label>
                        <select 
                          value={paramClientId} 
                          onChange={e => setParamClientId(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }}
                        >
                          <option value="">-- Choose Active Client Progress --</option>
                          {metadata.clients.map((c: any) => (
                            <option key={c.id} value={c.id}>{c.brandName || c.fullName} Project</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Project Budget (Optional)</label>
                        <input 
                          type="number"
                          placeholder="e.g. 5000 (leave blank or 0 to hide margin details)"
                          value={paramBudget}
                          onChange={e => setParamBudget(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }}
                        />
                      </div>
                    </>
                  )}

                  {selectedReport.id === 'team' && (
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Select Team</label>
                      <select 
                        value={paramTeamName} 
                        onChange={e => setParamTeamName(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }}
                      >
                        <option value="">-- Choose Operational Team --</option>
                        {metadata.teams.map((t: string) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedReport.id === 'employee' && (
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Select Employee</label>
                      <select 
                        value={paramEmployeeId} 
                        onChange={e => setParamEmployeeId(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }}
                      >
                        <option value="">-- Choose Staff Member --</option>
                        {metadata.employees.map((e: any) => (
                          <option key={e.id} value={e.id}>{e.fullName} ({e.teamName || 'Ops'})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Submit / Action Row inside Config */}
                  <button
                    onClick={handlePreview}
                    disabled={!isFormValid()}
                    style={{
                      background: 'var(--olive)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '10px 16px',
                      fontSize: 13.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      marginTop: 8,
                      opacity: !isFormValid() ? 0.5 : 1,
                    }}
                  >
                    {isPreviewLoading ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
                    Generate Preview
                  </button>
                </div>

                {/* Live Preview Display */}
                {previewData && (
                  <div style={{
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: 20,
                    background: 'var(--surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 18
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid var(--border)', paddingBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--olive)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Dossier Preview</span>
                      <span style={{ fontSize: 11, color: 'var(--soft)' }}>Real-time Sync</span>
                    </div>

                    {/* RENDER PREVIEW DETAILS BASED ON SELECTED TYPE */}
                    {selectedReport.id === 'project' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Project Name</div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{previewData.projectName}</div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: previewData.budget > 0 ? '1fr 1fr' : '1fr', gap: 10 }}>
                          {previewData.budget > 0 && (
                            <div style={{ background: 'var(--surface-2)', padding: 10, borderRadius: 6 }}>
                              <div style={{ fontSize: 10, color: 'var(--muted)' }}>Spent vs Budget</div>
                              <div style={{ fontSize: 14, fontWeight: 700 }}>${previewData.spent} / ${previewData.budget}</div>
                            </div>
                          )}
                          <div style={{ background: 'var(--surface-2)', padding: 10, borderRadius: 6 }}>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Risk Profile</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: previewData.riskAnalysis === 'High' ? '#C84B31' : '#5F6F52' }}>{previewData.riskAnalysis}</div>
                          </div>
                        </div>

                        {/* Cost vs Budget Chart (Only if budget is provided) */}
                        {previewData.budget > 0 && (
                          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Project Costs & Margin</div>
                            <SVGBarChart budget={previewData.budget} spent={previewData.spent} profit={previewData.profit} />
                          </div>
                        )}

                        {/* Burndown Trend Line Chart */}
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Project Burndown Trend</div>
                          <SVGLineChart 
                            labels={previewData.charts.burndown.days} 
                            datasets={[
                              { label: 'Ideal Burndown', data: previewData.charts.burndown.ideal, color: '#A9B2A1', dashed: true },
                              { label: 'Actual Burndown', data: previewData.charts.burndown.actual, color: '#2E5077' }
                            ]}
                          />
                        </div>

                        {/* Custom Gantt/Milestones Preview */}
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>Milestones Timeline</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {previewData.milestones.map((m: any, idx: number) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 10.5, fontWeight: 700, width: 45 }}>Step {m.stepNumber}</span>
                                <div style={{ flex: 1, height: 18, background: 'var(--surface-2)', borderRadius: 4, position: 'relative', overflow: 'hidden', padding: '0 8px', display: 'flex', alignItems: 'center' }}>
                                  <div style={{
                                    position: 'absolute', left: 0, top: 0, bottom: 0,
                                    width: m.status === 'Completed' ? '100%' : m.status === 'Active' ? '60%' : '0%',
                                    background: m.status === 'Completed' ? 'rgba(95, 111, 82, 0.2)' : 'rgba(46, 80, 119, 0.15)',
                                  }} />
                                  <span style={{ fontSize: 11, position: 'relative', zIndex: 1, fontWeight: 500 }}>{m.name}</span>
                                </div>
                                <span style={{
                                  fontSize: 10, fontWeight: 700, color: m.status === 'Completed' ? '#5F6F52' : m.status === 'Active' ? '#2E5077' : 'var(--soft)'
                                }}>{m.status}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedReport.id === 'team' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Team</div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{previewData.teamName}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Overall Productivity</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--olive)' }}>{previewData.productivityScore}% Score</div>
                          </div>
                        </div>

                        {/* Weekly Team velocity line chart */}
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Weekly Team Completion Velocity</div>
                          <SVGLineChart 
                            labels={previewData.charts.trend.labels} 
                            datasets={[
                              { label: 'Tasks Completed', data: previewData.charts.trend.completion, color: '#2E5077' }
                            ]}
                          />
                        </div>

                        {/* Top / low performers */}
                        <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Team Highlights</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>⭐ <strong>Top Performer:</strong> {previewData.highlights.topPerformer}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>🔥 <strong>Most Active:</strong> {previewData.highlights.mostActive}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>⚠️ <strong>Needs Support:</strong> {previewData.highlights.lowestPerformer}</div>
                        </div>

                        {/* Member Breakdown List */}
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Member Metrics</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {previewData.memberBreakdown.map((m: any, idx: number) => (
                              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, background: 'var(--surface-2)', padding: '6px 10px', borderRadius: 4 }}>
                                <span style={{ fontWeight: 600 }}>{m.name}</span>
                                <span>{m.completed} Done &bull; {m.hours} hrs</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedReport.id === 'employee' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Employee</div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{previewData.name}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Performance score</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--olive)' }}>{previewData.performanceScore}/100</div>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                          <div style={{ background: 'var(--surface-2)', padding: 8, borderRadius: 6, textAlign: 'center' }}>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{previewData.tasks.completed}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Tasks Done</div>
                          </div>
                          <div style={{ background: 'var(--surface-2)', padding: 8, borderRadius: 6, textAlign: 'center' }}>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{previewData.hoursWorked}h</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Hours logged</div>
                          </div>
                          <div style={{ background: 'var(--surface-2)', padding: 8, borderRadius: 6, textAlign: 'center' }}>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{previewData.attendance}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Attendance</div>
                          </div>
                        </div>

                        {/* Task completion distribution donut chart */}
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Task Completion Distribution</div>
                          <SVGDonutChart 
                            data={previewData.charts.completion} 
                            labels={['Completed', 'Pending', 'Overdue']} 
                            colors={['#5F6F52', '#2E5077', '#C84B31']} 
                          />
                        </div>

                        <div style={{ background: 'var(--surface-2)', padding: 10, borderRadius: 6 }}>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Manager Audit Feedback</div>
                          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{previewData.managerFeedback} / 5.0 Rating</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Drawer Footer */}
              <div style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface-2)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 12,
                flexShrink: 0
              }}>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  style={{
                    padding: '8px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    background: 'var(--surface)',
                    cursor: 'pointer',
                    color: 'var(--ink-2)'
                  }}
                >
                  Close
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  disabled={!previewData}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    background: 'var(--surface)',
                    cursor: 'pointer',
                    color: 'var(--ink-2)',
                    opacity: !previewData ? 0.5 : 1,
                  }}
                >
                  <FileSpreadsheet size={14} /> Excel / CSV
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  disabled={!previewData}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    background: 'var(--olive)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    opacity: !previewData ? 0.5 : 1,
                  }}
                >
                  <Printer size={14} /> PDF / Print
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
      
      {/* Dynamic Keyframes Animation for sliding Drawer */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .report-card:hover {
          background-color: var(--surface) !important;
        }
      `}</style>
    </AppLayout>
  );
}
