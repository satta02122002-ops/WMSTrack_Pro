import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { StatusBadge, EmptyState, Select } from '../components/ui.jsx'
import { fmtDate } from '../utils.js'

export default function PendingActivity({ setPage }) {
  const { db, setPrefill, myActiveActivity, needsCheckIn } = useStore()
  const [statusFilter, setStatusFilter] = useState('Pending')

  const rows = db.pendingAssignments
    .filter((p) => !statusFilter || p.status === statusFilter)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

  function startFromPending(p) {
    setPrefill({ customerName: p.customerName, customerRef: p.customerRef })
    setPage('operations')
  }

  return (
    <div>
      <h1 className="page-title">Pending Activity</h1>
      <p className="page-sub">Queue of forwarded customer jobs waiting for the next activity.</p>

      <div className="card">
        <div className="spread" style={{ marginBottom: 12 }}>
          <div className="row">
            <Select value={statusFilter} onChange={setStatusFilter} options={['Pending', 'Done']} placeholder="All statuses" style={{ width: 160 }} />
          </div>
          <span className="badge badge-brand">{rows.length} row(s)</span>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon="🕘"
            title="No pending activities"
            hint="When someone ends an activity with Forward, the job appears here for the next step."
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Customer Name</th><th>Customer Ref</th><th>Date</th>
                  <th>Last Activity</th><th>Forwarded By</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td><b>{p.customerName}</b></td>
                    <td>{p.customerRef}</td>
                    <td>{fmtDate(p.date)}</td>
                    <td>{p.lastActivityName}</td>
                    <td>{p.forwardedFromUser}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td>
                      {p.status === 'Pending' && (
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={!!myActiveActivity || needsCheckIn}
                          onClick={() => startFromPending(p)}
                          title={myActiveActivity ? 'You already have an active task' : needsCheckIn ? 'Check in first' : 'Pre-fill Operations Execution with this job'}
                        >
                          ▶ Start Activity
                        </button>
                      )}
                    </td>
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
