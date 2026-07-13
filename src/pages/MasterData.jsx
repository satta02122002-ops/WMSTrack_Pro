import { useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Field, Select, EmptyState } from '../components/ui.jsx'
import ImportButton from '../components/ImportButton.jsx'
import { HandlingRateModal } from './StorageHandling.jsx'
import { fmtNum, num, uid, storageTypeNames, sameHolder } from '../utils.js'
import { handlingRateLines } from '../billing.js'
import { exportXlsx } from '../excel.js'

function CustomerModal({ record, onClose }) {
  const { db, upsert, toast } = useStore()
  const [r, setR] = useState(record || { name: '', currency: 'USD', accountHolder: '', references: [] })
  const [refsText, setRefsText] = useState((record?.references || []).join('\n'))
  const valid = r.name.trim() && r.currency

  function save() {
    upsert('customers', {
      ...r, name: r.name.trim(), accountHolder: r.accountHolder || '',
      references: refsText.split('\n').map((s) => s.trim()).filter(Boolean),
    }, { entityType: 'Master Data', label: 'customer' })
    toast('Customer saved')
    onClose()
  }

  return (
    <Modal title={record ? 'Edit Customer' : 'New Customer'} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!valid} onClick={save}>Save Customer</button></>}>
      <Field label="Customer name" required>
        <input type="text" value={r.name} onChange={(e) => setR((s) => ({ ...s, name: e.target.value }))} autoFocus />
      </Field>
      <Field label="Currency" required>
        <Select value={r.currency} onChange={(v) => setR((s) => ({ ...s, currency: v }))} options={db.currencies.map((c) => c.name)} />
      </Field>
      <Field label="Account holder" hint="Managed under Parameter → Account Holders">
        <Select value={r.accountHolder || ''} onChange={(v) => setR((s) => ({ ...s, accountHolder: v }))} options={db.accountHolders?.map((a) => a.name) || []} placeholder="None" />
      </Field>
      <Field label="References" hint="One reference per line — offered as suggestions in Operations Execution">
        <textarea rows={4} value={refsText} onChange={(e) => setRefsText(e.target.value)} placeholder={'PO-1001\nPO-1002'} />
      </Field>
    </Modal>
  )
}

function ActivityModal({ record, onClose }) {
  const { upsert, toast } = useStore()
  const [r, setR] = useState(record || { name: '', storageType: '' })
  const valid = r.name.trim()

  function save() {
    upsert('activitiesMaster', { ...r, name: r.name.trim(), storageType: r.storageType || null }, { entityType: 'Master Data', label: 'activity' })
    toast('Activity saved')
    onClose()
  }

  return (
    <Modal title={record ? 'Edit Activity' : 'New Activity'} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!valid} onClick={save}>Save Activity</button></>}>
      <Field label="Activity name" required>
        <input type="text" value={r.name} onChange={(e) => setR((s) => ({ ...s, name: e.target.value }))} autoFocus />
      </Field>
      <Field label="Storage type" hint="Inbound (e.g. Offloading) / Outbound (e.g. Loading) activities create storage movements and billing on end">
        <Select value={r.storageType || ''} onChange={(v) => setR((s) => ({ ...s, storageType: v }))}
          options={[{ value: 'inbound', label: 'Inbound (Storage/Handling In)' }, { value: 'outbound', label: 'Outbound (Storage/Handling Out)' }]}
          placeholder="None — normal activity" />
      </Field>
    </Modal>
  )
}

