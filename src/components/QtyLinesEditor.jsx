import React from 'react'
import { Field, Select } from './ui.jsx'
import { num } from '../utils.js'

/** True when every line has qty > 0 and a UOM, with no UOM used twice. */
export function validQtyLines(lines) {
  if (!lines.length) return false
  if (!lines.every((l) => num(l.qty) > 0 && l.uom)) return false
  return new Set(lines.map((l) => l.uom)).size === lines.length
}

export function qtyLinesTotal(lines) {
  return lines.reduce((s, l) => s + num(l.qty), 0)
}

/**
 * Dynamic qty+UOM line list — one line per UOM, add/remove, running total.
 * Used for chargeable quantities (normal activities) and package details
 * (offloading/loading), where one job may span several UOMs at once.
 */
export default function QtyLinesEditor({ lines, onChange, uoms, qtyLabel = 'Quantity', uomLabel = 'UOM', totalLabel = 'Total quantity', required = true }) {
  const setLine = (idx, key, value) => onChange(lines.map((l, i) => (i === idx ? { ...l, [key]: value } : l)))
  const total = qtyLinesTotal(lines)

  return (
    <>
      {lines.map((line, idx) => (
        <div key={idx} className="row" style={{ marginBottom: 10, alignItems: 'flex-end' }}>
          <Field label={idx === 0 ? qtyLabel : ''} required={idx === 0 && required}>
            <input
              type="number" min="0" step="0.01" style={{ width: 140 }}
              value={line.qty}
              onChange={(e) => setLine(idx, 'qty', e.target.value)}
            />
          </Field>
          <Field label={idx === 0 ? uomLabel : ''} required={idx === 0 && required}>
            <Select
              value={line.uom}
              onChange={(v) => setLine(idx, 'uom', v)}
              options={uoms.filter((n) => n === line.uom || !lines.some((l) => l.uom === n))}
              placeholder="Select UOM…"
              style={{ width: 150 }}
            />
          </Field>
          {lines.length > 1 && (
            <div style={{ paddingBottom: 12 }}>
              <button className="btn btn-sm btn-danger" onClick={() => onChange(lines.filter((_, i) => i !== idx))} title="Remove this UOM line">✕</button>
            </div>
          )}
        </div>
      ))}
      <div className="spread" style={{ marginBottom: 4 }}>
        <button
          className="btn btn-sm btn-outline"
          onClick={() => onChange([...lines, { qty: '', uom: '' }])}
          disabled={lines.length >= uoms.length}
        >
          ＋ Add UOM line
        </button>
        {lines.length > 1 && (
          <span style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
            {totalLabel}: <b>{total}</b> across {lines.length} UOM lines
          </span>
        )}
      </div>
    </>
  )
}
