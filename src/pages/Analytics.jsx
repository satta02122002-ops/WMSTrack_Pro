import React, { useMemo, useState } from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  ArcElement, RadialLinearScale, Tooltip, Legend, Filler,
} from 'chart.js'
import { Bar, Line, Pie, Doughnut, Bubble, Radar } from 'react-chartjs-2'
import { useStore } from '../store.jsx'
import { KPI, EmptyState, Select, Field } from '../components/ui.jsx'
import { fmtNum, num, round2, todayISO, toISODate, monthKey, accountHolderOf, accountHolderNames, customerNames } from '../utils.js'
import { computeBillingLines } from '../billing.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, RadialLinearScale, Tooltip, Legend, Filler)

// Validated categorical palette — fixed slot order (dataviz reference palette, light mode)
const PALETTE = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834']
// Sequential blue ramp (light surface) for heatmap / ordinal funnel
const SEQ = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281']

const INK = '#334155'
const GRID = 'rgba(148, 163, 184, 0.18)'

const baseOpts = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { padding: 10 } },
  scales: {
    x: { grid: { display: false }, ticks: { color: INK, font: { size: 11 } } },
    y: { grid: { color: GRID }, ticks: { color: INK, font: { size: 11 } }, beginAtZero: true },
  },
}
const legendOpts = { display: true, position: 'bottom', labels: { color: INK, boxWidth: 12, font: { size: 11 } } }

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toISODate(d)
}

