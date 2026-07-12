import { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Field, Select, EmptyState, StatusBadge } from '../components/ui.jsx'
import { fmtDate, fmtNum, num, round2, todayISO, monthName, accountHolderOf, accountHolderNames } from '../utils.js'
import { computeBillingLinesRange } from '../billing.js'
import { exportXlsx } from '../excel.js'

export default function MonthlyBilling() {
  const { db, billedMap, recordBilling, unbillRecords, update, toast, session } = useStore()
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(todayISO())
  const [customer, setCustomer] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [reportType, setReportType] = useState('')
  const [billStatus, setBillStatus] = useState('')
  const [billedMonth, setBilledMonth] = useState('')
  const [billedYear, setBilledYear] = useState('')
  const [applied, setApplied] = useState(null) // snapshot of the filters currently shown
  const [selected, setSelected] = useState(() => new Set())
  const [billModal, setBillModal] = useState(false)
  const [unbillModal, setUnbillModal] = useState(false)
  const [billDate, setBillDate] = useState(todayISO())
  const [apiUrl, setApiUrl] = useState(db.settings?.billingApiUrl || '')
  const [submitting, setSubmitting] = useState(false)

  const rangeKey = applied ? `${applied.from}..${applied.to}` : `${from}..${to}`
  const rangeLabel = applied ? `${fmtDate(applied.from)} – ${fmtDate(applied.to)}` : `${fmtDate(from)} – ${fmtDate(to)}`

  const allLines = useMemo(() => (applied ? computeBillingLinesRange(db, applied.from, applied.to) : []), [db, applied])

  const lines = useMemo(() => {
    if (!applied) return []
    return allLines.filter((l) => {
      if (applied.customer && l.customerName !== applied.customer) return false
      if (applied.accountHolder && accountHolderOf(db, l.customerName) !== applied.accountHolder) return false
      if (applied.reportType && l.reportType !== applied.reportType) return false
      const billed = billedMap.get(l.id)
      if (applied.billStatus === 'notbilled' && billed) return false
      if (applied.billStatus === 'billed' && !billed) return false
      // Filter by the month/year the line was billed in (its billing period)
      if (applied.billedMonth || applied.billedYear) {
        if (!billed?.billedDate) return false
        const bd = String(billed.billedDate)
        if (applied.billedYear && bd.slice(0, 4) !== String(applied.billedYear)) return false
        if (applied.billedMonth && Number(bd.slice(5, 7)) !== Number(applied.billedMonth)) return false
      }
      return true
    })
  }, [allLines, applied, billedMap, db])

  const billedYearOptions = useMemo(() => {
    const set = new Set()
    for (const r of db.billedRecords) if (r.billedDate) set.add(String(r.billedDate).slice(0, 4))
    set.add(String(now.getFullYear()))
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [db.billedRecords])

  const totalsByCurrency = useMemo(() => {
    const m = new Map()
    for (const l of lines) m.set(l.currency || '—', round2((m.get(l.currency || '—') || 0) + num(l.totalValue)))
    return [...m.entries()]
  }, [lines])

  const selectedBilled = lines.filter((l) => selected.has(l.id) && billedMap.get(l.id))
  const selectedUnbilled = lines.filter((l) => selected.has(l.id) && !billedMap.get(l.id))

  const allIds = lines.map((l) => l.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds))
  }
  function toggle(id) {
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function applyFilters() {
    if (!from || !to) return toast('Select both From and To dates', 'error')
    if (from > to) return toast('From date must be on or before To date', 'error')
    setApplied({ from, to, customer, accountHolder, reportType, billStatus, billedMonth, billedYear })
    setSelected(new Set())
  }

  function confirmBilling() {
    recordBilling(rangeKey, selectedUnbilled.map((l) => l.id), billDate)
    setSelected(new Set())
    setBillModal(false)
  }

  function confirmUnbill() {
    unbillRecords(selectedBilled.map((l) => l.id))
    setSelected(new Set())
    setUnbillModal(false)
  }

  function exportExcel() {
    exportXlsx(
      `billing_${applied?.from || from}_to_${applied?.to || to}.xlsx`,
      lines.map((l) => {
        const billed = billedMap.get(l.id)
        return {
          'CUSTOMER NAME': l.customerName, DATE: l.date, 'CUSTOMER REF NO': l.customerRef, ACTIVITY: l.activity,
          'HANDLING TYPE': l.handlingType, 'VEHICLE TYPE': l.vehicleType, 'NO OF TRUCKS': l.truckCount,
          'CBM QTY': l.cbmQty, 'PACKAGE QTY': l.packageDetail || l.packageQty, 'PACKAGE UOM': l.packageUom,
          'BILLING STATUS': billed ? 'Billed' : 'Not billed', 'BILLED BY': billed?.billedBy || '', 'BILLED DATE': billed?.billedDate || '',
          CURRENCY: l.currency, 'COMBINED RATE': l.combinedRate, 'TOTAL VALUE': l.totalValue,
        }
      }),
      'Billing',
    )
  }

  async function submitToApi() {
    if (!apiUrl) return
    try {
      const parsed = new URL(apiUrl)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return toast('API URL must use https:// or http://', 'error')
      }
    } catch {
      return toast('Invalid API URL', 'error')
    }
    setSubmitting(true)
    try {
      const payload = {
        from: applied?.from || from, to: applied?.to || to,
        generatedAt: new Date().toISOString(), generatedBy: session?.name,
        lines: lines.map((l) => ({ ...l, billed: !!billedMap.get(l.id) })),
      }
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast('Billing report submitted to external API')
    } catch (e) {
      toast(`API submission failed: ${e.message}`, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  function saveApiUrl(v) {
    setApiUrl(v)
    update((d) => ({ ...d, settings: { ...d.settings, billingApiUrl: v } }))
  }

  return (
    <div>
      <h1 className="page-title">Monthly Billing</h1>
      <p className="page-sub">Consolidated billable lines for a date range — activities, storage, handling and VAS.</p>

      <div className="card">
        <div className="form-grid">
          <Field label="From Date">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to || undefined} />
          </Field>
          <Field label="To Date">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from || undefined} />
          </Field>
          <Field label="Customer">
            <Select value={customer} onChange={setCustomer} options={db.customers.map((c) => c.name)} placeholder="All customers" />
          </Field>
          <Field label="Account Holder">
            <Select value={accountHolder} onChange={setAccountHolder} options={accountHolderNames(db)} placeholder="All account holders" />
          </Field>
          <Field label="Report Type">
            <Select value={reportType} onChange={setReportType} options={['Activities', 'Storage', 'Handling', 'VAS']} placeholder="All" />
          </Field>
          <Field label="Billing Status">
            <Select value={billStatus} onChange={setBillStatus} options={[{ value: 'notbilled', label: 'Not yet billed' }, { value: 'billed', label: 'Already billed' }]} placeholder="All" />
          </Field>
          <Field label="Billing Month" hint="Filter by the month a line was billed">
            <Select value={billedMonth} onChange={setBilledMonth} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(i + 1) }))} placeholder="All" />
          </Field>
          <Field label="Billing Year" hint="Filter by the year a line was billed">
            <Select value={billedYear} onChange={setBilledYear} options={billedYearOptions} placeholder="All" />
          </Field>
        </div>
        <div className="row-end">
          <button className="btn btn-primary" onClick={applyFilters}>⚡ Apply</button>
        </div>
      </div>

      {applied && (
        <div className="card">
          <div className="spread" style={{ marginBottom: 12 }}>
            <div className="row">
              <span className="badge badge-brand">{lines.length} line(s)</span>
              {totalsByCurrency.map(([cur, tot]) => (
                <span key={cur} className="badge badge-blue">GRAND TOTAL: {fmtNum(tot)} {cur}</span>
              ))}
            </div>
            <div className="row">
              <button className="btn btn-sm btn-blue" disabled={selectedUnbilled.length === 0} onClick={() => setBillModal(true)}>
                💳 Record Billing ({selectedUnbilled.length})
              </button>
              <button className="btn btn-sm btn-danger" disabled={selectedBilled.length === 0} onClick={() => setUnbillModal(true)}>
                ↩ Unbill ({selectedBilled.length})
              </button>
              <button className="btn btn-sm btn-outline" disabled={!lines.length} onClick={exportExcel}>⬇ Export Excel</button>
            </div>
          </div>

          {lines.length === 0 ? (
            <EmptyState icon="💰" title={`No billable lines for ${rangeLabel}`} hint="Complete activities, storage movements or VAS charges in this date range to generate billing." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={allSelected} onChange={toggleAll} title="Select / deselect all" /></th>
                    <th>Customer Name</th><th>Date</th><th>Customer Ref No</th><th>Activity</th>
                    <th>Handling Type</th><th>Vehicle</th><th className="num">Trucks</th>
                    <th className="num">CBM Qty</th><th className="num">Package Qty</th><th>Pkg UOM</th>
                    <th>Billing Status</th><th>Billed By</th><th>Billed Date</th>
                    <th>Currency</th><th className="num">Combined Rate</th><th className="num">Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const billed = billedMap.get(l.id)
                    return (
                      <tr key={l.id} style={billed ? { opacity: 0.72 } : undefined}>
                        <td>
                          <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                        </td>
                        <td><b>{l.customerName}</b></td>
                        <td>{fmtDate(l.date)}</td>
                        <td>{l.customerRef}</td>
                        <td>
                          {l.activity}
                          {l.rateMissing && <span className="badge badge-red" style={{ marginLeft: 6 }} title="No rate configured in master data">NO RATE</span>}
                          {l.minimumApplied && <span className="badge badge-amber" style={{ marginLeft: 6 }} title="Per-movement minimum charge applied">MIN</span>}
                          {l.cbmBasis && <span className="badge badge-blue" style={{ marginLeft: 6 }} title="Customer is configured to bill handling by CBM — container/trailer per-truck rates ignored">CBM RATE</span>}
                        </td>
                        <td>{l.handlingType || '—'}</td>
                        <td>{l.vehicleType || '—'}</td>
                        <td className="num">{l.truckCount || '—'}</td>
                        <td className="num">{l.cbmQty !== '' ? fmtNum(l.cbmQty) : '—'}</td>
                        <td className="num" style={l.packageDetail ? { whiteSpace: 'nowrap' } : undefined}>
                          {l.packageDetail || (l.packageQty !== '' && l.packageQty != null ? fmtNum(num(l.packageQty), 0) : '—')}
                        </td>
                        <td>{l.packageUom || '—'}</td>
                        <td><StatusBadge status={billed ? 'billed' : 'notbilled'} /></td>
                        <td>{billed?.billedBy || '—'}</td>
                        <td>{billed ? fmtDate(billed.billedDate) : '—'}</td>
                        <td>{l.currency}</td>
                        <td className="num">{fmtNum(l.combinedRate)}</td>
                        <td className="num"><b>{fmtNum(l.totalValue)}</b></td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={16}>GRAND TOTAL</td>
                    <td className="num">
                      {totalsByCurrency.map(([cur, tot]) => (
                        <div key={cur}>{fmtNum(tot)} {cur}</div>
                      ))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="row mt" style={{ alignItems: 'flex-end' }}>
            <Field label="External billing API URL (optional)" hint="POSTs the generated lines as JSON">
              <input type="url" style={{ width: 320 }} value={apiUrl} onChange={(e) => saveApiUrl(e.target.value)} placeholder="https://erp.example.com/api/billing" />
            </Field>
            <div style={{ paddingBottom: 12 }}>
              <button className="btn btn-outline" disabled={!apiUrl || !lines.length || submitting} onClick={submitToApi}>
                {submitting ? 'Submitting…' : '📤 Submit to API'}
              </button>
            </div>
          </div>
        </div>
      )}

      {billModal && (
        <Modal
          title="Record Billing"
          onClose={() => setBillModal(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setBillModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!billDate} onClick={confirmBilling}>Confirm Billing</button>
            </>
          }
        >
          <p style={{ marginBottom: 12 }}>
            Mark <b>{selectedUnbilled.length}</b> line(s) as billed for <b>{rangeLabel}</b>.
          </p>
          <Field label="Billing date" required>
            <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          </Field>
        </Modal>
      )}

      {unbillModal && (
        <Modal
          title="Reverse Billing"
          onClose={() => setUnbillModal(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setUnbillModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmUnbill}>Confirm Unbill</button>
            </>
          }
        >
          <p style={{ marginBottom: 12 }}>
            Reverse billing on <b>{selectedBilled.length}</b> line(s)? They will return to <b>Not billed</b> status.
          </p>
          <p style={{ color: 'var(--ink-400)', fontSize: 13 }}>
            This action is logged in the audit trail.
          </p>
        </Modal>
      )}
    </div>
  )
}
