import { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { EmptyState, Select } from '../components/ui.jsx'
import { fmtDateTime } from '../utils.js'
import { exportXlsx } from '../excel.js'

export default function ActivityLog() {
  const { db } = useStore()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [user, setUser] = useState('')
  const [entity, setEntity] = useState('')
  const [search, setSearch] = useState('')

  const users = useMemo(() => [...new Set(db.auditLog.map((l) => l.user))], [db.auditLog])
  const entities = useMemo(() => [...new Set(db.auditLog.map((l) => l.entityType))], [db.auditLog])

  const rows = useMemo(
    () =>
      db.auditLog.filter((l) => {
        const d = l.dateTime.slice(0, 10)
        if (from && d < from) return false
        if (to && d > to) return false
        if (user && l.user !== user) return false
        if (entity && l.entityType !== entity) return false
        if (search && !`${l.action} ${l.details}`.toLowerCase().includes(search.toLowerCase())) return false
        return true
      }),
    [db.auditLog, from, to, user, entity, search],
  )

  return (
    <div>
      <h1 className="page-title">Activity Log</h1>
      <p className="page-sub">Audit trail of all significant user actions (most recent first, capped at 5,000 entries).</p>

      <div className="card">
        <div className="spread" style={{ marginBottom: 12 }}>
          <div className="row">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <Select value={user} onChange={setUser} options={users} placeholder="All users" style={{ width: 170 }} />
            <Select value={entity} onChange={setEntity} options={entities} placeholder="All entities" style={{ width: 150 }} />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search details…" style={{ width: 180 }} />
          </div>
          <div className="row">
            <span className="badge badge-brand">{rows.length} entries</span>
            <button
              className="btn btn-sm btn-outline"
              disabled={!rows.length}
              onClick={() =>
                exportXlsx('activity_log.xlsx', rows.map((l) => ({
                  DateTime: l.dateTime, User: l.user, Action: l.action, 'Entity Type': l.entityType, Details: l.details,
                })), 'Activity Log')
              }
            >
              ⬇ Excel
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon="📜" title="No log entries match your filters" />
        ) : (
          <div className="table-wrap" style={{ maxHeight: 620, overflowY: 'auto' }}>
            <table className="data">
              <thead>
                <tr><th>Date / Time</th><th>User</th><th>Action</th><th>Entity Type</th><th>Details</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 500).map((l) => (
                  <tr key={l.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.dateTime)}</td>
                    <td><b>{l.user}</b></td>
                    <td><span className="badge badge-blue">{l.action}</span></td>
                    <td>{l.entityType}</td>
                    <td>{l.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 500 && <p style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 8 }}>Showing first 500 of {rows.length} matching entries — narrow the filters or export to Excel for the full set.</p>}
      </div>
    </div>
  )
}
