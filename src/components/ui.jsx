import { useEffect } from 'react'

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={'modal' + (wide ? ' wide' : '')}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, required, children, hint }) {
  return (
    <div className="field">
      <label>
        {label} {required && <span className="req">*</span>}
      </label>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: 'var(--ink-400)' }}>{hint}</span>}
    </div>
  )
}

export function Select({ value, onChange, options, placeholder, ...rest }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map((o) =>
        typeof o === 'string' ? (
          <option key={o} value={o}>{o}</option>
        ) : (
          <option key={o.value} value={o.value}>{o.label}</option>
        ),
      )}
    </select>
  )
}

export function EmptyState({ icon = '📭', title, hint }) {
  return (
    <div className="empty">
      <div className="ico">{icon}</div>
      <div className="title">{title}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function StatusBadge({ status }) {
  const map = {
    assigned: ['ASSIGNED', 'badge-amber'],
    in_progress: ['IN PROGRESS', 'badge-green'],
    paused: ['PAUSED', 'badge-amber'],
    complete: ['COMPLETE', 'badge-blue'],
    Pending: ['ONGOING', 'badge-amber'],
    Done: ['COMPLETED', 'badge-green'],
    Inbound: ['INBOUND', 'badge-brand'],
    Outbound: ['OUTBOUND', 'badge-blue'],
    active: ['ACTIVE', 'badge-green'],
    inactive: ['INACTIVE', 'badge-red'],
    billed: ['BILLED', 'badge-green'],
    notbilled: ['NOT BILLED', 'badge-gray'],
    forwarded: ['FORWARDED', 'badge-amber'],
    finished: ['FINISHED', 'badge-green'],
  }
  const [label, cls] = map[status] || [String(status || '—').toUpperCase(), 'badge-gray']
  return <span className={'badge ' + cls}>{label}</span>
}

export function KPI({ label, value, sub, tone }) {
  return (
    <div className={'kpi' + (tone ? ' ' + tone : '')}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}
