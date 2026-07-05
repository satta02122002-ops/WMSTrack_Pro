import React, { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Field, Select, StatusBadge, EmptyState } from '../components/ui.jsx'
import { activityDuration, fmtDuration, fmtTime, num } from '../utils.js'

function useTick(intervalMs = 1000) {
  const [, setN] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setN((n) => n + 1), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
}

export function EndActivityModal({ activity, onClose }) {
  const { db, endActivity } = useStore()
  const isStorage = activity.storageType === 'inbound' || activity.storageType === 'outbound'
  // A job can be chargeable in several UOMs at once (e.g. 1 PLT + 10 CTN + 600 PCS),
  // so quantities are captured as one line per UOM — each becomes its own billing line.
  const [qtyLines, setQtyLines] = useState([{ qty: '', uom: '' }])
  const [cbm, setCbm] = useState('')
  const [storageTypeUsed, setStorageTypeUsed] = useState('')
  const [handlingMode, setHandlingMode] = useState('')
  const [vehicleType, setVehicleType] = useState('')
  const [truckCount, setTruckCount] = useState('1')
  const [packageQty, setPackageQty] = useState('')
  const [packageUom, setPackageUom] = useState('')

  const storageTypes = useMemo(() => {
    const fromRates = db.storageRates.filter((r) => r.customer === activity.customerName).map((r) => r.storageType)
    const all = [...new Set([...fromRates, ...db.storageRates.map((r) => r.storageType)])]
    return all.length ? all : ['Normal Storage', 'Cold Storage']
  }, [db.storageRates, activity.customerName])

  const needsVehicle = handlingMode === 'Container' || handlingMode === 'Trailer'
  const uomDuplicated = new Set(qtyLines.map((l) => l.uom).filter(Boolean)).size !== qtyLines.filter((l) => l.uom).length
  const valid = isStorage
    ? num(cbm) > 0 &&
      storageTypeUsed &&
      handlingMode &&
      (handlingMode === 'Loose'
        ? packageUom && num(packageQty) > 0
        : vehicleType && num(truckCount) > 0 && packageUom && num(packageQty) > 0)
    : qtyLines.length > 0 && qtyLines.every((l) => num(l.qty) > 0 && l.uom) && !uomDuplicated

  const setLine = (idx, key, value) =>
    setQtyLines((ls) => ls.map((l, i) => (i === idx ? { ...l, [key]: value } : l)))
  const addLine = () => setQtyLines((ls) => [...ls, { qty: '', uom: '' }])
  const removeLine = (idx) => setQtyLines((ls) => ls.filter((_, i) => i !== idx))
  const totalQty = qtyLines.reduce((s, l) => s + num(l.qty), 0)

  function finish(forward) {
    const cleanLines = qtyLines.map((l) => ({ qty: num(l.qty), uom: l.uom }))
    const payload = isStorage
      ? {
          cbm: num(cbm), storageTypeUsed, handlingMode,
          vehicleType: needsVehicle ? vehicleType : null,
          truckCount: needsVehicle ? num(truckCount) : null,
          packageQty: num(packageQty), packageUom, forward,
        }
      : {
          qtyLines: cleanLines,
          qty: totalQty,
          uom: cleanLines.length === 1 ? cleanLines[0].uom : null,
          forward,
        }
    endActivity(activity.id, payload)
    onClose()
  }

  return (
    <Modal
      title={`End Activity — ${activity.type}`}
      onClose={onClose}
      wide={isStorage}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-warn" disabled={!valid} onClick={() => finish(true)} title="Complete this activity and queue the job for the next activity">
            ⏭ Forward
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={() => finish(false)} title="Complete this activity and close the job">
            ✔ Finish
          </button>
        </>
      }
    >
      <div className="banner banner-brand" style={{ marginBottom: 14 }}>
        <b>{activity.customerName}</b>&nbsp;·&nbsp;{activity.customerRef}&nbsp;·&nbsp;Duration {fmtDuration(activityDuration(activity))}
      </div>

      {isStorage ? (
        <>
          <div className="banner banner-info">
            💡 This will record <b>Storage {activity.storageType === 'inbound' ? 'In' : 'Out'} + Handling {activity.storageType === 'inbound' ? 'In' : 'Out'}</b> for billing.
          </div>
          <div className="form-grid">
            <Field label="CBM" required>
              <input type="number" min="0" step="0.01" value={cbm} onChange={(e) => setCbm(e.target.value)} autoFocus />
            </Field>
            <Field label="Storage Type" required>
              <Select value={storageTypeUsed} onChange={setStorageTypeUsed} options={storageTypes} placeholder="Select storage…" />
            </Field>
            <Field label="Handling Type" required>
              <Select value={handlingMode} onChange={setHandlingMode} options={['Container', 'Trailer', 'Loose']} placeholder="Select handling…" />
            </Field>
          </div>
          {handlingMode && (
            <div className="form-grid">
              {needsVehicle && (
                <>
                  <Field label="Vehicle Type" required>
                    <Select value={vehicleType} onChange={setVehicleType} options={db.vehicleTypes.map((v) => v.name)} placeholder="Select vehicle…" />
                  </Field>
                  <Field label="No. of Trucks" required>
                    <input type="number" min="1" step="1" value={truckCount} onChange={(e) => setTruckCount(e.target.value)} />
                  </Field>
                </>
              )}
              <Field label="Package UOM" required>
                <Select value={packageUom} onChange={setPackageUom} options={db.uoms.map((u) => u.name)} placeholder="Select UOM…" />
              </Field>
              <Field label="Package Qty" required>
                <input type="number" min="0" step="1" value={packageQty} onChange={(e) => setPackageQty(e.target.value)} />
              </Field>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="banner banner-info">
            💡 One job can be chargeable in several UOMs — add a line per UOM (e.g. 1 PLT + 10 CTN + 600 PCS). Each line becomes a separate billing charge.
          </div>
          {qtyLines.map((line, idx) => (
            <div key={idx} className="row" style={{ marginBottom: 10, alignItems: 'flex-end' }}>
              <Field label={idx === 0 ? 'Quantity' : ''} required={idx === 0}>
                <input
                  type="number" min="0" step="0.01" style={{ width: 140 }}
                  value={line.qty}
                  onChange={(e) => setLine(idx, 'qty', e.target.value)}
                  autoFocus={idx === 0}
                />
              </Field>
              <Field label={idx === 0 ? 'UOM' : ''} required={idx === 0}>
                <Select
                  value={line.uom}
                  onChange={(v) => setLine(idx, 'uom', v)}
                  options={db.uoms.map((u) => u.name).filter((n) => n === line.uom || !qtyLines.some((l) => l.uom === n))}
                  placeholder="Select UOM…"
                  style={{ width: 150 }}
                />
              </Field>
              {qtyLines.length > 1 && (
                <div style={{ paddingBottom: 12 }}>
                  <button className="btn btn-sm btn-danger" onClick={() => removeLine(idx)} title="Remove this UOM line">✕</button>
                </div>
              )}
            </div>
          ))}
          <div className="spread" style={{ marginBottom: 4 }}>
            <button className="btn btn-sm btn-outline" onClick={addLine} disabled={qtyLines.length >= db.uoms.length}>
              ＋ Add UOM line
            </button>
            {qtyLines.length > 1 && (
              <span style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
                Total quantity: <b>{totalQty}</b> across {qtyLines.length} UOM lines
              </span>
            )}
          </div>
        </>
      )}

      <p style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 10 }}>
        <b>Forward</b> completes the activity and adds the job to the Pending Activity queue for the next step. <b>Finish</b> completes the activity and closes any matching pending assignment.
      </p>
    </Modal>
  )
}

