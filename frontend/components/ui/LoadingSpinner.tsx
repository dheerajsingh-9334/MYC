'use client';

import React from 'react';

// Reusable spinner stylesheet (handles smooth linear rotation)
export function SpinnerStyle() {
  return (
    <style dangerouslySetInnerHTML={{ __html: `
      @keyframes spinner-rotate {
        to {
          transform: rotate(360deg);
        }
      }
      .animate-spinner-rotate {
        animation: spinner-rotate 0.85s linear infinite;
      }
    `}} />
  );
}

interface LoadingSpinnerProps {
  size?: number | string;
  color?: string;
  thickness?: number;
  label?: string;
  subLabel?: string;
  fullPage?: boolean;
  centered?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function LoadingSpinner({
  size = 20,
  color = 'currentColor',
  thickness = 2.5,
  label,
  subLabel,
  fullPage = false,
  centered = false,
  className = '',
  style
}: LoadingSpinnerProps) {
  const spinnerElement = (
    <div 
      style={{ 
        display: 'inline-flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        gap: 12,
        ...style 
      }}
      className={className}
    >
      <SpinnerStyle />
      <svg
        className="animate-spinner-rotate"
        style={{
          width: size,
          height: size,
          color,
          display: 'block',
        }}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          style={{ opacity: 0.2 }}
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth={thickness}
        />
        <path
          style={{ opacity: 0.85 }}
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {label && (
        <span style={{ fontSize: '13px', fontWeight: 600, color: fullPage ? '#fff' : 'var(--ink)' }}>
          {label}
        </span>
      )}
      {subLabel && (
        <span style={{ fontSize: '11px', color: fullPage ? 'rgba(255,255,255,0.6)' : 'var(--muted)' }}>
          {subLabel}
        </span>
      )}
    </div>
  );

  if (fullPage) {
    return (
      <div 
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(20, 25, 12, 0.55)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
        }}
      >
        {spinnerElement}
      </div>
    );
  }

  if (centered) {
    return (
      <div 
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          width: '100%',
        }}
      >
        {spinnerElement}
      </div>
    );
  }

  return spinnerElement;
}
