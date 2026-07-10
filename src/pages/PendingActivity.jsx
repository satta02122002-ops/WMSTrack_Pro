import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { StatusBadge, EmptyState, Select, Field } from '../components/ui.jsx'
import { fmtDate } from '../utils.js'

export default function PendingActivity({ setPage }) {
  const { db, setPrefill, currentUser } = useStore()
  const canAssign = ['Admin', 'Supervisor', 'Developer'].includes(currentUser.role)
  const [statusFilter, setStatusFilter] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [activityFilter, setActivityFilter] = useState('')

  const rows = db.pendingAssignments
    .filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false
      if (customerFilter && p.customerName !== customerFilter) return false
      if (activityFilter && p.lastActivityName !== activityFilter) return false
      return true
    })
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
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <Field label="Status">
            <Select value={statusFilter} onChange={setStatusFilter} options={[{ value: 'Pending', label: 'Ongoing' }, { value: 'Done', label: 'Completed' }]} placeholder="All" />
          </Field>
          <Field label="Customer">
            <Select value={customerFilter} onChange={setCustomerFilter} options={db.customers.map((c) => c.name)} placeholder="All customers" />
          </Field>
          <Field label="Activity">
            <Select value={activityFilter} onChange={setActivityFilter} options={db.activitiesMaster.map((a) => a.name)} placeholder="All activities" />
          </Field>
        </div>
        <div className="spread" style={{ marginBottom: 12 }}>
          <span className="badge badge-brand">{rows.length} row(s)</span>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon="🕘"
            title="No pending activities"
            hint="Assign work directly on Operations Execution — pick a job and add one or more activities for it."
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
                      {p.status === 'Pending' && canAssign && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => startFromPending(p)}
                          title="Pre-fill the Add Activity form with this job"
                        >
                          ➕ Add Activity
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
