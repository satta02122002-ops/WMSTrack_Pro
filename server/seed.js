import { hashPassword } from './auth.js'

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nowISO() { return new Date().toISOString() }
function round2(v) { return Math.round((parseFloat(v) || 0) * 100) / 100 }

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export async function seedDb() {
  const [hDev, hAdmin, hSup, hUser] = await Promise.all([
    hashPassword('developer'),
    hashPassword('admin'),
    hashPassword('supervisor'),
    hashPassword('user'),
  ])

  const customers = [
    { id: uid('cus'), name: 'Acme Trading Co', currency: 'USD', references: ['PO-1001', 'PO-1002', 'PO-1003'] },
    { id: uid('cus'), name: 'Gulf Distribution LLC', currency: 'USD', references: ['GD-2201', 'GD-2202'] },
    { id: uid('cus'), name: 'Nordwind Retail', currency: 'EUR', references: ['NW-88', 'NW-89'] },
  ]
  const activitiesMaster = [
    { id: uid('act'), name: 'Picking', storageType: null },
    { id: uid('act'), name: 'Packing', storageType: null },
    { id: uid('act'), name: 'Labeling', storageType: null },
    { id: uid('act'), name: 'Sorting', storageType: null },
    { id: uid('act'), name: 'Kitting', storageType: null },
    { id: uid('act'), name: 'Cycle Count', storageType: null },
    { id: uid('act'), name: 'Offloading', storageType: 'inbound' },
    { id: uid('act'), name: 'Loading', storageType: 'outbound' },
  ]
  const uoms = ['CTN', 'PLT', 'PCS', 'KG', 'CBM'].map((name) => ({ id: uid('uom'), name }))
  const currencies = ['USD', 'EUR', 'SAR'].map((name) => ({ id: uid('cur'), name }))
  const vehicleTypes = ['20ft', '40ft'].map((name) => ({ id: uid('veh'), name }))
  const storageTypes = ['Normal Storage', 'Cold Storage', 'Bonded Storage'].map((name) => ({ id: uid('sty'), name }))

  const unitValues = []
  const uvSeed = [
    ['Acme Trading Co', 'Picking', 'CTN', 0.45, 'USD', 10, 500],
    ['Acme Trading Co', 'Picking', 'PLT', 4.5, 'USD', 15, 0],
    ['Acme Trading Co', 'Picking', 'PCS', 0.05, 'USD', 5, 0],
    ['Acme Trading Co', 'Packing', 'CTN', 0.55, 'USD', 10, 0],
    ['Acme Trading Co', 'Labeling', 'PCS', 0.08, 'USD', 5, 0],
    ['Acme Trading Co', 'Sorting', 'CTN', 0.3, 'USD', 8, 0],
    ['Gulf Distribution LLC', 'Picking', 'CTN', 0.5, 'USD', 12, 0],
    ['Gulf Distribution LLC', 'Packing', 'PLT', 4.5, 'USD', 15, 0],
    ['Gulf Distribution LLC', 'Kitting', 'PCS', 0.12, 'USD', 5, 300],
    ['Nordwind Retail', 'Picking', 'CTN', 0.4, 'EUR', 10, 0],
    ['Nordwind Retail', 'Labeling', 'PCS', 0.07, 'EUR', 5, 0],
    ['Nordwind Retail', 'Cycle Count', 'PLT', 2.0, 'EUR', 8, 0],
  ]
  for (const [customer, activity, uom, unitRate, currency, minimumCharge, minimumFixedValue] of uvSeed) {
    unitValues.push({ id: uid('uv'), customer, activity, uom, unitRate, currency, minimumCharge, minimumFixedValue })
  }

  const storageRates = []
  for (const c of customers) {
    storageRates.push({ id: uid('sr'), customer: c.name, storageType: 'Normal Storage', unitRate: 0.35, currency: c.currency })
    storageRates.push({ id: uid('sr'), customer: c.name, storageType: 'Cold Storage', unitRate: 0.85, currency: c.currency })
  }

  const handlingRates = customers.map((c) => ({
    id: uid('hr'), customer: c.name,
    container20: 90, container40: 140, trailer20: 80, trailer40: 120,
    loosePerCbm: 3.5, minimumCharge: 50, monthlyMinimum: 0, currency: c.currency,
  }))
  handlingRates[0].monthlyMinimum = 800

  const users = [
    { id: uid('usr'), name: 'System Developer', userId: 'developer', passwordHash: hDev, role: 'Developer', active: true, allowedPages: null },
    { id: uid('usr'), name: 'Warehouse Admin', userId: 'admin', passwordHash: hAdmin, role: 'Admin', active: true, allowedPages: null },
    { id: uid('usr'), name: 'Warehouse Supervisor', userId: 'supervisor', passwordHash: hSup, role: 'Supervisor', active: true, allowedPages: null },
    { id: uid('usr'), name: 'Warehouse Operator', userId: 'user', passwordHash: hUser, role: 'User', active: true, allowedPages: null },
  ]

  const db = {
    version: 1, createdAt: nowISO(), users, customers, activitiesMaster, uoms, currencies, vehicleTypes, storageTypes,
    accountHolders: [], unitValues, storageRates, handlingRates, handlingCharges: [], storageMovements: [], operationsActivities: [],
    pendingAssignments: [], vasCharges: [], attendance: [], billedRecords: [], auditLog: [],
    settings: { billingApiUrl: '' },
  }

  seedDemoTransactions(db)
  db.auditLog.push({ id: uid('log'), dateTime: nowISO(), user: 'system', action: 'Seed', entityType: 'System', details: 'Initial database seeded with demo data' })
  return db
}

