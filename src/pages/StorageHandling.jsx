import React, { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Field, Select, StatusBadge, EmptyState } from '../components/ui.jsx'
import ImportButton from '../components/ImportButton.jsx'
import { fmtDate, fmtNum, num, todayISO } from '../utils.js'
import { exportXlsx } from '../excel.js'

function MovementModal({ movement, onClose }) {
  const { db, upsert, toast } = useStore()
  const [m, setM] = useState(
    movement || {
      customer: '', date: todayISO(), reference: '', type: 'Inbound', cbm: '',
      storage: '', handlingMode: '', containerSize: '', truckCount: '1',
      packageQty: '', packageUom: '', storageDays: '',
    },
  )
  const set = (k) => (v) => setM((s) => ({ ...s, [k]: v }))
  const setE = (k) => (e) => setM((s) => ({ ...s, [k]: e.target.value }))

  const storageTypes = [...new Set(db.storageRates.map((r) => r.storageType))]
  const needsVehicle = m.handlingMode === 'Container' || m.handlingMode === 'Trailer'
  const valid = m.customer && m.date && m.reference && m.type && num(m.cbm) > 0 && m.storage &&
    (!m.handlingMode || (m.handlingMode === 'Loose' ? true : m.containerSize && num(m.truckCount) > 0))

  function save() {
    upsert('storageMovements', {
      ...m,
      cbm: num(m.cbm),
      truckCount: needsVehicle ? num(m.truckCount) : null,
      containerSize: needsVehicle ? m.containerSize : null,
      handlingMode: m.handlingMode || null,
      packageQty: m.packageQty === '' ? null : num(m.packageQty),
      storageDays: m.storageDays === '' ? null : num(m.storageDays),
    }, { entityType: 'Storage', label: 'storage movement' })
    toast('Storage movement saved')
    onClose()
  }

  return (
    <Modal
      title={movement ? 'Edit Storage Movement' : 'New Storage Movement'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!valid} onClick={save}>Save Movement</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Customer" required>
          <Select value={m.customer} onChange={set('customer')} options={db.customers.map((c) => c.name)} placeholder="Select…" />
        </Field>
        <Field label="Date" required>
          <input type="date" value={m.date} onChange={setE('date')} />
        </Field>
        <Field label="Reference" required>
          <input type="text" value={m.reference} onChange={setE('reference')} />
        </Field>
        <Field label="Type" required>
          <Select value={m.type} onChange={set('type')} options={['Inbound', 'Outbound']} />
        </Field>
        <Field label="CBM" required>
          <input type="number" min="0" step="0.01" value={m.cbm} onChange={setE('cbm')} />
        </Field>
        <Field label="Storage Type" required>
          <Select value={m.storage} onChange={set('storage')} options={storageTypes} placeholder="Select…" />
        </Field>
        <Field label="Handling Mode">
          <Select value={m.handlingMode || ''} onChange={set('handlingMode')} options={['Container', 'Trailer', 'Loose']} placeholder="None" />
        </Field>
        {needsVehicle && (
          <>
            <Field label="Vehicle Type" required>
              <Select value={m.containerSize || ''} onChange={set('containerSize')} options={db.vehicleTypes.map((v) => v.name)} placeholder="Select…" />
            </Field>
            <Field label="No. of Trucks" required>
              <input type="number" min="1" value={m.truckCount ?? ''} onChange={setE('truckCount')} />
            </Field>
          </>
        )}
        <Field label="Package Qty">
          <input type="number" min="0" value={m.packageQty ?? ''} onChange={setE('packageQty')} />
        </Field>
        <Field label="Package UOM">
          <Select value={m.packageUom || ''} onChange={set('packageUom')} options={db.uoms.map((u) => u.name)} placeholder="Select…" />
        </Field>
        <Field label="Storage Days" hint="Leave empty to bill days remaining in the month">
          <input type="number" min="1" value={m.storageDays ?? ''} onChange={setE('storageDays')} />
        </Field>
      </div>
    </Modal>
  )
}

