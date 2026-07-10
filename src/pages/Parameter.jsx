import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { EmptyState } from '../components/ui.jsx'
import ImportButton from '../components/ImportButton.jsx'

function SimpleMaster({ collection, title, icon, hint, importKind }) {
  const { db, upsert, remove, toast } = useStore()
  const [name, setName] = useState('')
  const items = db[collection] || []

  function add() {
    const v = name.trim()
    if (!v) return
    if (items.some((i) => i.name.toLowerCase() === v.toLowerCase())) {
      toast(`"${v}" already exists`, 'error')
      return
    }
    upsert(collection, { name: v }, { entityType: 'Parameter', label: title })
    toast(`${title} "${v}" added`)
    setName('')
  }

  function importRows(rows) {
    let imported = 0, skipped = 0
    for (const row of rows) {
      const v = String(row.name || '').trim()
      if (!v || items.some((i) => i.name.toLowerCase() === v.toLowerCase())) { skipped++; continue }
      upsert(collection, { name: v }, { entityType: 'Parameter', label: `${title} (import)` })
      imported++
    }
    return { imported, skipped }
  }

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 12 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>{icon} {title}</div>
        {importKind && <ImportButton kind={importKind} onRows={importRows} />}
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={hint} style={{ maxWidth: 240 }} />
        <button className="btn btn-primary btn-sm" disabled={!name.trim()} onClick={add}>＋ Add</button>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={icon} title={`No ${title.toLowerCase()} defined`} />
      ) : (
        <div className="row" style={{ gap: 8 }}>
          {items.map((i) => (
            <span key={i.id} className="badge badge-brand" style={{ fontSize: 13, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {i.name}
              <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 13, padding: 0 }}
                title="Delete"
                onClick={() => window.confirm(`Delete "${i.name}"?`) && remove(collection, i.id, { entityType: 'Parameter', label: title })}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Parameter() {
  return (
    <div>
      <h1 className="page-title">Parameter</h1>
      <p className="page-sub">System-wide reference lists used across the application.</p>
      <SimpleMaster collection="uoms" title="Units of Measure (UOM)" icon="📏" hint="e.g. CTN, PLT, PCS" importKind="uoms" />
      <SimpleMaster collection="currencies" title="Currencies" icon="💱" hint="e.g. USD, EUR" />
      <SimpleMaster collection="vehicleTypes" title="Vehicle Types" icon="🚚" hint="e.g. 20ft, 40ft" />
      <SimpleMaster collection="storageTypes" title="Storage Types" icon="🏬" hint="e.g. Normal Storage, Cold Storage, Bonded Storage" />
    </div>
  )
}
