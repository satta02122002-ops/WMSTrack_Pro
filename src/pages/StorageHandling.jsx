import { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Field, Select, StatusBadge, EmptyState } from '../components/ui.jsx'
import ImportButton from '../components/ImportButton.jsx'
import QtyLinesEditor, { validQtyLines, qtyLinesTotal } from '../components/QtyLinesEditor.jsx'
import { fmtDate, fmtNum, num, todayISO, pkgDisplay, storageTypeNames } from '../utils.js'
import { exportXlsx } from '../excel.js'
import { manualHandlingAmount } from '../billing.js'

function MovementModal({ movement, onClose }) {
  const { db, upsert, toast } = useStore()
  const [m, setM] = useState(() => {
    const base = movement || {
      customer: '', date: todayISO(), reference: '', type: 'Inbound', cbm: '',
      storage: '', handlingMode: '', containerSize: '', truckCount: '1',
      storageDays: '',
    }
    // Legacy/auto movements have no flag; treat undefined as "bill handling".
    return { ...base, applyHandling: base.applyHandling !== false }
  })
  const [pkgLines, setPkgLines] = useState(
    movement?.packageLines?.length
      ? movement.packageLines.map((l) => ({ qty: String(l.qty), uom: l.uom }))
      : movement?.packageQty != null && movement?.packageQty !== ''
        ? [{ qty: String(movement.packageQty), uom: movement.packageUom || '' }]
        : [{ qty: '', uom: '' }],
  )
  const set = (k) => (v) => setM((s) => ({ ...s, [k]: v }))
  const setE = (k) => (e) => setM((s) => ({ ...s, [k]: e.target.value }))

  const storageTypes = storageTypeNames(db)
  const needsVehicle = m.handlingMode === 'Container' || m.handlingMode === 'Trailer'
  // packages are optional on manual movements: either fully empty or fully valid lines
  const pkgsEntered = pkgLines.some((l) => l.qty || l.uom)
  const valid = m.customer && m.date && m.reference && m.type && num(m.cbm) > 0 && m.storage &&
    (!m.handlingMode || (m.handlingMode === 'Loose' ? true : m.containerSize && num(m.truckCount) > 0)) &&
    (!pkgsEntered || validQtyLines(pkgLines))

  function save() {
    const cleanPkgs = pkgsEntered ? pkgLines.map((l) => ({ qty: num(l.qty), uom: l.uom })) : null
    upsert('storageMovements', {
      ...m,
      cbm: num(m.cbm),
      truckCount: needsVehicle ? num(m.truckCount) : null,
      containerSize: needsVehicle ? m.containerSize : null,
      handlingMode: m.handlingMode || null,
      applyHandling: !!m.applyHandling,
      packageLines: cleanPkgs,
      packageQty: cleanPkgs ? qtyLinesTotal(cleanPkgs) : null,
      packageUom: cleanPkgs && cleanPkgs.length === 1 ? cleanPkgs[0].uom : null,
      storageDays: m.storageDays === '' || m.storageDays == null ? null : num(m.storageDays),
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
        <Field label="Storage Days" hint="Leave empty to bill days remaining in the month">
          <input type="number" min="1" value={m.storageDays ?? ''} onChange={setE('storageDays')} />
        </Field>
      </div>
      <label className="checkbox-row" style={{ marginTop: 4, padding: '10px 12px', background: 'var(--brand-50)', border: '1px solid var(--brand-100)', borderRadius: 8 }}>
        <input type="checkbox" checked={!!m.applyHandling} onChange={(e) => setM((s) => ({ ...s, applyHandling: e.target.checked }))} />
        <span>
          <b>Add Handling Charges</b> — when ticked, handling is billed from the selected handling mode
          and the customer's configured rates. Untick to record the movement without any handling charge.
        </span>
      </label>
      <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-700)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '4px 0 8px' }}>
        Packages (optional) — add a line per UOM
      </p>
      <QtyLinesEditor
        lines={pkgLines}
        onChange={setPkgLines}
        uoms={db.uoms.map((u) => u.name)}
        qtyLabel="Package Qty"
        uomLabel="Package UOM"
        totalLabel="Total packages"
        required={false}
      />
    </Modal>
  )
}

