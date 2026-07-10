import React, { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Field, Select, StatusBadge, EmptyState } from '../components/ui.jsx'
import QtyLinesEditor, { validQtyLines, qtyLinesTotal } from '../components/QtyLinesEditor.jsx'
import { activityDuration, fmtDuration, fmtTime, num, storageTypeNames } from '../utils.js'

function useTick(active, intervalMs = 1000) {
  const [, setN] = useState(0)
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setN((n) => n + 1), intervalMs)
    return () => clearInterval(t)
  }, [active, intervalMs])
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
  // Offloading/Loading packages can also span several UOMs (recorded on the movement)
  const [pkgLines, setPkgLines] = useState([{ qty: '', uom: '' }])

  const storageTypes = useMemo(() => storageTypeNames(db), [db.storageTypes, db.storageRates])

  const needsVehicle = handlingMode === 'Container' || handlingMode === 'Trailer'
  const valid = isStorage
    ? num(cbm) > 0 &&
      storageTypeUsed &&
      handlingMode &&
      validQtyLines(pkgLines) &&
      (handlingMode === 'Loose' || (vehicleType && num(truckCount) > 0))
    : validQtyLines(qtyLines)

  function finish(forward) {
    let payload
    if (isStorage) {
      const cleanPkgs = pkgLines.map((l) => ({ qty: num(l.qty), uom: l.uom }))
      payload = {
        cbm: num(cbm), storageTypeUsed, handlingMode,
        vehicleType: needsVehicle ? vehicleType : null,
        truckCount: needsVehicle ? num(truckCount) : null,
        packageLines: cleanPkgs,
        packageQty: qtyLinesTotal(cleanPkgs),
        packageUom: cleanPkgs.length === 1 ? cleanPkgs[0].uom : null,
        forward,
      }
    } else {
      const cleanLines = qtyLines.map((l) => ({ qty: num(l.qty), uom: l.uom }))
      payload = {
        qtyLines: cleanLines,
        qty: qtyLinesTotal(cleanLines),
        uom: cleanLines.length === 1 ? cleanLines[0].uom : null,
        forward,
      }
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
            <>
              {needsVehicle && (
                <div className="form-grid">
                  <Field label="Vehicle Type" required>
                    <Select value={vehicleType} onChange={setVehicleType} options={db.vehicleTypes.map((v) => v.name)} placeholder="Select vehicle…" />
                  </Field>
                  <Field label="No. of Trucks" required>
                    <input type="number" min="1" step="1" value={truckCount} onChange={(e) => setTruckCount(e.target.value)} />
                  </Field>
                </div>
              )}
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-700)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '4px 0 8px' }}>
                Packages — add a line per UOM (e.g. 1 PLT + 10 CTN + 600 PCS)
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
        </>
      ) : (
        <>
          <div className="banner banner-info">
            💡 One job can be chargeable in several UOMs — add a line per UOM (e.g. 1 PLT + 10 CTN + 600 PCS). Each line becomes a separate billing charge.
          </div>
          <QtyLinesEditor lines={qtyLines} onChange={setQtyLines} uoms={db.uoms.map((u) => u.name)} />
        </>
      )}

      <p style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 10 }}>
        <b>Forward</b> completes the activity and adds the job to the Pending Activity queue for the next step. <b>Finish</b> completes the activity and closes any matching pending assignment.
      </p>
    </Modal>
  )
}

const ASSIGN_ROLES = ['Admin', 'Supervisor', 'Developer']
const EXECUTE_ROLES = ['User', 'Developer']