export function HandlingRateModal({ rate, onClose }) {
  const { db, upsert, toast } = useStore()
  const [r, setR] = useState(
    rate || {
      customer: '', container20: '', container40: '', trailer20: '', trailer40: '',
      loosePerCbm: '', minimumCharge: '', monthlyMinimum: '', currency: 'USD',
    },
  )
  const setE = (k) => (e) => setR((s) => ({ ...s, [k]: e.target.value }))
  const valid = r.customer && r.currency

  function save() {
    upsert('handlingRates', {
      ...r,
      container20: num(r.container20), container40: num(r.container40),
      trailer20: num(r.trailer20), trailer40: num(r.trailer40),
      loosePerCbm: num(r.loosePerCbm), minimumCharge: num(r.minimumCharge),
      monthlyMinimum: num(r.monthlyMinimum),
    }, { entityType: 'Master Data', label: 'handling rates' })
    toast('Handling configuration saved')
    onClose()
  }

  return (
    <Modal
      title={rate ? `Handling Rates — ${rate.customer}` : 'New Handling Configuration'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!valid} onClick={save}>Save Rates</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Customer" required>
          <Select value={r.customer} onChange={(v) => setR((s) => ({ ...s, customer: v, currency: db.customers.find((c) => c.name === v)?.currency || s.currency }))} options={db.customers.map((c) => c.name)} placeholder="Select…" disabled={!!rate} />
        </Field>
        <Field label="Currency" required>
          <Select value={r.currency} onChange={(v) => setR((s) => ({ ...s, currency: v }))} options={db.currencies.map((c) => c.name)} />
        </Field>
        <Field label="Container 20ft (per truck)"><input type="number" min="0" step="0.01" value={r.container20} onChange={setE('container20')} /></Field>
        <Field label="Container 40ft (per truck)"><input type="number" min="0" step="0.01" value={r.container40} onChange={setE('container40')} /></Field>
        <Field label="Trailer 20ft (per truck)"><input type="number" min="0" step="0.01" value={r.trailer20} onChange={setE('trailer20')} /></Field>
        <Field label="Trailer 40ft (per truck)"><input type="number" min="0" step="0.01" value={r.trailer40} onChange={setE('trailer40')} /></Field>
        <Field label="Loose rate (per CBM)"><input type="number" min="0" step="0.01" value={r.loosePerCbm} onChange={setE('loosePerCbm')} /></Field>
        <Field label="Minimum charge (per movement)"><input type="number" min="0" step="0.01" value={r.minimumCharge} onChange={setE('minimumCharge')} /></Field>
        <Field label="Monthly minimum charge" hint="Top-up added at billing if month total is below this"><input type="number" min="0" step="0.01" value={r.monthlyMinimum} onChange={setE('monthlyMinimum')} /></Field>
      </div>
    </Modal>
  )
}

