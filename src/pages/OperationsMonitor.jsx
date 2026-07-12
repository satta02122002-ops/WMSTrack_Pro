import { useEffect, useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Field, Select, StatusBadge, EmptyState } from '../components/ui.jsx'
import QtyLinesEditor, { validQtyLines, qtyLinesTotal } from '../components/QtyLinesEditor.jsx'
import { activityDuration, fmtDuration, fmtDate, fmtTime, todayISO, nowISO, uid, num, qtyDisplay, storageTypeNames, accountHolderOf, accountHolderNames } from '../utils.js'
import { exportXlsx } from '../excel.js'

function linesFrom(record, qtyKey, uomKey, linesKey) {
  if (Array.isArray(record?.[linesKey]) && record[linesKey].length) {
    return record[linesKey].map((l) => ({ qty: String(l.qty), uom: l.uom }))
  }
  if (record?.[qtyKey] != null && record[qtyKey] !== '') {
    return [{ qty: String(record[qtyKey]), uom: record[uomKey] || '' }]
  }
  return [{ qty: '', uom: '' }]
}

export function ManualActivityModal({ activity, onClose }) {
  const { db, update, toast, session, updateOperationsActivity } = useStore()
  const editing = !!activity
  const [customerName, setCustomerName] = useState(activity?.customerName || '')
  const [customerRef, setCustomerRef] = useState(activity?.customerRef || '')
  const [type, setType] = useState(activity?.type || '')
  const [date, setDate] = useState(activity?.date || todayISO())
  const [durationMin, setDurationMin] = useState(activity ? String(Math.round((activity.durationSeconds || 0) / 60)) : '')
  const [qtyLines, setQtyLines] = useState(() => linesFrom(activity, 'qty', 'uom', 'qtyLines'))

  // Storage fields
  const [cbm, setCbm] = useState(activity?.cbm != null ? String(activity.cbm) : '')
  const [storageTypeUsed, setStorageTypeUsed] = useState(activity?.storageTypeUsed || '')
  const [handlingMode, setHandlingMode] = useState(activity?.handlingMode || '')
  const [vehicleType, setVehicleType] = useState(activity?.vehicleType || '')
  const [truckCount, setTruckCount] = useState(activity?.truckCount != null ? String(activity.truckCount) : '1')
  const [pkgLines, setPkgLines] = useState(() => linesFrom(activity, 'packageQty', 'packageUom', 'packageLines'))

  const master = db.activitiesMaster.find((a) => a.name === type)
  const isStorage = master?.storageType === 'inbound' || master?.storageType === 'outbound'
  const needsVehicle = handlingMode === 'Container' || handlingMode === 'Trailer'
  const storageTypes = storageTypeNames(db)
  const customer = db.customers.find((c) => c.name === customerName)

  const valid = customerName && customerRef.trim() && type && date && num(durationMin) > 0 && (
    isStorage
      ? num(cbm) > 0 && storageTypeUsed && handlingMode && validQtyLines(pkgLines) &&
        (handlingMode === 'Loose' || (vehicleType && num(truckCount) > 0))
      : validQtyLines(qtyLines)
  )

  function save() {
    const durationSeconds = Math.round(num(durationMin) * 60)
    const now = nowISO()
    const ownerName = session?.name || 'Manual Entry'

    let actPayload
    if (isStorage) {
      const cleanPkgs = pkgLines.map((l) => ({ qty: num(l.qty), uom: l.uom }))
      actPayload = {
        cbm: num(cbm), storageTypeUsed, handlingMode,
        vehicleType: needsVehicle ? vehicleType : null,
        truckCount: needsVehicle ? num(truckCount) : null,
        packageLines: cleanPkgs,
        packageQty: qtyLinesTotal(cleanPkgs),
        packageUom: cleanPkgs.length === 1 ? cleanPkgs[0].uom : null,
        qty: null, uom: null, qtyLines: null,
      }
    } else {
      const cleanLines = qtyLines.map((l) => ({ qty: num(l.qty), uom: l.uom }))
      actPayload = {
        qtyLines: cleanLines,
        qty: qtyLinesTotal(cleanLines),
        uom: cleanLines.length === 1 ? cleanLines[0].uom : null,
        cbm: null, storageTypeUsed: null, handlingMode: null,
        vehicleType: null, truckCount: null, packageLines: null, packageQty: null, packageUom: null,
      }
    }

    if (editing) {
      updateOperationsActivity(activity.id, { ...actPayload, date, durationSeconds, accumulatedSeconds: durationSeconds })
      onClose()
      return
    }

    const actId = uid('op')
    const act = {
      id: actId, customerName, customerRef: customerRef.trim(), date,
      type, storageType: master?.storageType || null, status: 'complete',
      startTime: now, endTime: now,
      accumulatedSeconds: durationSeconds, lastResumeTime: null, durationSeconds,
      owner: session?.userId || 'manual', ownerName, participants: [],
      outcome: 'finished',
      ...actPayload,
    }

    update((d) => {
      let next = {
        ...d,
        operationsActivities: [act, ...d.operationsActivities],
        auditLog: [
          { id: uid('log'), dateTime: now, user: ownerName, action: 'Manual Entry', entityType: 'Operations', details: `Manual entry: ${type} for ${customerName} (${customerRef.trim()})` },
          ...d.auditLog,
        ].slice(0, 5000),
      }

      if (isStorage) {
        const mov = {
          id: uid('mov'), customer: customerName, date, reference: customerRef.trim(),
          type: master.storageType === 'inbound' ? 'Inbound' : 'Outbound',
          cbm: num(cbm), storage: storageTypeUsed,
          handlingMode: handlingMode || null,
          containerSize: needsVehicle ? vehicleType : null,
          truckCount: needsVehicle ? num(truckCount) : null,
          packageQty: actPayload.packageQty, packageUom: actPayload.packageUom,
          packageLines: actPayload.packageLines,
          storageDays: null, sourceActivityId: actId,
        }
        next = {
          ...next,
          storageMovements: [mov, ...next.storageMovements],
          auditLog: [
            { id: uid('log'), dateTime: now, user: ownerName, action: 'Storage Movement', entityType: 'Storage', details: `${mov.type} movement auto-created (manual): ${mov.cbm} CBM for ${mov.customer} (${mov.reference})` },
            ...next.auditLog,
          ].slice(0, 5000),
        }
      }

      return next
    })

    toast('Activity recorded (manual entry)')
    onClose()
  }

  return (
    <Modal
      title={editing ? `Edit Activity — ${activity.type}` : 'Manual Activity Entry'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!valid} onClick={save}>{editing ? 'Save Changes' : 'Save Activity'}</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Customer Name" required>
          <Select value={customerName} onChange={(v) => { setCustomerName(v); setCustomerRef('') }} options={db.customers.map((c) => c.name)} placeholder="Select…" disabled={editing} />
        </Field>
        <Field label="Customer Reference No" required>
          <input type="text" list="manual-ref-opts" value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} placeholder="e.g. PO-1001" disabled={!customerName || editing} />
          <datalist id="manual-ref-opts">
            {(customer?.references || []).map((r) => <option key={r} value={r} />)}
          </datalist>
        </Field>
        <Field label="Activity Type" required>
          <Select
            value={type}
            onChange={(v) => { setType(v); setStorageTypeUsed(''); setHandlingMode('') }}
            options={db.activitiesMaster.map((a) => ({ value: a.name, label: a.name + (a.storageType ? ` (${a.storageType})` : '') }))}
            placeholder="Select…"
            disabled={editing}
          />
        </Field>
        <Field label="Date" required>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Duration (minutes)" required>
          <input type="number" min="1" step="1" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder="e.g. 45" />
        </Field>
      </div>

      {type && !isStorage && (
        <>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-700)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '12px 0 8px' }}>
            Chargeable Quantities — one line per UOM
          </p>
          <QtyLinesEditor lines={qtyLines} onChange={setQtyLines} uoms={db.uoms.map((u) => u.name)} />
        </>
      )}

      {type && isStorage && (
        <>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-700)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '12px 0 8px' }}>
            Storage &amp; Handling Details
          </p>
          <div className="form-grid">
            <Field label="CBM" required>
              <input type="number" min="0" step="0.01" value={cbm} onChange={(e) => setCbm(e.target.value)} />
            </Field>
            <Field label="Storage Type" required>
              <Select value={storageTypeUsed} onChange={setStorageTypeUsed} options={storageTypes} placeholder="Select…" />
            </Field>
            <Field label="Handling Type" required>
              <Select value={handlingMode} onChange={setHandlingMode} options={['Container', 'Trailer', 'Loose']} placeholder="Select handling…" />
            </Field>
            {needsVehicle && (
              <>
                <Field label="Vehicle Type" required>
                  <Select value={vehicleType} onChange={setVehicleType} options={db.vehicleTypes.map((v) => v.name)} placeholder="Select…" />
                </Field>
                <Field label="No. of Trucks" required>
                  <input type="number" min="1" value={truckCount} onChange={(e) => setTruckCount(e.target.value)} />
                </Field>
              </>
            )}
          </div>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-700)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '12px 0 8px' }}>
            Packages — one line per UOM
          </p>
          <QtyLinesEditor
            lines={pkgLines}
            onChange={setPkgLines}
            uoms={db.uoms.map((u) => u.name)}
            qtyLabel="Package Qty"
            uomLabel="Package UOM"
            totalLabel="Total packages"
          />
        </>
      )}
    </Modal>
  )
}