export default function OperationsExecution() {
  const {
    db, currentUser, needsCheckIn, myActiveActivity,
    startActivity, pauseActivity, resumeActivity, joinActivity, leaveActivity,
    prefill, setPrefill, toast,
  } = useStore()
  useTick()

  const [customerName, setCustomerName] = useState('')
  const [customerRef, setCustomerRef] = useState('')
  const [type, setType] = useState('')
  const [endOpen, setEndOpen] = useState(false)

  // Prefill hand-off from Pending Activity
  useEffect(() => {
    if (prefill) {
      setCustomerName(prefill.customerName || '')
      setCustomerRef(prefill.customerRef || '')
      setType('')
      setPrefill(null)
      toast(`Form pre-filled from pending job: ${prefill.customerName} (${prefill.customerRef})`, 'info')
    }
  }, [prefill, setPrefill, toast])

  const customer = db.customers.find((c) => c.name === customerName)
  const canStart = !needsCheckIn && !myActiveActivity && customerName && customerRef.trim() && type
  const isOwner = myActiveActivity && myActiveActivity.owner === currentUser.userId

  const otherRunning = db.operationsActivities.filter(
    (a) => a.status !== 'complete' && a.owner !== currentUser.userId,
  )

  function handleStart() {
    startActivity({ customerName, customerRef: customerRef.trim(), type })
    setCustomerName(''); setCustomerRef(''); setType('')
  }

  const master = myActiveActivity && db.activitiesMaster.find((a) => a.name === myActiveActivity.type)

  return (
    <div>
      <h1 className="page-title">Operations Execution</h1>
      <p className="page-sub">Start, track and complete warehouse activities. One active task per user.</p>

      {myActiveActivity ? (
        <div className="card live-panel">
          <div className="spread">
            <div>
              <div className="row" style={{ marginBottom: 6 }}>
                <span className="pulse-dot" />
                <StatusBadge status={myActiveActivity.status} />
                {master?.storageType && (
                  <span className={'badge ' + (master.storageType === 'inbound' ? 'badge-brand' : 'badge-blue')}>
                    {master.storageType.toUpperCase()}
                  </span>
                )}
              </div>
              <h2 style={{ fontSize: 19 }}>{myActiveActivity.type}</h2>
              <p style={{ color: 'var(--ink-700)' }}>
                <b>{myActiveActivity.customerName}</b> · Ref {myActiveActivity.customerRef} · Started {fmtTime(myActiveActivity.startTime)}
              </p>
              <p style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
                Owner: {myActiveActivity.ownerName}
                {myActiveActivity.participants?.length > 0 && (
                  <> · Participants: {myActiveActivity.participants.map((p) => p.name).join(', ')}</>
                )}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="live-timer">{fmtDuration(activityDuration(myActiveActivity))}</div>
              <div className="row-end mt">
                {isOwner ? (
                  <>
                    {myActiveActivity.status === 'in_progress' ? (
                      <button className="btn btn-ghost" onClick={() => pauseActivity(myActiveActivity.id)}>⏸ Pause</button>
                    ) : (
                      <button className="btn btn-outline" onClick={() => resumeActivity(myActiveActivity.id)}>▶ Resume</button>
                    )}
                    <button className="btn btn-primary" onClick={() => setEndOpen(true)}>⏹ End Activity</button>
                  </>
                ) : (
                  <button className="btn btn-ghost" onClick={() => leaveActivity(myActiveActivity.id)}>🚪 Leave Activity</button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-title">▶️ Start New Activity</div>
          <div className="form-grid">
            <Field label="Customer Name" required>
              <Select
                value={customerName}
                onChange={(v) => { setCustomerName(v); setCustomerRef('') }}
                options={db.customers.map((c) => c.name)}
                placeholder="Select customer…"
              />
            </Field>
            <Field label="Customer Reference No" required>
              <input
                type="text"
                list="ref-options"
                value={customerRef}
                onChange={(e) => setCustomerRef(e.target.value)}
                placeholder="e.g. PO-1001"
                disabled={!customerName}
              />
              <datalist id="ref-options">
                {(customer?.references || []).map((r) => <option key={r} value={r} />)}
              </datalist>
            </Field>
            <Field label="Activity Type" required>
              <Select
                value={type}
                onChange={setType}
                options={db.activitiesMaster.map((a) => ({
                  value: a.name,
                  label: a.name + (a.storageType ? ` (${a.storageType})` : ''),
                }))}
                placeholder="Select activity…"
              />
            </Field>
          </div>
          <div className="row-end">
            <button className="btn btn-primary" disabled={!canStart} onClick={handleStart} title={needsCheckIn ? 'Check in first' : ''}>
              ▶ Start Activity
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">👥 Running Activities — Join as Participant</div>
        {otherRunning.length === 0 ? (
          <EmptyState icon="🤝" title="No other activities running right now" hint="When a colleague starts an activity you can join it here." />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Activity</th><th>Customer</th><th>Reference</th><th>Owner</th>
                  <th>Participants</th><th>Status</th><th className="num">Duration</th><th></th>
                </tr>
              </thead>
              <tbody>
                {otherRunning.map((a) => {
                  const joined = (a.participants || []).some((p) => p.userId === currentUser.userId)
                  return (
                    <tr key={a.id}>
                      <td><b>{a.type}</b></td>
                      <td>{a.customerName}</td>
                      <td>{a.customerRef}</td>
                      <td>{a.ownerName}</td>
                      <td>{(a.participants || []).map((p) => p.name).join(', ') || '—'}</td>
                      <td><StatusBadge status={a.status} /></td>
                      <td className="num">{fmtDuration(activityDuration(a))}</td>
                      <td>
                        {joined ? (
                          <button className="btn btn-sm btn-ghost" onClick={() => leaveActivity(a.id)}>Leave</button>
                        ) : (
                          <button
                            className="btn btn-sm btn-outline"
                            disabled={!!myActiveActivity || needsCheckIn}
                            onClick={() => joinActivity(a.id)}
                            title={myActiveActivity ? 'You already have an active task' : needsCheckIn ? 'Check in first' : ''}
                          >
                            Join
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {endOpen && myActiveActivity && <EndActivityModal activity={myActiveActivity} onClose={() => setEndOpen(false)} />}
    </div>
  )
}
