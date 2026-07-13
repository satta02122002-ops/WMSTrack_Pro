import { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Field, Select, StatusBadge, EmptyState } from '../components/ui.jsx'
import QtyLinesEditor, { validQtyLines, qtyLinesTotal } from '../components/QtyLinesEditor.jsx'
import { fmtTime, num, storageTypeNames, HANDLING_UOMS } from '../utils.js'

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
  const [handlingUom, setHandlingUom] = useState('')
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

  function finish() {
    let payload
    if (isStorage) {
      const cleanPkgs = pkgLines.map((l) => ({ qty: num(l.qty), uom: l.uom }))
      payload = {
        cbm: num(cbm), storageTypeUsed, handlingMode,
        vehicleType: needsVehicle ? vehicleType : null,
        handlingUom: handlingUom || null,
        truckCount: needsVehicle ? num(truckCount) : null,
        packageLines: cleanPkgs,
        packageQty: qtyLinesTotal(cleanPkgs),
        packageUom: cleanPkgs.length === 1 ? cleanPkgs[0].uom : null,
        forward: false,
      }
    } else {
      const cleanLines = qtyLines.map((l) => ({ qty: num(l.qty), uom: l.uom }))
      payload = {
        qtyLines: cleanLines,
        qty: qtyLinesTotal(cleanLines),
        uom: cleanLines.length === 1 ? cleanLines[0].uom : null,
        forward: false,
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
          <button className="btn btn-primary" disabled={!valid} onClick={finish} title="Complete this activity and record it for billing">
            ✔ Finish
          </button>
        </>
      }
    >
      <div className="banner banner-brand" style={{ marginBottom: 14 }}>
        <b>{activity.customerName}</b>&nbsp;·&nbsp;{activity.customerRef}&nbsp;·&nbsp;Started {fmtTime(activity.startTime)}
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
              <div className="form-grid">
                <Field label="Handling UOM">
                  <Select value={handlingUom} onChange={setHandlingUom} options={HANDLING_UOMS} placeholder="—" />
                </Field>
              </div>
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
        <b>Finish</b> completes this activity and records it for billing. Other activities assigned for the same job stay in your queue.
      </p>
    </Modal>
  )
}

const ASSIGN_ROLES = ['Admin', 'Supervisor', 'Developer']
const EXECUTE_ROLES = ['User', 'Developer']

export default function OperationsExecution() {
  const {
    db, currentUser, needsCheckIn, myActiveActivity,
    addActivities, startAssignedActivity, pauseActivity, resumeActivity, joinActivity, leaveActivity, remove,
  } = useStore()
  const canAssign = ASSIGN_ROLES.includes(currentUser.role)
  const canExecute = EXECUTE_ROLES.includes(currentUser.role)

  const [customerName, setCustomerName] = useState('')
  const [customerRef, setCustomerRef] = useState('')
  const [types, setTypes] = useState(() => new Set())
  const [assignTo, setAssignTo] = useState('')
  const [endOpen, setEndOpen] = useState(false)

  const customer = db.customers.find((c) => c.name === customerName)
  const canAddSubmit = customerName && customerRef.trim() && types.size > 0
  const isOwner = myActiveActivity && myActiveActivity.owner === currentUser.userId
  const userOptions = db.users.filter((u) => u.active && u.role === 'User').map((u) => ({ value: u.userId, label: u.name }))

  function toggleType(name) {
    setTypes((s) => {
      const n = new Set(s)
      n.has(name) ? n.delete(name) : n.add(name)
      return n
    })
  }
  function clearJob() {
    setCustomerName(''); setCustomerRef(''); setTypes(new Set()); setAssignTo('')
  }

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
    addActivities({ customerName, customerRef: customerRef.trim(), types: [...types], assignedTo: assignTo })
    // Keep the job (customer / reference / assignee) so more activities can be
    // added for the same job; only clear the selected activity types.
    setTypes(new Set())
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
          <div className="card-title">➕ Add Activities</div>
          <p style={{ color: 'var(--ink-500)', fontSize: 13, marginBottom: 10 }}>
            Pick the job once, then select one or more activities — each becomes a separate assigned task. After adding, the customer and reference stay so you can add more activities to the same job.
          </p>
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
            <Field label="Assign To" hint="Leave empty so any user can pick it up">
              <Select value={assignTo} onChange={setAssignTo} options={userOptions} placeholder="Any user (unassigned)" />
            </Field>
          </div>
          <Field label="Activities" required hint="Select one or more — one assigned task is created per activity">
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {db.activitiesMaster.map((a) => (
                <label key={a.id} className="checkbox-row" style={{ border: '1px solid var(--ink-200)', borderRadius: 8, padding: '5px 10px' }}>
                  <input type="checkbox" checked={types.has(a.name)} onChange={() => toggleType(a.name)} />
                  {a.name}{a.storageType ? ` (${a.storageType})` : ''}
                </label>
              ))}
            </div>
          </Field>
          <div className="spread" style={{ marginTop: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={clearJob} disabled={!customerName && !customerRef && types.size === 0}>Clear</button>
            <button className="btn btn-primary" disabled={!canAddSubmit} onClick={handleAdd}>
              ➕ Add {types.size > 0 ? types.size : ''} Activit{types.size === 1 ? 'y' : 'ies'}
            </button>
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
                    <th>Status</th><th>Being Done By</th><th>Started</th><th></th>
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
                      <td>{fmtTime(a.startTime)}</td>
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
                    <th>Participants</th><th>Status</th><th>Started</th><th></th>
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
                        <td>{fmtTime(a.startTime)}</td>
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
