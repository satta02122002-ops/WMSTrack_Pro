import { useState } from 'react'
import { useStore } from '../store.jsx'
import { Field, Select, EmptyState } from '../components/ui.jsx'
import { fmtDate, fmtNum, num, round2, todayISO } from '../utils.js'
import { exportXlsx } from '../excel.js'

export default function VAS() {
  const { db, upsert, remove, toast } = useStore()
  const [form, setForm] = useState({ customerName: '', date: todayISO(), vasReference: '', quantity: '', charges: '' })
  const setE = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }))

  const valid = form.customerName && form.date && form.vasReference.trim() && num(form.quantity) > 0 && num(form.charges) > 0

  function save() {
    const cust = db.customers.find((c) => c.name === form.customerName)
    upsert('vasCharges', {
      customerName: form.customerName, date: form.date, vasReference: form.vasReference.trim(),
      quantity: num(form.quantity), charges: num(form.charges), currency: cust?.currency || '',
    }, { entityType: 'VAS', label: 'VAS charge' })
    toast('VAS charge recorded')
    setForm({ customerName: '', date: todayISO(), vasReference: '', quantity: '', charges: '' })
  }

  const rows = [...db.vasCharges].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div>
      <h1 className="page-title">Value Added Services</h1>
      <p className="page-sub">Record ad-hoc chargeable services. VAS charges flow into Reports and Monthly Billing.</p>

      <div className="card">
        <div className="card-title">🏷️ New VAS Charge</div>
        <div className="form-grid">
          <Field label="Customer" required>
            <Select value={form.customerName} onChange={(v) => setForm((s) => ({ ...s, customerName: v }))} options={db.customers.map((c) => c.name)} placeholder="Select…" />
          </Field>
          <Field label="Date" required>
            <input type="date" value={form.date} onChange={setE('date')} />
          </Field>
          <Field label="VAS Reference" required>
            <input type="text" value={form.vasReference} onChange={setE('vasReference')} placeholder="e.g. Shrink-wrap pallets" />
          </Field>
          <Field label="Quantity" required>
            <input type="number" min="0" step="0.01" value={form.quantity} onChange={setE('quantity')} />
          </Field>
          <Field label="Charge per unit" required>
            <input type="number" min="0" step="0.01" value={form.charges} onChange={setE('charges')} />
          </Field>
        </div>
        <div className="row-end">
          <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>
            Total: <b>{fmtNum(round2(num(form.quantity) * num(form.charges)))}</b>
          </span>
          <button className="btn btn-primary" disabled={!valid} onClick={save}>Save VAS Charge</button>
        </div>
      </div>

      <div className="card">
        <div className="spread" style={{ marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Recorded VAS Charges</div>
          <button
            className="btn btn-sm btn-outline"
            disabled={!rows.length}
            onClick={() =>
              exportXlsx('vas_charges.xlsx', rows.map((v) => ({
                Date: v.date, Customer: v.customerName, Reference: v.vasReference,
                Quantity: v.quantity, 'Charge/Unit': v.charges, Total: round2(v.quantity * v.charges), Currency: v.currency,
              })), 'VAS')
            }
          >
            ⬇ Excel
          </button>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon="🏷️" title="No VAS charges yet" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th><th>Customer</th><th>VAS Reference</th>
                  <th className="num">Quantity</th><th className="num">Charge/Unit</th><th className="num">Total</th><th>Currency</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id}>
                    <td>{fmtDate(v.date)}</td>
                    <td><b>{v.customerName}</b></td>
                    <td>{v.vasReference}</td>
                    <td className="num">{fmtNum(v.quantity)}</td>
                    <td className="num">{fmtNum(v.charges)}</td>
                    <td className="num"><b>{fmtNum(round2(v.quantity * v.charges))}</b></td>
                    <td>{v.currency}</td>
                    <td>
                      <button className="btn btn-sm btn-danger" onClick={() => window.confirm('Delete this VAS charge?') && remove('vasCharges', v.id, { entityType: 'VAS' })}>✕</button>
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