function UnitValueModal({ record, onClose }) {
  const { db, upsert, toast } = useStore()
  const [r, setR] = useState(record || { customer: '', activity: '', uom: '', unitRate: '', currency: 'USD', minimumCharge: '', minimumFixedValue: '' })
  const valid = r.customer && r.activity && r.uom && num(r.unitRate) > 0

  function save() {
    upsert('unitValues', { ...r, unitRate: num(r.unitRate), minimumCharge: num(r.minimumCharge), minimumFixedValue: num(r.minimumFixedValue) }, { entityType: 'Master Data', label: 'unit value' })
    toast('Unit value saved')
    onClose()
  }

  return (
    <Modal title={record ? 'Edit Unit Value' : 'New Unit Value'} onClose={onClose} wide
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!valid} onClick={save}>Save Unit Value</button></>}>
      <div className="form-grid">
        <Field label="Customer" required>
          <Select value={r.customer} onChange={(v) => setR((s) => ({ ...s, customer: v, currency: db.customers.find((c) => c.name === v)?.currency || s.currency }))} options={db.customers.map((c) => c.name)} placeholder="Select…" />
        </Field>
        <Field label="Activity" required>
          <Select value={r.activity} onChange={(v) => setR((s) => ({ ...s, activity: v }))} options={db.activitiesMaster.filter((a) => !a.storageType).map((a) => a.name)} placeholder="Select…" />
        </Field>
        <Field label="UOM" required>
          <Select value={r.uom} onChange={(v) => setR((s) => ({ ...s, uom: v }))} options={db.uoms.map((u) => u.name)} placeholder="Select…" />
        </Field>
        <Field label="Rate per unit" required>
          <input type="number" min="0" step="0.0001" value={r.unitRate} onChange={(e) => setR((s) => ({ ...s, unitRate: e.target.value }))} />
        </Field>
        <Field label="Currency" required>
          <Select value={r.currency} onChange={(v) => setR((s) => ({ ...s, currency: v }))} options={db.currencies.map((c) => c.name)} />
        </Field>
        <Field label="Per-job minimum charge" hint="0 = no minimum; if qty × rate is lower, this amount is billed instead">
          <input type="number" min="0" step="0.01" value={r.minimumCharge} onChange={(e) => setR((s) => ({ ...s, minimumCharge: e.target.value }))} />
        </Field>
        <Field label="Monthly minimum value" hint="0 = no minimum; top-up added at billing when the month total is lower">
          <input type="number" min="0" step="0.01" value={r.minimumFixedValue} onChange={(e) => setR((s) => ({ ...s, minimumFixedValue: e.target.value }))} />
        </Field>
      </div>
    </Modal>
  )
}

function StorageRateModal({ record, onClose }) {
  const { db, upsert, toast } = useStore()
  const [r, setR] = useState(record || { customer: '', storageType: 'Normal Storage', unitRate: '', monthlyMinimum: '', currency: 'USD' })
  const valid = r.customer && r.storageType.trim() && num(r.unitRate) > 0

  function save() {
    upsert('storageRates', { ...r, storageType: r.storageType.trim(), unitRate: num(r.unitRate), monthlyMinimum: num(r.monthlyMinimum) }, { entityType: 'Master Data', label: 'storage rate' })
    toast('Storage rate saved')
    onClose()
  }

  return (
    <Modal title={record ? 'Edit Storage Rate' : 'New Storage Rate'} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!valid} onClick={save}>Save Rate</button></>}>
      <Field label="Customer" required>
        <Select value={r.customer} onChange={(v) => setR((s) => ({ ...s, customer: v, currency: db.customers.find((c) => c.name === v)?.currency || s.currency }))} options={db.customers.map((c) => c.name)} placeholder="Select…" />
      </Field>
      <Field label="Storage type" required hint="Managed under Parameter → Storage Types">
        <Select value={r.storageType} onChange={(v) => setR((s) => ({ ...s, storageType: v }))} options={storageTypeNames(db)} placeholder="Select storage type…" />
      </Field>
      <Field label="Rate per CBM per day" required hint="Storage is billed as rate × CBM × days stored">
        <input type="number" min="0" step="0.0001" value={r.unitRate} onChange={(e) => setR((s) => ({ ...s, unitRate: e.target.value }))} />
      </Field>
      <Field label="Monthly minimum charge" hint="Top-up added at billing if the month's storage total for this customer/type is below this. 0 = no minimum">
        <input type="number" min="0" step="0.01" value={r.monthlyMinimum ?? ''} onChange={(e) => setR((s) => ({ ...s, monthlyMinimum: e.target.value }))} />
      </Field>
      <Field label="Currency" required>
        <Select value={r.currency} onChange={(v) => setR((s) => ({ ...s, currency: v }))} options={db.currencies.map((c) => c.name)} />
      </Field>
    </Modal>
  )
}