function seedDemoTransactions(db) {
  const rng = mulberry32(20260704)
  const operators = [
    { userId: 'user', name: 'Warehouse Operator' },
    { userId: 'admin', name: 'Warehouse Admin' },
  ]
  const normals = db.activitiesMaster.filter((a) => !a.storageType)
  const today = new Date()

  for (let back = 21; back >= 1; back--) {
    const d = new Date(today)
    d.setDate(d.getDate() - back)
    if (d.getDay() === 5) continue
    const dateIso = toISODate(d)

    for (const u of operators) {
      const inH = 7 + Math.floor(rng() * 2)
      const hours = 8 + rng() * 1.5
      const ci = new Date(d); ci.setHours(inH, Math.floor(rng() * 50), 0, 0)
      const co = new Date(ci.getTime() + hours * 3600 * 1000)
      db.attendance.push({
        id: uid('att'), userId: u.userId, userName: u.name, date: dateIso,
        checkInTime: ci.toISOString(), checkOutTime: co.toISOString(), hoursReported: round2(hours),
      })
    }

    const nActs = 2 + Math.floor(rng() * 3)
    for (let i = 0; i < nActs; i++) {
      const cust = db.customers[Math.floor(rng() * db.customers.length)]
      const act = normals[Math.floor(rng() * normals.length)]
      const uv = db.unitValues.find((v) => v.customer === cust.name && v.activity === act.name)
      const u = operators[Math.floor(rng() * operators.length)]
      const durS = Math.round((0.5 + rng() * 2.5) * 3600)
      const st = new Date(d); st.setHours(8 + i * 2, Math.floor(rng() * 40), 0, 0)
      const en = new Date(st.getTime() + durS * 1000)
      db.operationsActivities.push({
        id: uid('op'), customerName: cust.name,
        customerRef: cust.references[Math.floor(rng() * cust.references.length)],
        date: dateIso, type: act.name, storageType: null, status: 'complete',
        startTime: st.toISOString(), endTime: en.toISOString(),
        accumulatedSeconds: durS, lastResumeTime: null, durationSeconds: durS,
        qty: Math.round(20 + rng() * 300), uom: uv ? uv.uom : 'CTN',
        cbm: null, storageTypeUsed: null, handlingMode: null, vehicleType: null,
        truckCount: null, packageQty: null, packageUom: null,
        owner: u.userId, ownerName: u.name, participants: [], outcome: 'finished',
      })
    }

    if (rng() < 0.55) {
      const inbound = rng() < 0.5
      const act = db.activitiesMaster.find((a) => a.storageType === (inbound ? 'inbound' : 'outbound'))
      const cust = db.customers[Math.floor(rng() * db.customers.length)]
      const u = operators[Math.floor(rng() * operators.length)]
      const cbm = round2(15 + rng() * 60)
      const container = rng() < 0.7
      const vehicleType = rng() < 0.5 ? '20ft' : '40ft'
      const trucks = 1 + Math.floor(rng() * 2)
      const durS = Math.round((0.75 + rng() * 1.5) * 3600)
      const st = new Date(d); st.setHours(13, Math.floor(rng() * 40), 0, 0)
      const en = new Date(st.getTime() + durS * 1000)
      const ref = cust.references[Math.floor(rng() * cust.references.length)]
      const opId = uid('op')
      db.operationsActivities.push({
        id: opId, customerName: cust.name, customerRef: ref, date: dateIso,
        type: act.name, storageType: act.storageType, status: 'complete',
        startTime: st.toISOString(), endTime: en.toISOString(),
        accumulatedSeconds: durS, lastResumeTime: null, durationSeconds: durS,
        qty: null, uom: null, cbm,
        storageTypeUsed: rng() < 0.8 ? 'Normal Storage' : 'Cold Storage',
        handlingMode: container ? 'Container' : 'Loose',
        vehicleType: container ? vehicleType : null, truckCount: container ? trucks : null,
        packageQty: Math.round(50 + rng() * 200), packageUom: 'CTN',
        owner: u.userId, ownerName: u.name, participants: [], outcome: 'finished',
      })
      const op = db.operationsActivities[db.operationsActivities.length - 1]
      db.storageMovements.push({
        id: uid('mov'), customer: cust.name, date: dateIso, reference: ref,
        type: inbound ? 'Inbound' : 'Outbound', cbm, storage: op.storageTypeUsed,
        handlingMode: op.handlingMode, containerSize: op.vehicleType, truckCount: op.truckCount,
        packageQty: op.packageQty, packageUom: op.packageUom,
        storageDays: null, sourceActivityId: opId,
      })
    }

    if (rng() < 0.3) {
      const cust = db.customers[Math.floor(rng() * db.customers.length)]
      db.vasCharges.push({
        id: uid('vas'), customerName: cust.name, date: dateIso,
        vasReference: `VAS-${dateIso.replaceAll('-', '')}`,
        quantity: Math.round(5 + rng() * 40), charges: round2(1 + rng() * 4), currency: cust.currency,
      })
    }
  }
}
