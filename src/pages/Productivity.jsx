import { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { EmptyState, Select, KPI } from '../components/ui.jsx'
import { fmtNum, num, round2, todayISO, firstOfMonthISO } from '../utils.js'
import { exportXlsx } from '../excel.js'

export default function Productivity() {
  const { db } = useStore()
  const [from, setFrom] = useState(firstOfMonthISO())
  const [to, setTo] = useState(todayISO())
  const [userFilter, setUserFilter] = useState('')

  /** Per user/date: attendance hours vs activity hours (as owner or participant). */
  const rows = useMemo(() => {
    const map = new Map() // `${userId}|${date}` -> row
    const key = (u, d) => `${u}|${d}`
    const inRange = (d) => (!from || d >= from) && (!to || d <= to)

    for (const a of db.attendance) {
      if (!inRange(a.date) || (userFilter && a.userId !== userFilter)) continue
      const k = key(a.userId, a.date)
      const r = map.get(k) || { userId: a.userId, userName: a.userName, date: a.date, attendanceHours: 0, activityHours: 0, activities: 0 }
      r.attendanceHours = round2(r.attendanceHours + num(a.hoursReported))
      map.set(k, r)
    }
    for (const act of db.operationsActivities) {
      if (act.status !== 'complete' || !inRange(act.date)) continue
      const involved = [{ userId: act.owner, name: act.ownerName }, ...(act.participants || [])]
      for (const u of involved) {
        if (userFilter && u.userId !== userFilter) continue
        const k = key(u.userId, act.date)
        const r = map.get(k) || { userId: u.userId, userName: u.name, date: act.date, attendanceHours: 0, activityHours: 0, activities: 0 }
        r.activityHours = round2(r.activityHours + num(act.durationSeconds) / 3600)
        r.activities += 1
        map.set(k, r)
      }
    }
    return [...map.values()]
      .map((r) => ({ ...r, productivity: r.attendanceHours > 0 ? round2((r.activityHours / r.attendanceHours) * 100) : null }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.userName.localeCompare(b.userName))
  }, [db.attendance, db.operationsActivities, from, to, userFilter])

  const byUser = useMemo(() => {
    const m = new Map()
    for (const r of rows) {
      const u = m.get(r.userId) || { userName: r.userName, attendanceHours: 0, activityHours: 0, activities: 0, days: 0 }
      u.attendanceHours = round2(u.attendanceHours + r.attendanceHours)
      u.activityHours = round2(u.activityHours + r.activityHours)
      u.activities += r.activities
      u.days += 1
      m.set(r.userId, u)
    }
    return [...m.entries()].map(([userId, u]) => ({
      userId, ...u,
      productivity: u.attendanceHours > 0 ? round2((u.activityHours / u.attendanceHours) * 100) : null,
    }))
  }, [rows])

  const totAtt = round2(rows.reduce((s, r) => s + r.attendanceHours, 0))
  const totAct = round2(rows.reduce((s, r) => s + r.activityHours, 0))

  return (
    <div>
      <h1 className="page-title">Productivity</h1>
      <p className="page-sub">Productivity % = time spent on tracked activities ÷ attendance hours.</p>

      <div className="kpi-grid">
        <KPI label="Attendance hours" value={fmtNum(totAtt)} />
        <KPI label="Activity hours" value={fmtNum(totAct)} tone="blue" />
        <KPI label="Overall productivity" value={totAtt > 0 ? fmtNum((totAct / totAtt) * 100, 1) + '%' : '—'} tone="green" />
        <KPI label="User-days tracked" value={rows.length} tone="amber" />
      </div>

      <div className="card">
        <div className="spread" style={{ marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Per User Summary</div>
          <div className="row">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <Select value={userFilter} onChange={setUserFilter} options={db.users.map((u) => ({ value: u.userId, label: u.name }))} placeholder="All users" style={{ width: 180 }} />
            <button
              className="btn btn-sm btn-outline"
              disabled={!rows.length}
              onClick={() =>
                exportXlsx(`productivity_${from}_${to}.xlsx`, rows.map((r) => ({
                  Date: r.date, User: r.userName, 'Attendance Hours': r.attendanceHours,
                  'Activity Hours': r.activityHours, Activities: r.activities,
                  'Productivity %': r.productivity ?? '',
                })), 'Productivity')
              }
            >
              ⬇ Excel
            </button>
          </div>
        </div>

        {byUser.length === 0 ? (
          <EmptyState icon="📈" title="No data for this range" hint="Productivity needs completed activities and attendance records." />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>User</th><th className="num">Days</th><th className="num">Attendance Hrs</th><th className="num">Activity Hrs</th><th className="num">Activities</th><th className="num">Productivity %</th></tr>
              </thead>
              <tbody>
                {byUser.map((u) => (
                  <tr key={u.userId}>
                    <td><b>{u.userName}</b></td>
                    <td className="num">{u.days}</td>
                    <td className="num">{fmtNum(u.attendanceHours)}</td>
                    <td className="num">{fmtNum(u.activityHours)}</td>
                    <td className="num">{u.activities}</td>
                    <td className="num">
                      {u.productivity != null ? (
                        <span className={'badge ' + (u.productivity >= 70 ? 'badge-green' : u.productivity >= 40 ? 'badge-amber' : 'badge-red')}>
                          {fmtNum(u.productivity, 1)}%
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Daily Detail</div>
        {rows.length === 0 ? (
          <EmptyState icon="🗓️" title="No daily records" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Date</th><th>User</th><th className="num">Attendance Hrs</th><th className="num">Activity Hrs</th><th className="num">Activities</th><th className="num">Productivity %</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId + r.date}>
                    <td>{r.date}</td>
                    <td><b>{r.userName}</b></td>
                    <td className="num">{fmtNum(r.attendanceHours)}</td>
                    <td className="num">{fmtNum(r.activityHours)}</td>
                    <td className="num">{r.activities}</td>
                    <td className="num">{r.productivity != null ? fmtNum(r.productivity, 1) + '%' : '—'}</td>
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
