'use client';

import React from 'react';

// Common Pulse Style Injection
export function PulseStyle() {
  return (
    <style dangerouslySetInnerHTML={{ __html: `
      @keyframes skeleton-shimmer {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(100%);
        }
      }
      .skeleton-pulse {
        position: relative;
        overflow: hidden;
        background-color: var(--surface-2);
      }
      .skeleton-pulse::after {
        content: "";
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        transform: translateX(-100%);
        background-image: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0) 0%,
          rgba(255, 255, 255, 0.4) 35%,
          rgba(255, 255, 255, 0.6) 50%,
          rgba(255, 255, 255, 0.4) 65%,
          rgba(255, 255, 255, 0) 100%
        );
        animation: skeleton-shimmer 1.8s infinite ease-in-out;
      }
      .dark .skeleton-pulse::after {
        background-image: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0) 0%,
          rgba(255, 255, 255, 0.04) 35%,
          rgba(255, 255, 255, 0.08) 50%,
          rgba(255, 255, 255, 0.04) 65%,
          rgba(255, 255, 255, 0) 100%
        );
      }
    `}} />
  );
}

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = '16px', borderRadius = 'var(--radius-sm)', style }: SkeletonProps) {
  return (
    <div
      className="skeleton-pulse"
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  );
}

// 1. Dashboard Skeleton (For Admin and Staff dashboards)
export function DashboardSkeleton({ withHeader = false }: { withHeader?: boolean }) {
  return (
    <div style={{ padding: 'var(--page-pad)', display: 'flex', flexDirection: 'column', gap: 20, width: '100%', boxSizing: 'border-box' }}>
      <PulseStyle />
      {/* Topbar/Header Skeleton */}
      {withHeader && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 250 }}>
            <Skeleton height={28} width="80%" borderRadius={6} />
            <Skeleton height={14} width="60%" borderRadius={4} />
          </div>
          <Skeleton height={32} width={120} borderRadius="var(--radius-sm)" />
        </div>
      )}

      {/* KPI Stats Grid Skeleton (5 Cards) */}
      <div className="grid-responsive-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Skeleton height={16} width={16} borderRadius="50%" />
              <Skeleton height={14} width={100} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skeleton height={28} width={60} borderRadius={6} />
              <Skeleton height={12} width={110} />
            </div>
          </div>
        ))}
      </div>

      {/* Attention / Banner Section Skeleton */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '40%' }}>
            <Skeleton height={32} width={32} borderRadius={8} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '80%' }}>
              <Skeleton height={16} width="90%" />
              <Skeleton height={12} width="60%" />
            </div>
          </div>
          <Skeleton height={20} width={100} borderRadius={10} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton height={50} width="100%" borderRadius={8} />
          <Skeleton height={50} width="100%" borderRadius={8} />
        </div>
      </div>

      {/* Main Content Layout Skeleton (Two Columns) */}
      <div className="grid-responsive-2">
        {/* Left main pane */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Skeleton height={18} width={150} />
            <Skeleton height={28} width={180} borderRadius="var(--radius-sm)" />
          </div>
          <Skeleton height={320} width="100%" borderRadius={8} />
        </div>

        {/* Right side pane */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <Skeleton height={18} width={120} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Skeleton height={14} width="50%" />
                  <Skeleton height={12} width="20%" />
                </div>
                <Skeleton height={12} width="90%" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// 2. Table / List View Skeleton (For Clients, Tasks, Team, Vault, Workload pages)
interface TableSkeletonProps {
  columnsCount?: number;
  rowsCount?: number;
  hasBulkActions?: boolean;
  withHeader?: boolean;
}

export function TableSkeleton({ columnsCount = 7, rowsCount = 8, hasBulkActions = true, withHeader = false }: TableSkeletonProps) {
  return (
    <div style={{ padding: 'var(--page-pad)', display: 'flex', flexDirection: 'column', gap: 16, width: '100%', boxSizing: 'border-box' }}>
      <PulseStyle />
      {/* Header Skeleton */}
      {withHeader && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 250 }}>
            <Skeleton height={26} width="70%" />
            <Skeleton height={14} width="50%" />
          </div>
          <Skeleton height={32} width={140} borderRadius="var(--radius-sm)" />
        </div>
      )}

      {/* Toolbar Skeleton */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '8px 14px',
        }}
      >
        <div style={{ display: 'flex', gap: 8, width: '50%' }}>
          <Skeleton height={28} width={80} borderRadius={14} />
          <Skeleton height={28} width={80} borderRadius={14} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Skeleton height={28} width={150} borderRadius="var(--radius-sm)" />
          <Skeleton height={28} width={80} borderRadius="var(--radius-sm)" />
          <Skeleton height={28} width={100} borderRadius="var(--radius-sm)" />
        </div>
      </div>

      {/* Table Card Skeleton */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflowX: 'auto',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              {hasBulkActions && (
                <th style={{ padding: '12px 18px', width: '40px', textAlign: 'center', verticalAlign: 'middle' }}>
                  <Skeleton height={14} width={16} />
                </th>
              )}
              {Array.from({ length: columnsCount }).map((_, i) => {
                let w = `${100 / columnsCount}%`;
                if (i === 0) w = '25%';
                else if (i === columnsCount - 1) w = '8%';
                return (
                  <th key={i} style={{ padding: '12px 18px', textAlign: 'left', width: w, verticalAlign: 'middle' }}>
                    <Skeleton height={12} width="60%" />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <TableRowsSkeleton columnsCount={columnsCount} rowsCount={rowsCount} hasCheckbox={hasBulkActions} type={columnsCount === 7 ? 'clients' : 'default'} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Helper Table Rows only skeleton to insert into existing HTML tables
export function TableRowsSkeleton({ columnsCount = 7, rowsCount = 5, hasCheckbox = false, type = 'default' }: { columnsCount?: number; rowsCount?: number; hasCheckbox?: boolean; type?: 'clients' | 'default' }) {
  const isClientType = type === 'clients' || columnsCount === 7;
  
  return (
    <>
      <PulseStyle />
      {Array.from({ length: rowsCount }).map((_, r) => (
        <tr key={r} style={{ borderBottom: '1px solid var(--border)' }}>
          {hasCheckbox && (
            <td style={{ padding: '10px 18px', textAlign: 'center', verticalAlign: 'middle', width: '40px' }}>
              <Skeleton height={14} width={14} borderRadius={3} />
            </td>
          )}
          
          {isClientType ? (
            <>
              {/* Client Column */}
              <td style={{ padding: '10px 18px', verticalAlign: 'middle' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Skeleton height={32} width={32} borderRadius={8} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    <Skeleton height={14} width="70%" />
                    <Skeleton height={11} width="50%" />
                  </div>
                </div>
              </td>
              {/* Step Column */}
              <td style={{ padding: '10px 18px', verticalAlign: 'middle' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6 }}>
                  <Skeleton height={14} width={20} borderRadius={4} />
                  <Skeleton height={12} width={80} />
                </div>
              </td>
              {/* Team Column */}
              <td style={{ padding: '10px 18px', verticalAlign: 'middle' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border)' }} />
                  <Skeleton height={12} width={60} />
                </div>
              </td>
              {/* Status Column */}
              <td style={{ padding: '10px 18px', verticalAlign: 'middle' }}>
                <Skeleton height={20} width={80} borderRadius={5} />
              </td>
              {/* Days In Step Column */}
              <td style={{ padding: '10px 18px', verticalAlign: 'middle' }}>
                <Skeleton height={12} width={70} />
              </td>
              {/* Total Duration Column */}
              <td style={{ padding: '10px 18px', verticalAlign: 'middle' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Skeleton height={12} width={12} borderRadius="50%" />
                  <Skeleton height={12} width={80} />
                </div>
              </td>
              {/* Actions Column */}
              <td style={{ padding: '10px 18px', verticalAlign: 'middle', textAlign: 'right' }}>
                <Skeleton height={16} width={16} borderRadius={4} style={{ marginLeft: 'auto' }} />
              </td>
            </>
          ) : (
            Array.from({ length: columnsCount }).map((_, c) => {
              if (c === 0) {
                return (
                  <td key={c} style={{ padding: '12px 18px', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Skeleton height={28} width={28} borderRadius={6} />
                      <Skeleton height={14} width="70%" />
                    </div>
                  </td>
                );
              }
              if (c === columnsCount - 1) {
                return (
                  <td key={c} style={{ padding: '12px 18px', verticalAlign: 'middle', textAlign: 'right' }}>
                    <Skeleton height={16} width={16} borderRadius={4} style={{ marginLeft: 'auto' }} />
                  </td>
                );
              }
              return (
                <td key={c} style={{ padding: '12px 18px', verticalAlign: 'middle' }}>
                  <Skeleton height={13} width={c % 2 === 0 ? '75%' : '50%'} borderRadius={4} />
                </td>
              );
            })
          )}
        </tr>
      ))}
    </>
  );
}

// 3. Pipeline / Kanban View Skeleton (For Pipeline page)
export function PipelineSkeleton({ withHeader = false }: { withHeader?: boolean }) {
  return (
    <div style={{ padding: 'var(--page-pad)', display: 'flex', flexDirection: 'column', gap: 16, width: '100%', height: 'calc(100vh - 56px)', overflow: 'hidden', boxSizing: 'border-box' }}>
      <PulseStyle />
      {/* Header */}
      {withHeader && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 250 }}>
            <Skeleton height={26} width="60%" />
            <Skeleton height={14} width="50%" />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} height={32} width={100} borderRadius={16} />
        ))}
      </div>

      {/* Kanban Board Container Skeleton */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          flex: 1,
          overflowX: 'auto',
          paddingBottom: 16,
          alignItems: 'stretch',
        }}
      >
        {Array.from({ length: 4 }).map((_, colIdx) => (
          <div
            key={colIdx}
            style={{
              flex: '0 0 280px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {/* Column Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: '60%' }}>
                <Skeleton height={14} width={20} borderRadius={4} />
                <Skeleton height={14} width="80%" />
              </div>
              <Skeleton height={16} width={16} borderRadius="50%" />
            </div>

            {/* Column Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              {Array.from({ length: colIdx === 0 ? 3 : colIdx === 1 ? 2 : 1 }).map((_, cardIdx) => (
                <div
                  key={cardIdx}
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Skeleton height={14} width="70%" />
                    <Skeleton height={12} width="20%" />
                  </div>
                  <Skeleton height={10} width="40%" />
                  <Skeleton height={6} width="100%" borderRadius={3} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <Skeleton height={12} width="50%" />
                    <Skeleton height={14} width={14} borderRadius="50%" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 4. Form / Wizard Skeleton (For profile, settings, onboard, invite, onboarding, login pages)
export function FormSkeleton({ fieldsCount = 4 }) {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20, width: '100%', maxWidth: '640px', margin: '0 auto' }}>
      <PulseStyle />
      {/* Title */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        <Skeleton height={28} width="60%" />
        <Skeleton height={14} width="80%" />
      </div>

      {/* Form Fields Card */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {Array.from({ length: fieldsCount }).map((_, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton height={14} width={120} />
            <Skeleton height={38} width="100%" borderRadius="var(--radius-sm)" />
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
          <Skeleton height={36} width={90} borderRadius="var(--radius-sm)" />
          <Skeleton height={36} width={120} borderRadius="var(--radius-sm)" />
        </div>
      </div>
    </div>
  );
}

// 5. Client Detail Pane / Tab Skeleton (For client details sub-views)
export function ClientDetailSkeleton({ withHeader = false }: { withHeader?: boolean }) {
  return (
    <div style={{ padding: 'var(--page-pad)', display: 'flex', flexDirection: 'column', gap: 20, width: '100%', boxSizing: 'border-box' }}>
      <PulseStyle />
      {/* Back button and title */}
      {withHeader && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Skeleton height={24} width={60} />
          <Skeleton height={24} width={180} />
        </div>
      )}

      <div className="grid-responsive-2">
        {/* Profile Card Summary */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <Skeleton height={80} width={80} borderRadius="50%" />
          <Skeleton height={20} width={140} />
          <Skeleton height={14} width={100} />
          <div style={{ width: '100%', height: 1, background: 'var(--border)', margin: '8px 0' }} />
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Skeleton height={12} width="90%" />
            <Skeleton height={12} width="80%" />
            <Skeleton height={12} width="85%" />
          </div>
        </div>

        {/* Tab content and history */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 8 }}>
            <Skeleton height={32} width={100} borderRadius={6} />
            <Skeleton height={32} width={100} borderRadius={6} />
            <Skeleton height={32} width={100} borderRadius={6} />
          </div>

          {/* Details Card */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Skeleton height={18} width={150} />
            <Skeleton height={120} width="100%" borderRadius={8} />
            <Skeleton height={120} width="100%" borderRadius={8} />
          </div>
        </div>
      </div>
    </div>
  );
}

// 6. Generic List/Feed Skeleton (For Notifications, simple lists)
export function ListSkeleton({ count = 5 }) {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: '720px' }}>
      <PulseStyle />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Skeleton height={24} width={160} />
        <Skeleton height={14} width={80} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: 14,
              display: 'flex',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <Skeleton height={32} width={32} borderRadius="50%" />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skeleton height={14} width="85%" />
              <Skeleton height={12} width="40%" />
            </div>
            <Skeleton height={16} width={16} borderRadius={4} />
          </div>
        ))}
      </div>
    </div>
  );
}

// 7. Client Grid Card Skeleton
export function ClientCardSkeleton() {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        boxShadow: 'var(--shadow-sm)',
        height: '240px',
        boxSizing: 'border-box'
      }}
    >
      <PulseStyle />
      {/* Header: Avatar + Title/Status */}
      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Skeleton height={14} width={14} borderRadius={3} />
            <Skeleton height={16} width={16} borderRadius={4} />
          </div>
          <Skeleton height={36} width={36} borderRadius={8} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton height={14} width="75%" />
            <Skeleton height={11} width="50%" />
          </div>
        </div>
        <Skeleton height={20} width={70} borderRadius={999} />
      </div>

      {/* Step progress details box */}
      <div style={{ background: 'var(--surface-2)', padding: 10, borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Skeleton height={10} width={80} />
          <Skeleton height={10} width={45} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Skeleton height={16} width={18} borderRadius={4} />
          <Skeleton height={14} width="60%" />
        </div>
        <Skeleton height={6} width="100%" borderRadius={3} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Skeleton height={11} width={11} borderRadius="50%" />
          <Skeleton height={11} width={120} />
        </div>
      </div>

      {/* Bottom Details Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--border)' }} />
          <Skeleton height={11} width={80} />
        </div>
        <Skeleton height={11} width={70} />
      </div>
    </div>
  );
}

// 8. Reports Page Skeleton
export function ReportsPageSkeleton() {
  return (
    <div style={{ padding: '24px 30px', display: 'flex', flexDirection: 'column', gap: 24, width: '100%', boxSizing: 'border-box' }}>
      <PulseStyle />
      {/* Intro Banner */}
      <div style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '24px 30px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}>
        <Skeleton height={26} width="220px" />
        <Skeleton height={14} width="550px" />
      </div>

      {/* Reports Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 20
      }}>
        {Array.from({ length: 3 }).map((_, idx) => (
          <div 
            key={idx}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <Skeleton height={42} width={42} borderRadius={10} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skeleton height={16} width="140px" />
              <Skeleton height={12} width="85%" />
              <Skeleton height={12} width="60%" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