export default function MasterData() {
  const { db, upsert, remove } = useStore()
  const [tab, setTab] = useState('customers')
  const [modal, setModal] = useState(null) // {type, record}

  const open = (type, record = null) => setModal({ type, record })
  const close = () => setModal(null)

  const del = (collection, id, label) => {
    if (window.confirm(`Delete this ${label}?`)) remove(collection, id, { entityType: 'Master Data', label })
  }

  // ---- Bulk imports ----
  const importCustomers = (rows) => {
    let imported = 0, skipped = 0
    // Canonical account-holder names — seed from the managed Parameter list and
    // extend as new ones appear, so an imported "SATTANATHAN" snaps to the
    // existing "Sattanathan" and never-before-seen holders get registered once.
    const holders = (db.accountHolders || []).map((a) => a.name)
    for (const row of rows) {
      if (!row.name) { skipped++; continue }
      const existing = db.customers.find((c) => c.name.toLowerCase() === String(row.name).toLowerCase())
      const rawHolder = String(row.accountHolder || '').trim()
      let accountHolder = existing?.accountHolder || ''
      if (rawHolder) {
        const canonical = holders.find((h) => sameHolder(h, rawHolder))
        if (canonical) {
          accountHolder = canonical
        } else {
          accountHolder = rawHolder
          holders.push(rawHolder)
          upsert('accountHolders', { name: rawHolder }, { entityType: 'Parameter', label: 'account holder (import)' })
        }
      }
      upsert('customers', {
        ...(existing || {}), name: String(row.name), currency: String(row.currency || 'USD'),
        accountHolder,
        references: String(row.references || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean),
      }, { entityType: 'Master Data', label: 'customer (import)' })
      imported++
    }
    return { imported, skipped }
  }
  const importActivities = (rows) => {
    let imported = 0, skipped = 0
    for (const row of rows) {
      if (!row.name) { skipped++; continue }
      const st = String(row.storageType || '').toLowerCase()
      const existing = db.activitiesMaster.find((a) => a.name.toLowerCase() === String(row.name).toLowerCase())
      upsert('activitiesMaster', { ...(existing || {}), name: String(row.name), storageType: st === 'inbound' || st === 'outbound' ? st : null }, { entityType: 'Master Data', label: 'activity (import)' })
      imported++
    }
    return { imported, skipped }
  }
  const importUnitValues = (rows) => {
    let imported = 0, skipped = 0
    for (const row of rows) {
      if (!row.customer || !row.activity || !row.uom || !num(row.unitRate)) { skipped++; continue }
      upsert('unitValues', {
        customer: String(row.customer), activity: String(row.activity), uom: String(row.uom),
        unitRate: num(row.unitRate), currency: String(row.currency || 'USD'), minimumCharge: num(row.minimumCharge), minimumFixedValue: num(row.minimumFixedValue),
      }, { entityType: 'Master Data', label: 'unit value (import)' })
      imported++
    }
    return { imported, skipped }
  }
  const importStorageRates = (rows) => {
    let imported = 0, skipped = 0
    for (const row of rows) {
      if (!row.customer || !row.storageType || !num(row.unitRate)) { skipped++; continue }
      upsert('storageRates', { customer: String(row.customer), storageType: String(row.storageType), unitRate: num(row.unitRate), monthlyMinimum: num(row.monthlyMinimum), currency: String(row.currency || 'USD') }, { entityType: 'Master Data', label: 'storage rate (import)' })
      imported++
    }
    return { imported, skipped }
  }
  // Handling rates import: one row per rate line (customer + direction + vehicle
  // + size + handling UOM + rate). Rows for the same customer accumulate into a
  // rate matrix. Legacy sheets with fixed columns (container20/…/loosePerCbm) are
  // synthesised into equivalent lines so old templates still import.
  const importHandling = (rows) => {
    let imported = 0, skipped = 0
    const byCustomer = new Map()
    const entryFor = (name) => {
      if (!byCustomer.has(name)) {
        const existing = db.handlingRates.find((h) => h.customer === name)
        byCustomer.set(name, {
          existing, currency: existing?.currency || 'USD',
          minimumCharge: existing ? num(existing.minimumCharge) : 0,
          monthlyMinimum: existing ? num(existing.monthlyMinimum) : 0,
          billByCbm: !!existing?.billByCbm, lines: [],
        })
      }
      return byCustomer.get(name)
    }
    const toVehicle = (v) => { const s = String(v || '').trim().toLowerCase(); return s.startsWith('cont') ? 'Container' : s.startsWith('trail') ? 'Trailer' : 'Loose' }
    const toUom = (u) => { const s = String(u || '').trim().toLowerCase(); return s.startsWith('pall') ? 'Palletized' : s.startsWith('loose') ? 'Loose' : '' }
    for (const row of rows) {
      const name = String(row.customer || '').trim()
      if (!name) { skipped++; continue }
      const e = entryFor(name)
      if (row.currency) e.currency = String(row.currency)
      if (row.minimumCharge != null && row.minimumCharge !== '') e.minimumCharge = num(row.minimumCharge)
      if (row.monthlyMinimum != null && row.monthlyMinimum !== '') e.monthlyMinimum = num(row.monthlyMinimum)
      if (row.billByCbm != null && row.billByCbm !== '') e.billByCbm = /^(true|1|yes|y)$/i.test(String(row.billByCbm).trim())
      const vehicleRaw = String(row.vehicle || row.vehicleType || '').trim()
      if (vehicleRaw && row.rate != null && row.rate !== '') {
        const dir = String(row.direction || row.handlingType || '').trim().toUpperCase()
        e.lines.push({
          id: uid('hrl'), direction: dir === 'IN' || dir === 'OUT' ? dir : '',
          vehicle: toVehicle(vehicleRaw), size: String(row.size || '').trim(),
          handlingUom: toUom(row.handlingUom), rate: num(row.rate),
        })
      } else {
        const add = (vehicle, size, val) => { if (num(val)) e.lines.push({ id: uid('hrl'), direction: '', vehicle, size, handlingUom: '', rate: num(val) }) }
        add('Container', '20ft', row.container20); add('Container', '40ft', row.container40)
        add('Trailer', '20ft', row.trailer20); add('Trailer', '40ft', row.trailer40)
        if (num(row.loosePerCbm)) e.lines.push({ id: uid('hrl'), direction: '', vehicle: 'Loose', size: '', handlingUom: '', rate: num(row.loosePerCbm) })
      }
      imported++
    }
    for (const [name, e] of byCustomer) {
      upsert('handlingRates', {
        id: e.existing?.id, customer: name, currency: e.currency,
        minimumCharge: e.minimumCharge, monthlyMinimum: e.monthlyMinimum, billByCbm: e.billByCbm,
        rateLines: e.lines,
      }, { entityType: 'Master Data', label: 'handling rates (import)' })
    }
    return { imported, skipped }
  }

  const tabs = [
    ['customers', 'Customers'], ['activities', 'Activities'], ['unitvalues', 'Unit Values'],
    ['storagerates', 'Storage Master'], ['handling', 'Handling'],
  ]

  return (
    <div>
      <h1 className="page-title">Master Data Management</h1>
      <p className="page-sub">One-time setup: customers, activities, unit values, storage and handling rates. Supports bulk Excel upload.</p>

      <div className="tabs">
        {tabs.map(([k, l]) => (
          <button key={k} className={'tab' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'customers' && (
        <div className="card">
          <div className="spread" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Customers</div>
            <div className="row">
              <ImportButton kind="customers" onRows={importCustomers} />
              <button className="btn btn-sm btn-ghost" disabled={!db.customers.length} onClick={() => exportXlsx('customers.xlsx', db.customers.map((c) => ({ name: c.name, currency: c.currency, accountHolder: c.accountHolder || '', references: (c.references || []).join(';') })), 'Customers')}>⬇ Export</button>
              <button className="btn btn-sm btn-primary" onClick={() => open('customer')}>＋ New Customer</button>
            </div>
          </div>
          {db.customers.length === 0 ? <EmptyState icon="🏢" title="No customers yet" hint="Add customers before running operations." /> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Name</th><th>Currency</th><th>Account Holder</th><th>References</th><th></th></tr></thead>
                <tbody>
                  {db.customers.map((c) => (
                    <tr key={c.id}>
                      <td><b>{c.name}</b></td>
                      <td>{c.currency}</td>
                      <td>{c.accountHolder || '—'}</td>
                      <td>{(c.references || []).join(', ') || '—'}</td>
                      <td>
                        <div className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
                          <button className="btn btn-sm btn-ghost" onClick={() => open('customer', c)}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => del('customers', c.id, 'customer')}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'activities' && (
        <div className="card">
          <div className="spread" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Activity Types</div>
            <div className="row">
              <ImportButton kind="activities" onRows={importActivities} />
              <button className="btn btn-sm btn-primary" onClick={() => open('activity')}>＋ New Activity</button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Activity Name</th><th>Storage Type</th><th></th></tr></thead>
              <tbody>
                {db.activitiesMaster.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.name}</b></td>
                    <td>{a.storageType ? <span className={'badge ' + (a.storageType === 'inbound' ? 'badge-brand' : 'badge-blue')}>{a.storageType.toUpperCase()}</span> : <span className="badge badge-gray">NORMAL</span>}</td>
                    <td>
                      <div className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => open('activity', a)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => del('activitiesMaster', a.id, 'activity')}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'unitvalues' && (
        <div className="card">
          <div className="spread" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Unit Values (activity billing rates)</div>
            <div className="row">
              <ImportButton kind="unitValues" onRows={importUnitValues} />
              <button className="btn btn-sm btn-primary" onClick={() => open('unitvalue')}>＋ New Unit Value</button>
            </div>
          </div>
          {db.unitValues.length === 0 ? <EmptyState icon="💲" title="No unit values" hint="Without a unit value, completed activities bill at 0." /> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Customer</th><th>Activity</th><th>UOM</th><th className="num">Rate</th><th>Currency</th><th className="num">Per-Job Min</th><th className="num">Monthly Min</th><th></th></tr></thead>
                <tbody>
                  {db.unitValues.map((v) => (
                    <tr key={v.id}>
                      <td><b>{v.customer}</b></td>
                      <td>{v.activity}</td>
                      <td>{v.uom}</td>
                      <td className="num">{fmtNum(v.unitRate, 4)}</td>
                      <td>{v.currency}</td>
                      <td className="num">{num(v.minimumCharge) > 0 ? fmtNum(v.minimumCharge) : '—'}</td>
                      <td className="num">{num(v.minimumFixedValue) > 0 ? fmtNum(v.minimumFixedValue) : '—'}</td>
                      <td>
                        <div className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
                          <button className="btn btn-sm btn-ghost" onClick={() => open('unitvalue', v)}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => del('unitValues', v.id, 'unit value')}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'storagerates' && (
        <div className="card">
          <div className="spread" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Storage Master (rates per CBM per day)</div>
            <div className="row">
              <ImportButton kind="storageRates" onRows={importStorageRates} />
              <button className="btn btn-sm btn-primary" onClick={() => open('storagerate')}>＋ New Storage Rate</button>
            </div>
          </div>
          {db.storageRates.length === 0 ? <EmptyState icon="🏬" title="No storage rates" hint="Storage In/Out billing needs a rate per customer and storage type." /> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Customer</th><th>Storage Type</th><th className="num">Rate / CBM / day</th><th className="num">Monthly Min</th><th>Currency</th><th></th></tr></thead>
                <tbody>
                  {db.storageRates.map((r) => (
                    <tr key={r.id}>
                      <td><b>{r.customer}</b></td>
                      <td>{r.storageType}</td>
                      <td className="num">{fmtNum(r.unitRate, 4)}</td>
                      <td className="num">{num(r.monthlyMinimum) > 0 ? fmtNum(r.monthlyMinimum) : '—'}</td>
                      <td>{r.currency}</td>
                      <td>
                        <div className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
                          <button className="btn btn-sm btn-ghost" onClick={() => open('storagerate', r)}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => del('storageRates', r.id, 'storage rate')}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'handling' && (
        <div className="card">
          <div className="spread" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Handling Rates &amp; Minimums</div>
            <div className="row">
              <ImportButton kind="handlingRates" onRows={importHandling} />
              <button className="btn btn-sm btn-primary" onClick={() => open('handlingrate')}>＋ New Configuration</button>
            </div>
          </div>
          {db.handlingRates.length === 0 ? <EmptyState icon="🚛" title="No handling rates" /> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Customer</th><th className="num">Rate Lines</th><th className="num">Min</th><th className="num">Monthly Min</th><th>Basis</th><th>Currency</th><th></th></tr></thead>
                <tbody>
                  {db.handlingRates.map((r) => (
                    <tr key={r.id}>
                      <td><b>{r.customer}</b></td>
                      <td className="num">{handlingRateLines(r).length}</td>
                      <td className="num">{fmtNum(r.minimumCharge)}</td>
                      <td className="num">{fmtNum(r.monthlyMinimum)}</td>
                      <td>{r.billByCbm ? <span className="badge badge-blue">PER CBM</span> : <span className="badge badge-gray">TRUCK/CBM</span>}</td>
                      <td>{r.currency}</td>
                      <td>
                        <div className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
                          <button className="btn btn-sm btn-ghost" onClick={() => open('handlingrate', r)}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => del('handlingRates', r.id, 'handling rate')}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {modal?.type === 'customer' && <CustomerModal record={modal.record} onClose={close} />}
      {modal?.type === 'activity' && <ActivityModal record={modal.record} onClose={close} />}
      {modal?.type === 'unitvalue' && <UnitValueModal record={modal.record} onClose={close} />}
      {modal?.type === 'storagerate' && <StorageRateModal record={modal.record} onClose={close} />}
      {modal?.type === 'handlingrate' && <HandlingRateModal rate={modal.record} onClose={close} />}
    </div>
  )
}