export default function OperationsMonitor() {
  const { db, currentUser, deleteOperationsActivity } = useStore()
  const canManual = ['Admin', 'Supervisor', 'Developer'].includes(currentUser.role)
  const canManageOps = currentUser.role === 'Developer'
  const [editActivity, setEditActivity] = useState(null)
  const hasLive = db.operationsActivities.some((a) => a.status !== 'complete')
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!hasLive) return
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [hasLive])

  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [customer, setCustomer] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [manualOpen, setManualOpen] = useState(false)

  const live = db.operationsActivities.filter((a) => a.status !== 'complete')
  const history = db.operationsActivities
    .filter((a) => a.status === 'complete')
    .filter((a) => (!from || a.date >= from) && (!to || a.date <= to) && (!customer || a.customerName === customer) && (!accountHolder || accountHolderOf(db, a.customerName) === accountHolder))
    .sort((a, b) => (b.endTime || '').localeCompare(a.endTime || ''))

  function exportHistory() {
    exportXlsx(
      `operations_history_${from}_${to}.xlsx`,
      history.map((a) => ({
        Date: a.date, Customer: a.customerName, Reference: a.customerRef, Activity: a.type,
        Owner: a.ownerName, Participants: (a.participants || []).map((p) => p.name).join(', '),
        Start: fmtTime(a.startTime), End: fmtTime(a.endTime), Duration: fmtDuration(a.durationSeconds),
        Qty: qtyDisplay(a), UOM: a.qtyLines?.length > 1 ? 'Multi' : a.uom ?? '', CBM: a.cbm ?? '', Handling: a.handlingMode ?? '',
        Outcome: a.outcome ?? '',
      })),
      'Operations History',
    )
  }

  return (
    <div>
      <h1 className="page-title">Operations Monitor</h1>
      <p className="page-sub">Live view of running activities and completed history.</p>

      <div className="card">
        <div className="card-title">🔴 Live Activities</div>
        {live.length === 0 ? (
          <EmptyState icon="📡" title="No activities running" hint="Running and paused activities appear here in real time." />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Activity</th><th>Customer</th><th>Reference</th><th>Owner</th>
                  <th>Participants</th><th>Started</th><th>Status</th><th className="num">Duration</th>
                </tr>
              </thead>
              <tbody>
                {live.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.type}</b></td>
                    <td>{a.customerName}</td>
                    <td>{a.customerRef}</td>
                    <td>{a.ownerName}</td>
                    <td>{(a.participants || []).map((p) => p.name).join(', ') || '—'}</td>
                    <td>{fmtTime(a.startTime)}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td className="num" style={{ fontWeight: 700, color: 'var(--brand-800)' }}>{fmtDuration(activityDuration(a))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="spread" style={{ marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>📚 Completed History</div>
          <div className="row">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <Select value={customer} onChange={setCustomer} options={db.customers.map((c) => c.name)} placeholder="All customers" style={{ width: 180 }} />
            <Select value={accountHolder} onChange={setAccountHolder} options={accountHolderNames(db)} placeholder="All account holders" style={{ width: 180 }} />
            {canManual && <button className="btn btn-primary btn-sm" onClick={() => setManualOpen(true)}>+ Manual Entry</button>}
            <button className="btn btn-outline btn-sm" onClick={exportHistory} disabled={!history.length}>⬇ Excel</button>
          </div>
        </div>
        {history.length === 0 ? (
          <EmptyState icon="📚" title="No completed activities in this range" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th><th>Activity</th><th>Customer</th><th>Reference</th><th>Owner</th>
                  <th className="num">Duration</th><th className="num">Qty</th><th>UOM</th>
                  <th className="num">CBM</th><th>Handling</th><th>Outcome</th>
                  {canManageOps && <th></th>}
                </tr>
              </thead>
              <tbody>
                {history.map((a) => (
                  <tr key={a.id}>
                    <td>{fmtDate(a.date)}</td>
                    <td><b>{a.type}</b></td>
                    <td>{a.customerName}</td>
                    <td>{a.customerRef}</td>
                    <td>{a.ownerName}</td>
                    <td className="num">{fmtDuration(a.durationSeconds)}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{qtyDisplay(a)}</td>
                    <td>{a.qtyLines?.length > 1 ? <span className="badge badge-blue">MULTI</span> : a.uom ?? '—'}</td>
                    <td className="num">{a.cbm ?? '—'}</td>
                    <td>{a.handlingMode ? `${a.handlingMode}${a.vehicleType ? ' ' + a.vehicleType : ''}` : '—'}</td>
                    <td><StatusBadge status={a.outcome} /></td>
                    {canManageOps && (
                      <td>
                        <div className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
                          <button className="btn btn-sm btn-ghost" onClick={() => setEditActivity(a)}>Edit</button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => window.confirm('Delete this activity? Its storage movement and billing lines will be removed. This cannot be undone.') && deleteOperationsActivity(a.id)}
                          >✕</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {manualOpen && canManual && <ManualActivityModal onClose={() => setManualOpen(false)} />}
      {editActivity && canManageOps && <ManualActivityModal activity={editActivity} onClose={() => setEditActivity(null)} />}
    </div>
  )
}
