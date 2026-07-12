import { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Field, Select, EmptyState, KPI } from '../components/ui.jsx'
import { fmtDate, fmtTime, fmtNum, num, round2, todayISO, firstOfMonthISO } from '../utils.js'
import { exportXlsx } from '../excel.js'

function EditAttendanceModal({ record, onClose }) {
  const { upsert, toast } = useStore()
  const [ci, setCi] = useState(record.checkInTime ? record.checkInTime.slice(0, 16) : '')
  const [co, setCo] = useState(record.checkOutTime ? record.checkOutTime.slice(0, 16) : '')

  function save() {
    const checkInTime = ci ? new Date(ci).toISOString() : null
    const checkOutTime = co ? new Date(co).toISOString() : null
    const hoursReported = checkInTime && checkOutTime ? round2((new Date(checkOutTime) - new Date(checkInTime)) / 3600000) : null
    upsert('attendance', { ...record, checkInTime, checkOutTime, hoursReported }, { entityType: 'Attendance', label: 'attendance record' })
    toast('Attendance record updated')
    onClose()
  }

  return (
    <Modal title={`Edit Attendance — ${record.userName} (${fmtDate(record.date)})`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!ci} onClick={save}>Save</button></>}>
      <Field label="Check-in time" required>
        <input type="datetime-local" value={ci} onChange={(e) => setCi(e.target.value)} />
      </Field>
      <Field label="Check-out time" hint="Leave empty if still on shift">
        <input type="datetime-local" value={co} onChange={(e) => setCo(e.target.value)} />
      </Field>
    </Modal>
  )
}

export default function Attendance() {
  const { db, currentUser, remove } = useStore()
  const [from, setFrom] = useState(firstOfMonthISO())
  const [to, setTo] = useState(todayISO())
  const [userFilter, setUserFilter] = useState('')
  const [editRec, setEditRec] = useState(null)

  const isDev = currentUser?.role === 'Developer'

  const rows = useMemo(
    () =>
      db.attendance
        .filter((a) => (!from || a.date >= from) && (!to || a.date <= to) && (!userFilter || a.userId === userFilter))
        .sort((a, b) => b.date.localeCompare(a.date) || (b.checkInTime || '').localeCompare(a.checkInTime || '')),
    [db.attendance, from, to, userFilter],
  )

  const todayRows = db.attendance.filter((a) => a.date === todayISO())
  const presentNow = todayRows.filter((a) => !a.checkOutTime)
  const totalHours = round2(rows.reduce((s, a) => s + num(a.hoursReported), 0))

  return (
    <div>
      <h1 className="page-title">Attendance</h1>
      <p className="page-sub">Shift check-in/out records, daily status and attendance reports.</p>

      <div className="kpi-grid">
        <KPI label="Present right now" value={presentNow.length} sub={presentNow.map((a) => a.userName).join(', ') || 'Nobody on shift'} tone="green" />
        <KPI label="Shifts today" value={todayRows.length} />
        <KPI label="Shifts in range" value={rows.length} tone="blue" />
        <KPI label="Hours in range" value={fmtNum(totalHours)} tone="amber" />
      </div>

      <div className="card">
        <div className="card-title">📍 Daily Status — {fmtDate(todayISO())}</div>
        {todayRows.length === 0 ? (
          <EmptyState icon="🕒" title="No check-ins today yet" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>User</th><th>Check-In</th><th>Check-Out</th><th className="num">Hours</th><th>Status</th></tr></thead>
              <tbody>
                {todayRows.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.userName}</b></td>
                    <td>{fmtTime(a.checkInTime)}</td>
                    <td>{a.checkOutTime ? fmtTime(a.checkOutTime) : '—'}</td>
                    <td className="num">{a.hoursReported != null ? fmtNum(a.hoursReported) : '—'}</td>
                    <td>{a.checkOutTime ? <span className="badge badge-gray">SHIFT ENDED</span> : <span className="badge badge-green">PRESENT</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="spread" style={{ marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>📋 Attendance Records</div>
          <div className="row">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <Select value={userFilter} onChange={setUserFilter} options={db.users.map((u) => ({ value: u.userId, label: u.name }))} placeholder="All users" style={{ width: 180 }} />
            <button
              className="btn btn-sm btn-outline"
              disabled={!rows.length}
              onClick={() =>
                exportXlsx(`attendance_${from}_${to}.xlsx`, rows.map((a) => ({
                  Date: a.date, User: a.userName, 'User ID': a.userId,
                  'Check-In': a.checkInTime ? fmtTime(a.checkInTime) : '', 'Check-Out': a.checkOutTime ? fmtTime(a.checkOutTime) : '',
                  Hours: a.hoursReported ?? '',
                })), 'Attendance')
              }
            >
              ⬇ Excel
            </button>
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon="📋" title="No attendance records in range" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Date</th><th>User</th><th>Check-In</th><th>Check-Out</th><th className="num">Hours</th>{isDev && <th></th>}</tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>{fmtDate(a.date)}</td>
                    <td><b>{a.userName}</b></td>
                    <td>{fmtTime(a.checkInTime)}</td>
                    <td>{a.checkOutTime ? fmtTime(a.checkOutTime) : '—'}</td>
                    <td className="num">{a.hoursReported != null ? fmtNum(a.hoursReported) : '—'}</td>
                    {isDev && (
                      <td>
                        <div className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
                          <button className="btn btn-sm btn-ghost" onClick={() => setEditRec(a)}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => window.confirm('Delete this attendance record?') && remove('attendance', a.id, { entityType: 'Attendance' })}>✕</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={4}>Total hours</td><td className="num">{fmtNum(totalHours)}</td>{isDev && <td></td>}</tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {editRec && <EditAttendanceModal record={editRec} onClose={() => setEditRec(null)} />}
    </div>
  )
}