export default function StorageHandling() {
  const { db, remove, upsert } = useStore()
  const [tab, setTab] = useState('storage')
  const [movModal, setMovModal] = useState(null) // null | 'new' | movement
  const [rateModal, setRateModal] = useState(null)
  const [fCustomer, setFCustomer] = useState('')
  const [fType, setFType] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')

  const movements = useMemo(
    () =>
      db.storageMovements
        .filter((m) =>
          (!fCustomer || m.customer === fCustomer) &&
          (!fType || m.type === fType) &&
          (!fFrom || m.date >= fFrom) &&
          (!fTo || m.date <= fTo),
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [db.storageMovements, fCustomer, fType, fFrom, fTo],
  )

  function importMovements(rows) {
    let imported = 0, skipped = 0
    for (const row of rows) {
      if (!row.customer || !row.date || !row.type || !num(row.cbm)) { skipped++; continue }
      upsert('storageMovements', {
        customer: String(row.customer), date: String(row.date).slice(0, 10), reference: String(row.reference || ''),
        type: /out/i.test(row.type) ? 'Outbound' : 'Inbound', cbm: num(row.cbm), storage: String(row.storage || 'Normal Storage'),
        handlingMode: row.handlingMode || null, containerSize: row.containerSize || null,
        truckCount: row.truckCount === '' ? null : num(row.truckCount),
        packageQty: row.packageQty === '' ? null : num(row.packageQty), packageUom: row.packageUom || null,
        storageDays: row.storageDays === '' ? null : num(row.storageDays), sourceActivityId: null,
      }, { entityType: 'Storage', label: 'storage movement (import)' })
      imported++
    }
    return { imported, skipped }
  }

  function exportMovements() {
    exportXlsx(
      'storage_movements.xlsx',
      movements.map((m) => ({
        Date: m.date, Customer: m.customer, Reference: m.reference, Type: m.type,
        CBM: m.cbm, Storage: m.storage, Handling: m.handlingMode || '', Vehicle: m.containerSize || '',
        Trucks: m.truckCount || '', 'Package Qty': m.packageQty || '', 'Package UOM': m.packageUom || '',
        'Storage Days': m.storageDays ?? 'auto',
      })),
      'Storage Movements',
    )
  }

  return (
    <div>
      <h1 className="page-title">Storage &amp; Handling</h1>
      <p className="page-sub">Storage movements (in/out) and customer handling rate configuration.</p>

      <div className="tabs">
        <button className={'tab' + (tab === 'storage' ? ' active' : '')} onClick={() => setTab('storage')}>Storage Management</button>
        <button className={'tab' + (tab === 'handling' ? ' active' : '')} onClick={() => setTab('handling')}>Handling Configuration</button>
      </div>

      {tab === 'storage' && (
        <div className="card">
          <div className="spread" style={{ marginBottom: 12 }}>
            <div className="row">
              <Select value={fCustomer} onChange={setFCustomer} options={db.customers.map((c) => c.name)} placeholder="All customers" style={{ width: 180 }} />
              <Select value={fType} onChange={setFType} options={['Inbound', 'Outbound']} placeholder="All types" style={{ width: 130 }} />
              <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
              <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
            </div>
            <div className="row">
              <ImportButton kind="storageMovements" onRows={importMovements} />
              <button className="btn btn-sm btn-ghost" onClick={exportMovements} disabled={!movements.length}>⬇ Export</button>
              <button className="btn btn-sm btn-primary" onClick={() => setMovModal('new')}>＋ New Movement</button>
            </div>
          </div>

          {movements.length === 0 ? (
            <EmptyState icon="📦" title="No storage movements" hint="Movements are created automatically when Offloading/Loading activities end, or add one manually." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th><th>Customer</th><th>Reference</th><th>Type</th>
                    <th className="num">CBM</th><th>Storage</th><th>Handling</th>
                    <th>Vehicle</th><th className="num">Trucks</th><th className="num">Pkg Qty</th><th>Pkg UOM</th><th>Source</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td>{fmtDate(m.date)}</td>
                      <td><b>{m.customer}</b></td>
                      <td>{m.reference}</td>
                      <td><StatusBadge status={m.type} /></td>
                      <td className="num">{fmtNum(m.cbm)}</td>
                      <td>{m.storage}</td>
                      <td>{m.handlingMode || '—'}</td>
                      <td>{m.containerSize || '—'}</td>
                      <td className="num">{m.truckCount ?? '—'}</td>
                      <td className="num">{m.packageQty ?? '—'}</td>
                      <td>{m.packageUom || '—'}</td>
                      <td>{m.sourceActivityId ? <span className="badge badge-brand">AUTO</span> : <span className="badge badge-gray">MANUAL</span>}</td>
                      <td>
                        <div className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
                          <button className="btn btn-sm btn-ghost" onClick={() => setMovModal(m)}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => window.confirm('Delete this movement? Its billing lines will disappear.') && remove('storageMovements', m.id, { entityType: 'Storage' })}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'handling' && (
        <div className="card">
          <div className="spread" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Customer Handling Rates</div>
            <div className="row">
              <button className="btn btn-sm btn-primary" onClick={() => setRateModal('new')}>＋ New Configuration</button>
            </div>
          </div>
          {db.handlingRates.length === 0 ? (
            <EmptyState icon="🚛" title="No handling rates configured" hint="Configure per-customer container, trailer and loose handling rates." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Customer</th><th className="num">Container 20ft</th><th className="num">Container 40ft</th>
                    <th className="num">Trailer 20ft</th><th className="num">Trailer 40ft</th>
                    <th className="num">Loose /CBM</th><th className="num">Min Charge</th><th className="num">Monthly Min</th><th>Currency</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {db.handlingRates.map((r) => (
                    <tr key={r.id}>
                      <td><b>{r.customer}</b></td>
                      <td className="num">{fmtNum(r.container20)}</td>
                      <td className="num">{fmtNum(r.container40)}</td>
                      <td className="num">{fmtNum(r.trailer20)}</td>
                      <td className="num">{fmtNum(r.trailer40)}</td>
                      <td className="num">{fmtNum(r.loosePerCbm)}</td>
                      <td className="num">{fmtNum(r.minimumCharge)}</td>
                      <td className="num">{fmtNum(r.monthlyMinimum)}</td>
                      <td>{r.currency}</td>
                      <td>
                        <div className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
                          <button className="btn btn-sm btn-ghost" onClick={() => setRateModal(r)}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => window.confirm('Delete handling rates for this customer?') && remove('handlingRates', r.id, { entityType: 'Master Data' })}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {movModal && <MovementModal movement={movModal === 'new' ? null : movModal} onClose={() => setMovModal(null)} />}
      {rateModal && <HandlingRateModal rate={rateModal === 'new' ? null : rateModal} onClose={() => setRateModal(null)} />}
    </div>
  )
}