export function HandlingRateModal({ rate, onClose }) {
  const { db, upsert, toast } = useStore()
  const [r, setR] = useState(
    rate || {
      customer: '', container20: '', container40: '', trailer20: '', trailer40: '',
      loosePerCbm: '', minimumCharge: '', monthlyMinimum: '', currency: 'USD', billByCbm: false,
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
      monthlyMinimum: num(r.monthlyMinimum), billByCbm: !!r.billByCbm,
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
      <label className="checkbox-row" style={{ marginTop: 4, padding: '10px 12px', background: 'var(--brand-50)', border: '1px solid var(--brand-100)', borderRadius: 8 }}>
        <input type="checkbox" checked={!!r.billByCbm} onChange={(e) => setR((s) => ({ ...s, billByCbm: e.target.checked }))} />
        <span>
          <b>Bill all handling by CBM</b> — charge CBM × loose rate for every movement, even container/trailer.
          Container and trailer per-truck rates are ignored for this customer; vehicle and truck details are still recorded.
        </span>
      </label>
    </Modal>
  )
}

function ManualHandlingModal({ charge, onClose }) {
  const { db, upsert, toast } = useStore()
  const [h, setH] = useState(
    charge || { customerName: '', date: todayISO(), reference: '', cbm: '', packageQty: '', packageUom: '' },
  )
  const set = (k) => (v) => setH((s) => ({ ...s, [k]: v }))
  const setE = (k) => (e) => setH((s) => ({ ...s, [k]: e.target.value }))
  const valid = h.customerName && h.date && num(h.cbm) > 0 && num(h.packageQty) > 0 && h.packageUom

  const hasRate = h.customerName && db.handlingRates.some((r) => r.customer === h.customerName)
  const preview = h.customerName && num(h.cbm) > 0 ? manualHandlingAmount(db, { ...h, cbm: num(h.cbm) }) : null

  function save() {
    const cust = db.customers.find((c) => c.name === h.customerName)
    upsert('handlingCharges', {
      customerName: h.customerName, date: h.date, reference: (h.reference || '').trim(),
      cbm: num(h.cbm), packageQty: num(h.packageQty), packageUom: h.packageUom,
      currency: cust?.currency || '',
    }, { entityType: 'Handling', label: 'manual handling charge' })
    toast('Manual handling charge saved')
    onClose()
  }

  return (
    <Modal
      title={charge ? 'Edit Manual Handling Charge' : 'New Manual Handling Charge'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!valid} onClick={save}>Save Charge</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Customer" required>
          <Select value={h.customerName} onChange={set('customerName')} options={db.customers.map((c) => c.name)} placeholder="Select…" />
        </Field>
        <Field label="Date" required>
          <input type="date" value={h.date} onChange={setE('date')} />
        </Field>
        <Field label="Reference">
          <input type="text" value={h.reference} onChange={setE('reference')} placeholder="e.g. PO / job ref" />
        </Field>
        <Field label="CBM" required>
          <input type="number" min="0" step="0.01" value={h.cbm} onChange={setE('cbm')} />
        </Field>
        <Field label="Package Qty" required>
          <input type="number" min="0" step="0.01" value={h.packageQty} onChange={setE('packageQty')} />
        </Field>
        <Field label="Package UOM" required>
          <Select value={h.packageUom} onChange={set('packageUom')} options={db.uoms.map((u) => u.name)} placeholder="Select…" />
        </Field>
      </div>
      {h.customerName && !hasRate && (
        <div style={{ marginTop: 4, padding: '10px 12px', background: 'var(--red-50, #fef2f2)', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: 'var(--red-600)' }}>
          ⚠ No handling rate is configured for <b>{h.customerName}</b> in Master Data. Add one under Master Data → Handling Rates, or the charge will be 0.
        </div>
      )}
      {preview && hasRate && (
        <div style={{ marginTop: 4, padding: '10px 12px', background: 'var(--brand-50)', border: '1px solid var(--brand-100)', borderRadius: 8, fontSize: 13 }}>
          Rate <b>{fmtNum(preview.rate)}</b> / CBM × <b>{fmtNum(num(h.cbm))}</b> CBM ={' '}
          <b>{fmtNum(preview.amount)} {preview.currency}</b>
          {preview.minimumApplied && <span style={{ color: 'var(--ink-500)' }}> (minimum charge applied)</span>}
          <div style={{ color: 'var(--ink-500)', marginTop: 2 }}>Rate, minimum and currency come from Master Data handling configuration.</div>
        </div>
      )}
    </Modal>
  )
}

export default function StorageHandling() {
  const { db, remove, upsert } = useStore()
  const [tab, setTab] = useState('storage')
  const [movModal, setMovModal] = useState(null) // null | 'new' | movement
  const [manualModal, setManualModal] = useState(null) // null | 'new' | charge
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

  const manualCharges = useMemo(
    () => [...(db.handlingCharges || [])].sort((a, b) => b.date.localeCompare(a.date)),
    [db.handlingCharges],
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
        applyHandling: !/^\s*(no|false|0)\s*$/i.test(String(row.applyHandling ?? '')),
      }, { entityType: 'Storage', label: 'storage movement (import)' })
      imported++
    }
    return { imported, skipped }
  }

  function importManualHandling(rows) {
    let imported = 0, skipped = 0
    for (const row of rows) {
      if (!row.customer || !row.date || !num(row.cbm)) { skipped++; continue }
      const cust = db.customers.find((c) => c.name === String(row.customer))
      upsert('handlingCharges', {
        customerName: String(row.customer), date: String(row.date).slice(0, 10),
        reference: String(row.reference || ''),
        cbm: num(row.cbm),
        packageQty: row.packageQty === '' || row.packageQty == null ? null : num(row.packageQty),
        packageUom: row.packageUom || '',
        currency: cust?.currency || '',
      }, { entityType: 'Handling', label: 'manual handling charge (import)' })
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
        Trucks: m.truckCount || '', 'Package Qty': m.packageLines?.length > 1 ? pkgDisplay(m) : m.packageQty || '',
        'Package UOM': m.packageLines?.length > 1 ? 'Multi' : m.packageUom || '',
        'Storage Days': m.storageDays ?? 'auto',
        'Handling Billed': m.handlingMode ? (m.applyHandling === false ? 'no' : 'yes') : '',
      })),
      'Storage Movements',
    )
  }

  function exportManualHandling() {
    exportXlsx(
      'manual_handling_charges.xlsx',
      manualCharges.map((h) => {
        const calc = manualHandlingAmount(db, h)
        return {
          Date: h.date, Customer: h.customerName, Reference: h.reference || '',
          CBM: h.cbm, 'Package Qty': h.packageQty ?? '', 'Package UOM': h.packageUom || '',
          'Rate/CBM': calc.rate, Total: calc.amount, Currency: calc.currency,
        }
      }),
      'Manual Handling',
    )
  }

  return (
    <div>
      <h1 className="page-title">Storage &amp; Handling</h1>
      <p className="page-sub">Storage movements (in/out) and ad-hoc manual handling charges. Handling rates are configured in Master Data.</p>

      <div className="tabs">
        <button className={'tab' + (tab === 'storage' ? ' active' : '')} onClick={() => setTab('storage')}>Storage Management</button>
        <button className={'tab' + (tab === 'manual' ? ' active' : '')} onClick={() => setTab('manual')}>Manual Handling</button>
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
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>{pkgDisplay(m)}</td>
                      <td>{m.packageLines?.length > 1 ? <span className="badge badge-blue">MULTI</span> : m.packageUom || '—'}</td>
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

      {tab === 'manual' && (
        <div className="card">
          <div className="spread" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Manual Handling Charges</div>
            <div className="row">
              <ImportButton kind="handlingCharges" onRows={importManualHandling} />
              <button className="btn btn-sm btn-ghost" onClick={exportManualHandling} disabled={!manualCharges.length}>⬇ Export</button>
              <button className="btn btn-sm btn-primary" onClick={() => setManualModal('new')}>＋ New Handling Charge</button>
            </div>
          </div>
          {manualCharges.length === 0 ? (
            <EmptyState icon="🚛" title="No manual handling charges" hint="Enter CBM and package details; the handling rate and charge are pulled automatically from the customer's Master Data handling configuration. These flow into Reports and Monthly Billing as Handling." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th><th>Customer</th><th>Reference</th>
                    <th className="num">CBM</th><th className="num">Pkg Qty</th><th>Pkg UOM</th>
                    <th className="num">Rate/CBM</th><th className="num">Total</th><th>Currency</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {manualCharges.map((h) => {
                    const calc = manualHandlingAmount(db, h)
                    return (
                      <tr key={h.id}>
                        <td>{fmtDate(h.date)}</td>
                        <td><b>{h.customerName}</b></td>
                        <td>{h.reference || '—'}</td>
                        <td className="num">{fmtNum(h.cbm)}</td>
                        <td className="num">{h.packageQty != null && h.packageQty !== '' ? fmtNum(h.packageQty) : '—'}</td>
                        <td>{h.packageUom || '—'}</td>
                        <td className="num">{fmtNum(calc.rate)}</td>
                        <td className="num">
                          <b>{fmtNum(calc.amount)}</b>
                          {calc.rateMissing && <span className="badge badge-red" style={{ marginLeft: 6 }}>NO RATE</span>}
                        </td>
                        <td>{calc.currency}</td>
                        <td>
                          <div className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
                            <button className="btn btn-sm btn-ghost" onClick={() => setManualModal(h)}>Edit</button>
                            <button className="btn btn-sm btn-danger" onClick={() => window.confirm('Delete this handling charge? Its billing line will disappear.') && remove('handlingCharges', h.id, { entityType: 'Handling' })}>✕</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {movModal && <MovementModal movement={movModal === 'new' ? null : movModal} onClose={() => setMovModal(null)} />}
      {manualModal && <ManualHandlingModal charge={manualModal === 'new' ? null : manualModal} onClose={() => setManualModal(null)} />}
    </div>
  )
}
