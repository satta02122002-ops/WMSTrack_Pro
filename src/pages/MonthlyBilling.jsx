import React, { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Field, Select, EmptyState, StatusBadge } from '../components/ui.jsx'
import { fmtDate, fmtNum, num, round2, monthName, todayISO } from '../utils.js'
import { computeBillingLines } from '../billing.js'
import { exportXlsx } from '../excel.js'

export default function MonthlyBilling() {
  const { db, billedMap, recordBilling, update, toast, session } = useStore()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [customer, setCustomer] = useState('')
  const [reportType, setReportType] = useState('')
  const [billStatus, setBillStatus] = useState('')
  const [generated, setGenerated] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [billModal, setBillModal] = useState(false)
  const [billDate, setBillDate] = useState(todayISO())
  const [apiUrl, setApiUrl] = useState(db.settings?.billingApiUrl || '')
  const [submitting, setSubmitting] = useState(false)

  const period = `${year}-${String(month).padStart(2, '0')}`

  const allLines = useMemo(() => (generated ? computeBillingLines(db, period) : []), [db, period, generated])

  const lines = useMemo(
    () =>
      allLines.filter((l) => {
        if (customer && l.customerName !== customer) return false
        if (reportType && l.reportType !== reportType) return false
        const billed = billedMap.get(l.id)
        if (billStatus === 'notbilled' && billed) return false
        if (billStatus === 'billed' && !billed) return false
        return true
      }),
    [allLines, customer, reportType, billStatus, billedMap],
  )

  const totalsByCurrency = useMemo(() => {
    const m = new Map()
    for (const l of lines) m.set(l.currency || '—', round2((m.get(l.currency || '—') || 0) + num(l.totalValue)))
    return [...m.entries()]
  }, [lines])

  const selectableIds = lines.filter((l) => !billedMap.get(l.id)).map((l) => l.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds))
  }
  function toggle(id) {
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function generate() {
    setGenerated(true)
    setSelected(new Set())
  }

  function confirmBilling() {
    recordBilling(period, [...selected], billDate)
    setSelected(new Set())
    setBillModal(false)
  }

  function exportExcel() {
    exportXlsx(
      `monthly_billing_${period}.xlsx`,
      lines.map((l) => {
        const billed = billedMap.get(l.id)
        return {
          'CUSTOMER NAME': l.customerName, DATE: l.date, 'CUSTOMER REF NO': l.customerRef, ACTIVITY: l.activity,
          'HANDLING TYPE': l.handlingType, 'VEHICLE TYPE': l.vehicleType, 'NO OF TRUCKS': l.truckCount,
          'CBM QTY': l.cbmQty, 'PACKAGE QTY': l.packageQty, 'PACKAGE UOM': l.packageUom,
          'BILLING STATUS': billed ? 'Billed' : 'Not billed', 'BILLED BY': billed?.billedBy || '', 'BILLED DATE': billed?.billedDate || '',
          CURRENCY: l.currency, 'COMBINED RATE': l.combinedRate, 'TOTAL VALUE': l.totalValue,
        }
      }),
      `Billing ${period}`,
    )
  }

  async function submitToApi() {
    if (!apiUrl) return
    setSubmitting(true)
    try {
      const payload = {
        period, generatedAt: new Date().toISOString(), generatedBy: session?.name,
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

  const years = []
  for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 1; y++) years.push(y)

  return (
    <div>
      <h1 className="page-title">Monthly Billing</h1>
      <p className="page-sub">Consolidated billable lines per customer and month — activities, storage, handling and VAS.</p>

      <div className="card">
        <div className="form-grid">
          <Field label="Month">
            <Select value={String(month)} onChange={(v) => { setMonth(num(v, 1)); setGenerated(false) }} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(i + 1) }))} />
          </Field>
          <Field label="Year">
            <Select value={String(year)} onChange={(v) => { setYear(num(v)); setGenerated(false) }} options={years.map((y) => String(y))} />
          </Field>
          <Field label="Customer">
            <Select value={customer} onChange={setCustomer} options={db.customers.map((c) => c.name)} placeholder="All customers" />
          </Field>
          <Field label="Report Type">
            <Select value={reportType} onChange={setReportType} options={['Activities', 'Storage', 'Handling', 'VAS']} placeholder="All" />
          </Field>
          <Field label="Billing Status">
            <Select value={billStatus} onChange={setBillStatus} options={[{ value: 'notbilled', label: 'Not yet billed' }, { value: 'billed', label: 'Billed in period' }]} placeholder="All" />
          </Field>
        </div>
        <div className="row-end">
          <button className="btn btn-primary" onClick={generate}>⚡ Generate Billing</button>
        </div>
      </div>

      {generated && (
        <div className="card">
          <div className="spread" style={{ marginBottom: 12 }}>
            <div className="row">
              <span className="badge badge-brand">{lines.length} line(s)</span>
              {totalsByCurrency.map(([cur, tot]) => (
                <span key={cur} className="badge badge-blue">GRAND TOTAL: {fmtNum(tot)} {cur}</span>
              ))}
            </div>
            <div className="row">
              <button className="btn btn-sm btn-blue" disabled={selected.size === 0} onClick={() => setBillModal(true)}>
                💳 Record Billing ({selected.size})
              </button>
              <button className="btn btn-sm btn-outline" disabled={!lines.length} onClick={exportExcel}>⬇ Export Excel</button>
            </div>
          </div>

          {lines.length === 0 ? (
            <EmptyState icon="💰" title={`No billable lines for ${monthName(month)} ${year}`} hint="Complete activities, storage movements or VAS charges in this period to generate billing." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={allSelected} onChange={toggleAll} title="Select all unbilled" /></th>
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
                          <input type="checkbox" disabled={!!billed} checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                        </td>
                        <td><b>{l.customerName}</b></td>
                        <td>{fmtDate(l.date)}</td>
                        <td>{l.customerRef}</td>
                        <td>
                          {l.activity}
                          {l.rateMissing && <span className="badge badge-red" style={{ marginLeft: 6 }} title="No rate configured in master data">NO RATE</span>}
                          {l.minimumApplied && <span className="badge badge-amber" style={{ marginLeft: 6 }} title="Per-movement minimum charge applied">MIN</span>}
                        </td>
                        <td>{l.handlingType || '—'}</td>
                        <td>{l.vehicleType || '—'}</td>
                        <td className="num">{l.truckCount || '—'}</td>
                        <td className="num">{l.cbmQty !== '' ? fmtNum(l.cbmQty) : '—'}</td>
                        <td className="num">{l.packageQty !== '' && l.packageQty != null ? fmtNum(num(l.packageQty), 0) : '—'}</td>
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
            Mark <b>{selected.size}</b> line(s) as billed for period <b>{monthName(month)} {year}</b>.
          </p>
          <Field label="Billing date" required>
            <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  )
}