export default function OperationsExecution() {
  const {
    db, currentUser, needsCheckIn, myActiveActivity,
    addActivity, startAssignedActivity, pauseActivity, resumeActivity, joinActivity, leaveActivity, remove,
    prefill, setPrefill, toast,
  } = useStore()
  const hasLive = !!myActiveActivity || db.operationsActivities.some((a) => a.status !== 'complete')
  useTick(hasLive)

  const canAssign = ASSIGN_ROLES.includes(currentUser.role)
  const canExecute = EXECUTE_ROLES.includes(currentUser.role)

  const [customerName, setCustomerName] = useState('')
  const [customerRef, setCustomerRef] = useState('')
  const [type, setType] = useState('')
  const [assignTo, setAssignTo] = useState('')
  const [endOpen, setEndOpen] = useState(false)
  const [fromPending, setFromPending] = useState(false)

  // Prefill hand-off from Pending Activity → the Add Activity form
  useEffect(() => {
    if (prefill) {
      if (canAssign) {
        setCustomerName(prefill.customerName || '')
        setCustomerRef(prefill.customerRef || '')
        setType('')
        setFromPending(true)
        toast(`Add-activity form pre-filled from pending job: ${prefill.customerName} (${prefill.customerRef})`, 'info')
      }
      setPrefill(null)
    }
  }, [prefill, setPrefill, toast, canAssign])

  const customer = db.customers.find((c) => c.name === customerName)
  const canAddSubmit = customerName && customerRef.trim() && type
  const isOwner = myActiveActivity && myActiveActivity.owner === currentUser.userId
  const userOptions = db.users.filter((u) => u.active && u.role === 'User').map((u) => ({ value: u.userId, label: u.name }))

  // Activities this user can pick up: assigned to them, or left unassigned.
  const myAssigned = db.operationsActivities.filter(
    (a) => a.status === 'assigned' && (!a.assignedTo || a.assignedTo === currentUser.userId),
  )
  // All not-yet-complete activities, for the assign overview.
  const openActivities = db.operationsActivities.filter((a) => a.status !== 'complete')
  // Running (started) activities owned by someone else — joinable as participant.
  const otherRunning = db.operationsActivities.filter(
    (a) => (a.status === 'in_progress' || a.status === 'paused') && a.owner !== currentUser.userId,
  )

  function handleAdd() {
    addActivity({ customerName, customerRef: customerRef.trim(), type, assignedTo: assignTo })
    setCustomerName(''); setCustomerRef(''); setType(''); setAssignTo(''); setFromPending(false)
  }

  const master = myActiveActivity && db.activitiesMaster.find((a) => a.name === myActiveActivity.type)

  return (
    <div>
      <h1 className="page-title">Operations Execution</h1>
      <p className="page-sub">
        {canAssign
          ? 'Add and assign warehouse activities. Users pick up and execute their assigned work.'
          : 'Pick up and execute the activities assigned to you. One active task at a time.'}
      </p>

      {/* Live panel — the executor's currently running activity */}
      {canExecute && myActiveActivity && (
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
      )}

      {/* Add Activity — Admin / Supervisor */}
      {canAssign && (
        <div className="card">
          <div className="card-title">➕ Add Activity {fromPending && <span className="badge badge-brand" style={{ marginLeft: 8, fontSize: 11 }}>From Pending Job</span>}</div>
          {fromPending && (
            <p style={{ color: 'var(--ink-400)', fontSize: 13, marginBottom: 8 }}>
              Customer and reference are pre-filled from the forwarded job.{' '}
              <button className="btn-link" style={{ fontSize: 13 }} onClick={() => { setFromPending(false); setCustomerName(''); setCustomerRef(''); setType('') }}>Clear</button>
            </p>
          )}
          <div className="form-grid">
            <Field label="Customer Name" required>
              <Select
                value={customerName}
                onChange={(v) => { setCustomerName(v); setCustomerRef(''); setFromPending(false) }}
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
            <Field label="Assign To" hint="Leave empty so any user can pick it up">
              <Select value={assignTo} onChange={setAssignTo} options={userOptions} placeholder="Any user (unassigned)" />
            </Field>
          </div>
          <div className="row-end">
            <button className="btn btn-primary" disabled={!canAddSubmit} onClick={handleAdd}>➕ Add Activity</button>
          </div>
        </div>
      )}

      {/* My Assigned Activities — Users pick these up */}
      {canExecute && !myActiveActivity && (
        <div className="card">
          <div className="card-title">📋 My Assigned Activities</div>
          {myAssigned.length === 0 ? (
            <EmptyState icon="📋" title="No activities assigned to you" hint="When a supervisor adds an activity for you (or leaves one unassigned), it appears here to start." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Activity</th><th>Customer</th><th>Reference</th><th>Assigned To</th><th>Added By</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {myAssigned.map((a) => (
                    <tr key={a.id}>
                      <td><b>{a.type}</b>{a.storageType && <span className={'badge ' + (a.storageType === 'inbound' ? 'badge-brand' : 'badge-blue')} style={{ marginLeft: 6 }}>{a.storageType.toUpperCase()}</span>}</td>
                      <td>{a.customerName}</td>
                      <td>{a.customerRef}</td>
                      <td>{a.assignedToName || <span className="badge badge-gray">ANY USER</span>}</td>
                      <td>{a.createdByName || '—'}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={!!myActiveActivity || needsCheckIn}
                          onClick={() => startAssignedActivity(a.id)}
                          title={myActiveActivity ? 'You already have an active task' : needsCheckIn ? 'Check in first' : 'Start executing this activity'}
                        >
                          ▶ Start Activity
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Assigned & Running overview — Admin / Supervisor */}
      {canAssign && (
        <div className="card">
          <div className="card-title">🗂️ Assigned &amp; Running Activities</div>
          {openActivities.length === 0 ? (
            <EmptyState icon="🗂️" title="No open activities" hint="Add an activity above to assign work to your users." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Activity</th><th>Customer</th><th>Reference</th><th>Assigned To</th>
                    <th>Status</th><th>Being Done By</th><th className="num">Duration</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {openActivities.map((a) => (
                    <tr key={a.id}>
                      <td><b>{a.type}</b></td>
                      <td>{a.customerName}</td>
                      <td>{a.customerRef}</td>
                      <td>{a.assignedToName || <span className="badge badge-gray">ANY USER</span>}</td>
                      <td><StatusBadge status={a.status} /></td>
                      <td>{a.ownerName || '—'}</td>
                      <td className="num">{a.status === 'assigned' ? '—' : fmtDuration(activityDuration(a))}</td>
                      <td>
                        {a.status === 'assigned' && (
                          <button className="btn btn-sm btn-danger" onClick={() => window.confirm('Remove this assigned activity?') && remove('operationsActivities', a.id, { entityType: 'Operations', label: 'assigned activity' })}>✕</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Join as participant — Users */}
      {canExecute && (
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
      )}

      {endOpen && myActiveActivity && <EndActivityModal activity={myActiveActivity} onClose={() => setEndOpen(false)} />}
    </div>
  )
}
