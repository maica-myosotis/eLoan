import { useState } from 'react';

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

/**
 * Drop-in replacement for <input type="password"> with a show/hide toggle.
 * Accepts all standard input props plus an optional `wrapperStyle` for the
 * outer container (useful when the input needs flex: 1 in a flex parent).
 */
export default function PasswordInput({ style, className, wrapperStyle, ...props }) {
  const [show, setShow] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'block', ...wrapperStyle }}>
      <input
        {...props}
        type={show ? 'text' : 'password'}
        className={className}
        style={{ paddingRight: '2.5rem', boxSizing: 'border-box', ...style }}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute',
          right: '0.625rem',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.25rem',
          color: '#9ca3af',
          display: 'flex',
          alignItems: 'center',
          lineHeight: 1,
        }}
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
