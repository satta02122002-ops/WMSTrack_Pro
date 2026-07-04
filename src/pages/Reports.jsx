import React, { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { Select, EmptyState, StatusBadge } from '../components/ui.jsx'
import { fmtDate, fmtDuration, fmtNum, num, round2, todayISO, toISODate } from '../utils.js'
import { exportXlsx, exportCsv } from '../excel.js'
import { computeBillingLines } from '../billing.js'
import { monthKey } from '../utils.js'

function firstOfMonth() {
  const d = new Date()
  d.setDate(1)
  return toISODate(d)
}

export default function Reports() {
  const { db } = useStore()
  const [tab, setTab] = useState('operations')
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(todayISO())
  const [customer, setCustomer] = useState('')

  const inRange = (d) => (!from || d >= from) && (!to || d <= to)
  const custOk = (c) => !customer || c === customer

  const operations = useMemo(
    () =>
      db.operationsActivities
        .filter((a) => a.status === 'complete' && inRange(a.date) && custOk(a.customerName))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [db.operationsActivities, from, to, customer],
  )

  const movements = useMemo(
    () => db.storageMovements.filter((m) => inRange(m.date) && custOk(m.customer)).sort((a, b) => b.date.localeCompare(a.date)),
    [db.storageMovements, from, to, customer],
  )

  // handling charge detail comes from the billing engine for consistent rates
  const handlingLines = useMemo(() => {
    const periods = new Set()
    for (const m of movements) periods.add(monthKey(m.date))
    const lines = []
    for (const p of periods) lines.push(...computeBillingLines(db, p).filter((l) => l.source === 'handling'))
    return lines.filter((l) => inRange(l.date) && custOk(l.customerName)).sort((a, b) => b.date.localeCompare(a.date))
  }, [db, movements, from, to, customer])

  const vas = useMemo(
    () => db.vasCharges.filter((v) => inRange(v.date) && custOk(v.customerName)).sort((a, b) => b.date.localeCompare(a.date)),
    [db.vasCharges, from, to, customer],
  )

  const exports = {
    operations: () =>
      operations.map((a) => ({
        Date: a.date, Customer: a.customerName, Reference: a.customerRef, Activity: a.type, Owner: a.ownerName,
        Duration: fmtDuration(a.durationSeconds), Qty: a.qty ?? '', UOM: a.uom ?? '', CBM: a.cbm ?? '', Outcome: a.outcome ?? '',
      })),
    storage: () =>
      movements.map((m) => ({
        Date: m.date, Customer: m.customer, Reference: m.reference, Type: m.type, CBM: m.cbm,
        Storage: m.storage, Handling: m.handlingMode || '', Vehicle: m.containerSize || '', Trucks: m.truckCount || '',
      })),
    handling: () =>
      handlingLines.map((l) => ({
        Date: l.date, Customer: l.customerName, Reference: l.customerRef, Line: l.activity,
        'Handling Type': l.handlingType, Vehicle: l.vehicleType, Trucks: l.truckCount, CBM: l.cbmQty,
        Rate: l.combinedRate, Total: l.totalValue, Currency: l.currency,
      })),
    vas: () =>
      vas.map((v) => ({
        Date: v.date, Customer: v.customerName, Reference: v.vasReference,
        Quantity: v.quantity, 'Charge/Unit': v.charges, Total: round2(v.quantity * v.charges), Currency: v.currency,
      })),
  }

  function doExport(kind) {
    const rows = exports[tab]()
    if (!rows.length) return
    if (kind === 'csv') exportCsv(`report_${tab}_${from}_${to}.csv`, rows)
    else exportXlsx(`report_${tab}_${from}_${to}.xlsx`, rows, tab)
  }

  const totalCbmIn = round2(movements.filter((m) => m.type === 'Inbound').reduce((s, m) => s + num(m.cbm), 0))
  const totalCbmOut = round2(movements.filter((m) => m.type === 'Outbound').reduce((s, m) => s + num(m.cbm), 0))

  return (
    <div>
      <h1 className="page-title">Reports</h1>
      <p className="page-sub">Operational and financial reports with Excel/CSV export.</p>

      <div className="tabs">
        {[['operations', 'Operations'], ['storage', 'Storage'], ['handling', 'Handling'], ['vas', 'VAS']].map(([k, l]) => (
          <button key={k} className={'tab' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div className="card">
        <div className="spread" style={{ marginBottom: 12 }}>
          <div className="row">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <Select value={customer} onChange={setCustomer} options={db.customers.map((c) => c.name)} placeholder="All customers" style={{ width: 190 }} />
          </div>
          <div className="row">
            <button className="btn btn-sm btn-outline" onClick={() => doExport('xlsx')}>⬇ Excel</button>
            <button className="btn btn-sm btn-ghost" onClick={() => doExport('csv')}>⬇ CSV</button>
          </div>
        </div>

        {tab === 'operations' && (
          operations.length === 0 ? <EmptyState icon="📄" title="No completed activities in range" /> : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Date</th><th>Customer</th><th>Reference</th><th>Activity</th><th>Owner</th><th className="num">Duration</th><th className="num">Qty</th><th>UOM</th><th className="num">CBM</th><th>Outcome</th></tr>
                </thead>
                <tbody>
                  {operations.map((a) => (
                    <tr key={a.id}>
                      <td>{fmtDate(a.date)}</td><td><b>{a.customerName}</b></td><td>{a.customerRef}</td><td>{a.type}</td><td>{a.ownerName}</td>
                      <td className="num">{fmtDuration(a.durationSeconds)}</td><td className="num">{a.qty ?? '—'}</td><td>{a.uom ?? '—'}</td>
                      <td className="num">{a.cbm ?? '—'}</td><td><StatusBadge status={a.outcome} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={6}>Total activities: {operations.length}</td><td className="num">{fmtNum(operations.reduce((s, a) => s + num(a.qty), 0), 0)}</td><td></td><td className="num">{fmtNum(operations.reduce((s, a) => s + num(a.cbm), 0))}</td><td></td></tr>
                </tfoot>
              </table>
            </div>
          )
        )}

        {tab === 'storage' && (
          movements.length === 0 ? <EmptyState icon="📦" title="No storage movements in range" /> : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Date</th><th>Customer</th><th>Reference</th><th>Type</th><th className="num">CBM</th><th>Storage</th><th>Handling</th></tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td>{fmtDate(m.date)}</td><td><b>{m.customer}</b></td><td>{m.reference}</td>
                      <td><StatusBadge status={m.type} /></td><td className="num">{fmtNum(m.cbm)}</td><td>{m.storage}</td>
                      <td>{m.handlingMode ? `${m.handlingMode}${m.containerSize ? ' ' + m.containerSize : ''}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={4}>Inbound: {fmtNum(totalCbmIn)} CBM · Outbound: {fmtNum(totalCbmOut)} CBM</td><td className="num">{fmtNum(totalCbmIn + totalCbmOut)}</td><td colSpan={2}></td></tr>
                </tfoot>
              </table>
            </div>
          )
        )}

        {tab === 'handling' && (
          handlingLines.length === 0 ? <EmptyState icon="🚛" title="No handling movements in range" /> : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Date</th><th>Customer</th><th>Reference</th><th>Line</th><th>Vehicle</th><th className="num">Trucks</th><th className="num">CBM</th><th className="num">Rate</th><th className="num">Total</th><th>Currency</th></tr>
                </thead>
                <tbody>
                  {handlingLines.map((l) => (
                    <tr key={l.id}>
                      <td>{fmtDate(l.date)}</td><td><b>{l.customerName}</b></td><td>{l.customerRef}</td><td>{l.activity}{l.minimumApplied && <span className="badge badge-amber" style={{ marginLeft: 6 }}>MIN</span>}{l.cbmBasis && <span className="badge badge-blue" style={{ marginLeft: 6 }}>CBM RATE</span>}</td>
                      <td>{l.vehicleType || '—'}</td><td className="num">{l.truckCount || '—'}</td><td className="num">{l.cbmQty !== '' ? fmtNum(l.cbmQty) : '—'}</td>
                      <td className="num">{fmtNum(l.combinedRate)}</td><td className="num"><b>{fmtNum(l.totalValue)}</b></td><td>{l.currency}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={8}>Total handling charges</td><td className="num">{fmtNum(handlingLines.reduce((s, l) => s + num(l.totalValue), 0))}</td><td></td></tr>
                </tfoot>
              </table>
            </div>
          )
        )}

        {tab === 'vas' && (
          vas.length === 0 ? <EmptyState icon="🏷️" title="No VAS charges in range" /> : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Date</th><th>Customer</th><th>Reference</th><th className="num">Quantity</th><th className="num">Charge/Unit</th><th className="num">Total</th><th>Currency</th></tr>
                </thead>
                <tbody>
                  {vas.map((v) => (
                    <tr key={v.id}>
                      <td>{fmtDate(v.date)}</td><td><b>{v.customerName}</b></td><td>{v.vasReference}</td>
                      <td className="num">{fmtNum(v.quantity)}</td><td className="num">{fmtNum(v.charges)}</td>
                      <td className="num"><b>{fmtNum(round2(v.quantity * v.charges))}</b></td><td>{v.currency}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={5}>Total VAS</td><td className="num">{fmtNum(vas.reduce((s, v) => s + round2(v.quantity * v.charges), 0))}</td><td></td></tr>
                </tfoot>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  )
}
