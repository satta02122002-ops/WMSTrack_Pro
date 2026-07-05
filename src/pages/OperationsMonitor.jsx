import React, { useEffect, useState } from 'react'
import { useStore } from '../store.jsx'
import { StatusBadge, EmptyState, Select } from '../components/ui.jsx'
import { activityDuration, fmtDuration, fmtDate, fmtTime, todayISO, qtyDisplay } from '../utils.js'
import { exportXlsx } from '../excel.js'

export default function OperationsMonitor() {
  const { db } = useStore()
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [customer, setCustomer] = useState('')

  const live = db.operationsActivities.filter((a) => a.status !== 'complete')
  const history = db.operationsActivities
    .filter((a) => a.status === 'complete')
    .filter((a) => (!from || a.date >= from) && (!to || a.date <= to) && (!customer || a.customerName === customer))
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