export default function Analytics() {
  const { db } = useStore()
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(todayISO())
  const [customerFilter, setCustomerFilter] = useState('')
  const [accountHolderFilter, setAccountHolderFilter] = useState('')
  const [activityFilter, setActivityFilter] = useState('')

  const data = useMemo(() => {
    const inRange = (d) => (!from || d >= from) && (!to || d <= to)
    const ahOk = (c) => !accountHolderFilter || accountHolderOf(db, c) === accountHolderFilter
    const acts = db.operationsActivities.filter((a) => {
      if (a.status !== 'complete' || !inRange(a.date)) return false
      if (customerFilter && a.customerName !== customerFilter) return false
      if (!ahOk(a.customerName)) return false
      if (activityFilter && a.type !== activityFilter) return false
      return true
    })
    const movements = db.storageMovements.filter((m) => {
      if (!inRange(m.date)) return false
      if (customerFilter && m.customer !== customerFilter) return false
      if (!ahOk(m.customer)) return false
      return true
    })
    const attendance = db.attendance.filter((a) => inRange(a.date))

    // revenue via billing engine across the months the range touches
    const periods = new Set([...acts.map((a) => monthKey(a.date)), ...movements.map((m) => monthKey(m.date)), ...db.vasCharges.filter((v) => inRange(v.date)).map((v) => monthKey(v.date))])
    const billLines = []
    for (const p of periods) billLines.push(...computeBillingLines(db, p).filter((l) => {
      if (!inRange(l.date)) return false
      if (customerFilter && l.customerName !== customerFilter) return false
      if (!ahOk(l.customerName)) return false
      if (activityFilter && l.source === 'activity' && l.activity !== activityFilter) return false
      return true
    }))

    // stable entity order from master data
    const typeOrder = db.activitiesMaster.map((a) => a.name).filter((n) => acts.some((a) => a.type === n))
    const custOrder = db.customers.map((c) => c.name)

    const byType = new Map(typeOrder.map((t) => [t, { count: 0, qty: 0, durH: 0 }]))
    for (const a of acts) {
      const r = byType.get(a.type) || { count: 0, qty: 0, durH: 0 }
      r.count += 1
      r.qty += num(a.qty)
      r.durH += num(a.durationSeconds) / 3600
      byType.set(a.type, r)
    }

    const byDay = new Map()
    for (const a of acts) byDay.set(a.date, (byDay.get(a.date) || 0) + 1)
    const days = [...byDay.keys()].sort()
    let cum = 0
    const cumSeries = days.map((d) => (cum += byDay.get(d)))

    const cbmIn = round2(movements.filter((m) => m.type === 'Inbound').reduce((s, m) => s + num(m.cbm), 0))
    const cbmOut = round2(movements.filter((m) => m.type === 'Outbound').reduce((s, m) => s + num(m.cbm), 0))

    const cbmByCust = new Map()
    for (const m of movements) cbmByCust.set(m.customer, round2((cbmByCust.get(m.customer) || 0) + num(m.cbm)))

    const revByCust = new Map()
    for (const l of billLines) revByCust.set(l.customerName, round2((revByCust.get(l.customerName) || 0) + num(l.totalValue)))

    // histogram of durations (30-min buckets up to 4h+)
    const buckets = [0, 30, 60, 90, 120, 180, 240]
    const histo = new Array(buckets.length).fill(0)
    for (const a of acts) {
      const min = num(a.durationSeconds) / 60
      let idx = buckets.findIndex((b, i) => i === buckets.length - 1 || min < buckets[i + 1])
      histo[idx === -1 ? buckets.length - 1 : idx] += 1
    }

    // attendance aggregations
    const attByUser = new Map()
    for (const a of attendance) attByUser.set(a.userName, round2((attByUser.get(a.userName) || 0) + num(a.hoursReported)))
    const attByDay = new Map()
    for (const a of attendance) attByDay.set(a.date, round2((attByDay.get(a.date) || 0) + num(a.hoursReported)))
    const attDays = [...attByDay.keys()].sort()

    // productivity per user
    const actHoursByUser = new Map()
    for (const a of acts) {
      for (const u of [{ userId: a.owner, name: a.ownerName }, ...(a.participants || [])]) {
        actHoursByUser.set(u.name, round2((actHoursByUser.get(u.name) || 0) + num(a.durationSeconds) / 3600))
      }
    }
    const prodByUser = [...attByUser.entries()].map(([name, attH]) => ({
      name, pct: attH > 0 ? round2(((actHoursByUser.get(name) || 0) / attH) * 100) : 0,
    }))

    // heatmap: day of week x activity type
    const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const heat = new Map() // `${type}|${dowIdx}` -> count
    let heatMax = 0
    for (const a of acts) {
      const dow = (new Date(a.date + 'T00:00:00').getDay() + 6) % 7
      const k = `${a.type}|${dow}`
      const v = (heat.get(k) || 0) + 1
      heat.set(k, v)
      heatMax = Math.max(heatMax, v)
    }

    const totalDurH = acts.reduce((s, a) => s + num(a.durationSeconds) / 3600, 0)
    const totalAttH = round2(attendance.reduce((s, a) => s + num(a.hoursReported), 0))

    return {
      acts, movements, attendance, typeOrder, custOrder,
      byType, days, byDay, cumSeries, cbmIn, cbmOut, cbmByCust, revByCust,
      buckets, histo, attByUser, attDays, attByDay, prodByUser, dows, heat, heatMax,
      kpis: {
        totalActivities: acts.length,
        totalQty: round2(acts.reduce((s, a) => s + num(a.qty), 0)),
        storageCbm: round2(cbmIn + cbmOut),
        revenue: round2(billLines.reduce((s, l) => s + num(l.totalValue), 0)),
        avgDurMin: acts.length ? round2((totalDurH * 60) / acts.length) : 0,
        attendanceHours: totalAttH,
        shifts: attendance.length,
        avgProductivity: totalAttH > 0 ? round2((totalDurH / totalAttH) * 100) : 0,
        activeUsers: new Set(attendance.map((a) => a.userId)).size,
      },
    }
  }, [db, from, to, customerFilter, accountHolderFilter, activityFilter])

  const k = data.kpis
  const typeLabels = [...data.byType.keys()]
  const typeColor = (t) => PALETTE[db.activitiesMaster.findIndex((a) => a.name === t) % PALETTE.length]
  const custColor = (c) => PALETTE[data.custOrder.indexOf(c) % PALETTE.length]

  if (data.acts.length === 0 && data.movements.length === 0 && data.attendance.length === 0) {
    return (
      <div>
        <h1 className="page-title">Performance Analytics</h1>
        <p className="page-sub">KPIs and operational charts.</p>
        <div className="card">
          <div className="form-grid" style={{ marginBottom: 10 }}>
            <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <Field label="Customer"><Select value={customerFilter} onChange={setCustomerFilter} options={customerNames(db, accountHolderFilter)} placeholder="All customers" /></Field>
            <Field label="Account Holder"><Select value={accountHolderFilter} onChange={(v) => { setAccountHolderFilter(v); if (v && accountHolderOf(db, customerFilter) !== v) setCustomerFilter('') }} options={accountHolderNames(db)} placeholder="All account holders" /></Field>
            <Field label="Activity"><Select value={activityFilter} onChange={setActivityFilter} options={db.activitiesMaster.map((a) => a.name)} placeholder="All activities" /></Field>
          </div>
          <EmptyState icon="📊" title="No data in this date range" hint="Complete some activities or widen the range." />
        </div>
      </div>
    )
  }

  const funnelSorted = typeLabels.map((t) => [t, data.byType.get(t).count]).sort((a, b) => b[1] - a[1])

  return (
    <div>
      <h1 className="page-title">Performance Analytics</h1>
      <p className="page-sub">Warehouse KPIs and operational charts. Revenue combines all currencies at face value.</p>

      <div className="card" style={{ padding: 12 }}>
        <div className="form-grid">
          <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Customer"><Select value={customerFilter} onChange={setCustomerFilter} options={customerNames(db, accountHolderFilter)} placeholder="All customers" /></Field>
          <Field label="Account Holder"><Select value={accountHolderFilter} onChange={(v) => { setAccountHolderFilter(v); if (v && accountHolderOf(db, customerFilter) !== v) setCustomerFilter('') }} options={accountHolderNames(db)} placeholder="All account holders" /></Field>
          <Field label="Activity"><Select value={activityFilter} onChange={setActivityFilter} options={db.activitiesMaster.map((a) => a.name)} placeholder="All activities" /></Field>
        </div>
      </div>

      <div className="kpi-grid">
        <KPI label="Total Activities" value={k.totalActivities} />
        <KPI label="Total Quantity" value={fmtNum(k.totalQty, 0)} tone="blue" />
        <KPI label="Storage CBM" value={fmtNum(k.storageCbm)} />
        <KPI label="Total Revenue" value={fmtNum(k.revenue)} sub="all currencies" tone="green" />
        <KPI label="Avg Duration" value={`${fmtNum(k.avgDurMin, 0)} min`} tone="amber" />
        <KPI label="Attendance Hours" value={fmtNum(k.attendanceHours)} />
        <KPI label="Total Shifts" value={k.shifts} tone="blue" />
        <KPI label="Avg Productivity" value={`${fmtNum(k.avgProductivity, 1)}%`} tone="green" />
        <KPI label="Active Users" value={k.activeUsers} tone="amber" />
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <h4>Activities by Type</h4>
          <div className="chart-box">
            <Bar
              data={{
                labels: typeLabels,
                datasets: [{ data: typeLabels.map((t) => data.byType.get(t).count), backgroundColor: typeLabels.map(typeColor), borderRadius: 4, maxBarThickness: 42 }],
              }}
              options={baseOpts}
            />
          </div>
        </div>

        <div className="chart-card">
          <h4>Activities per Day</h4>
          <div className="chart-box">
            <Bar
              data={{ labels: data.days, datasets: [{ data: data.days.map((d) => data.byDay.get(d)), backgroundColor: '#2a78d6', borderRadius: 4, maxBarThickness: 24 }] }}
              options={baseOpts}
            />
          </div>
        </div>

        <div className="chart-card">
          <h4>Cumulative Activities</h4>
          <div className="chart-box">
            <Line
              data={{
                labels: data.days,
                datasets: [{ data: data.cumSeries, borderColor: '#2a78d6', borderWidth: 2, pointRadius: 0, pointHitRadius: 8, fill: true, backgroundColor: 'rgba(42, 120, 214, 0.08)', tension: 0.25 }],
              }}
              options={baseOpts}
            />
          </div>
        </div>

        <div className="chart-card">
          <h4>Inbound vs Outbound CBM</h4>
          <div className="chart-box">
            <Pie
              data={{
                labels: ['Inbound CBM', 'Outbound CBM'],
                datasets: [{ data: [data.cbmIn, data.cbmOut], backgroundColor: ['#1baf7a', '#2a78d6'], borderColor: '#fff', borderWidth: 2 }],
              }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: legendOpts } }}
            />
          </div>
        </div>

        <div className="chart-card">
          <h4>Storage CBM by Customer</h4>
          <div className="chart-box">
            <Doughnut
              data={{
                labels: [...data.cbmByCust.keys()],
                datasets: [{ data: [...data.cbmByCust.values()], backgroundColor: [...data.cbmByCust.keys()].map(custColor), borderColor: '#fff', borderWidth: 2 }],
              }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: legendOpts } }}
            />
          </div>
        </div>

        <div className="chart-card">
          <h4>Revenue by Customer <span style={{ fontWeight: 400, color: 'var(--ink-400)' }}>(all currencies)</span></h4>
          <div className="chart-box">
            <Bar
              data={{
                labels: [...data.revByCust.keys()],
                datasets: [{ data: [...data.revByCust.values()], backgroundColor: [...data.revByCust.keys()].map(custColor), borderRadius: 4, maxBarThickness: 42 }],
              }}
              options={baseOpts}
            />
          </div>
        </div>

        <div className="chart-card">
          <h4>Activity Volume <span style={{ fontWeight: 400, color: 'var(--ink-400)' }}>(x: avg min · y: total qty · size: count)</span></h4>
          <div className="chart-box">
            <Bubble
              data={{
                datasets: typeLabels.map((t) => {
                  const r = data.byType.get(t)
                  return {
                    label: t,
                    data: [{ x: r.count ? round2((r.durH * 60) / r.count) : 0, y: r.qty, r: Math.min(28, 6 + r.count * 1.6) }],
                    backgroundColor: typeColor(t) + 'B3',
                    borderColor: '#fff', borderWidth: 2,
                  }
                }),
              }}
              options={{ ...baseOpts, plugins: { legend: legendOpts, tooltip: { padding: 10 } } }}
            />
          </div>
        </div>

        <div className="chart-card">
          <h4>Duration Distribution <span style={{ fontWeight: 400, color: 'var(--ink-400)' }}>(minutes)</span></h4>
          <div className="chart-box">
            <Bar
              data={{
                labels: data.buckets.map((b, i) => (i === data.buckets.length - 1 ? `${b}+` : `${b}–${data.buckets[i + 1]}`)),
                datasets: [{ data: data.histo, backgroundColor: '#2a78d6', borderRadius: 4, maxBarThickness: 42 }],
              }}
              options={baseOpts}
            />
          </div>
        </div>

        <div className="chart-card">
          <h4>Performance Radar <span style={{ fontWeight: 400, color: 'var(--ink-400)' }}>(normalized per activity type)</span></h4>
          <div className="chart-box">
            <Radar
              data={{
                labels: ['Count', 'Quantity', 'Hours'],
                datasets: typeLabels.slice(0, 4).map((t) => {
                  const r = data.byType.get(t)
                  const maxC = Math.max(...typeLabels.map((x) => data.byType.get(x).count), 1)
                  const maxQ = Math.max(...typeLabels.map((x) => data.byType.get(x).qty), 1)
                  const maxH = Math.max(...typeLabels.map((x) => data.byType.get(x).durH), 1)
                  return {
                    label: t,
                    data: [round2((r.count / maxC) * 100), round2((r.qty / maxQ) * 100), round2((r.durH / maxH) * 100)],
                    borderColor: typeColor(t), backgroundColor: typeColor(t) + '22', borderWidth: 2, pointRadius: 3,
                  }
                }),
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: legendOpts },
                scales: { r: { beginAtZero: true, max: 100, ticks: { display: false }, grid: { color: GRID }, pointLabels: { color: INK, font: { size: 11 } } } },
              }}
            />
          </div>
        </div>

        <div className="chart-card">
          <h4>Activity Funnel <span style={{ fontWeight: 400, color: 'var(--ink-400)' }}>(by volume)</span></h4>
          <div className="chart-box">
            <Bar
              data={{
                labels: funnelSorted.map(([t]) => t),
                datasets: [{
                  data: funnelSorted.map(([, c]) => c),
                  backgroundColor: funnelSorted.map((_, i) => SEQ[Math.max(3, SEQ.length - 1 - i * 2)]),
                  borderRadius: 4, maxBarThickness: 26,
                }],
              }}
              options={{ ...baseOpts, indexAxis: 'y', scales: { x: { grid: { color: GRID }, ticks: { color: INK }, beginAtZero: true }, y: { grid: { display: false }, ticks: { color: INK } } } }}
            />
          </div>
        </div>

        <div className="chart-card">
          <h4>Attendance Hours by User</h4>
          <div className="chart-box">
            <Bar
              data={{
                labels: [...data.attByUser.keys()],
                datasets: [{ data: [...data.attByUser.values()], backgroundColor: '#1baf7a', borderRadius: 4, maxBarThickness: 42 }],
              }}
              options={baseOpts}
            />
          </div>
        </div>

        <div className="chart-card">
          <h4>Productivity % by User</h4>
          <div className="chart-box">
            <Bar
              data={{
                labels: data.prodByUser.map((p) => p.name),
                datasets: [{ data: data.prodByUser.map((p) => p.pct), backgroundColor: '#2a78d6', borderRadius: 4, maxBarThickness: 42 }],
              }}
              options={baseOpts}
            />
          </div>
        </div>

        <div className="chart-card">
          <h4>Attendance Hours over Time</h4>
          <div className="chart-box">
            <Line
              data={{
                labels: data.attDays,
                datasets: [{ data: data.attDays.map((d) => data.attByDay.get(d)), borderColor: '#1baf7a', borderWidth: 2, pointRadius: 0, pointHitRadius: 8, tension: 0.25 }],
              }}
              options={baseOpts}
            />
          </div>
        </div>

        <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
          <h4>Activity Heatmap <span style={{ fontWeight: 400, color: 'var(--ink-400)' }}>(day of week × activity type)</span></h4>
          <div className="heatmap" style={{ gridTemplateColumns: `140px repeat(${data.dows.length}, 1fr)` }}>
            <div className="hm-label"></div>
            {data.dows.map((d) => <div key={d} className="hm-label" style={{ justifyContent: 'center' }}>{d}</div>)}
            {typeLabels.map((t) => (
              <React.Fragment key={t}>
                <div className="hm-label">{t}</div>
                {data.dows.map((_, di) => {
                  const v = data.heat.get(`${t}|${di}`) || 0
                  const step = data.heatMax ? Math.round((v / data.heatMax) * (SEQ.length - 1)) : 0
                  return (
                    <div
                      key={di}
                      className="hm-cell"
                      title={`${t} · ${data.dows[di]}: ${v} activities`}
                      style={{ background: v === 0 ? 'var(--ink-50)' : SEQ[step], color: step > 6 ? '#fff' : undefined }}
                    >
                      {v || ''}
                    </div>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
