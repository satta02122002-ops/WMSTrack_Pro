import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeBillingLines, computeBillingLinesRange, manualHandlingAmount } from '../src/billing.js'

function baseDb(over = {}) {
  return {
    customers: [{ id: 'c1', name: 'Acme', currency: 'USD' }],
    currencies: [{ id: 'u', name: 'USD' }],
    unitValues: [], operationsActivities: [],
    storageRates: [{ id: 'sr', customer: 'Acme', storageType: 'Normal Storage', unitRate: 0.5, monthlyMinimum: 0, currency: 'USD' }],
    handlingRates: [{ id: 'hr', customer: 'Acme', loosePerCbm: 3.5, minimumCharge: 0, monthlyMinimum: 0, currency: 'USD', container20: 50, container40: 80, trailer20: 0, trailer40: 0 }],
    handlingCharges: [], vasCharges: [], storageMovements: [],
    ...over,
  }
}

test('storage bills one line per day: rate x CBM per day', () => {
  const db = baseDb({ storageMovements: [{ id: 'm1', customer: 'Acme', date: '2026-07-05', reference: 'R', type: 'Inbound', cbm: 10, storage: 'Normal Storage', storageDays: 4 }] })
  const storage = computeBillingLines(db, '2026-07').filter((l) => l.source === 'storage')
  assert.equal(storage.length, 4)
  assert.deepEqual(storage.map((l) => l.date), ['2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08'])
  storage.forEach((l) => assert.equal(l.totalValue, 5)) // 10 * 0.5
  assert.equal(storage.reduce((s, l) => s + l.totalValue, 0), 20)
  // customer reference shows only on the movement's own date, blank after
  assert.equal(storage[0].customerRef, 'R')
  assert.deepEqual(storage.slice(1).map((l) => l.customerRef), ['', '', ''])
})

test('storage monthly minimum tops up the shortfall', () => {
  const db = baseDb({
    storageRates: [{ id: 'sr', customer: 'Acme', storageType: 'Normal Storage', unitRate: 0.5, monthlyMinimum: 200, currency: 'USD' }],
    storageMovements: [{ id: 'm1', customer: 'Acme', date: '2026-07-05', reference: 'R', type: 'Inbound', cbm: 10, storage: 'Normal Storage', storageDays: 20 }], // 10*0.5*20 = 100
  })
  const min = computeBillingLines(db, '2026-07').find((l) => l.source === 'minimum' && l.reportType === 'Storage')
  assert.ok(min)
  assert.equal(min.totalValue, 100) // 200 - 100
})

test('handling is billed once per movement, honouring applyHandling', () => {
  const mov = (extra) => ({ id: 'm1', customer: 'Acme', date: '2026-07-05', reference: 'R', type: 'Inbound', cbm: 10, storage: 'Normal Storage', handlingMode: 'Container', containerSize: '20ft', truckCount: 2, ...extra })
  const han = (db) => computeBillingLines(db, '2026-07').find((l) => l.id === 'han:m1')
  assert.equal(han(baseDb({ storageMovements: [mov({ applyHandling: true })] })).totalValue, 100) // 2 * 50
  assert.equal(han(baseDb({ storageMovements: [mov({ applyHandling: false })] })), undefined)
  assert.equal(han(baseDb({ storageMovements: [mov({})] })).totalValue, 100) // legacy undefined = apply
})

test('manual handling is priced from Master Data with minimum applied', () => {
  const db = baseDb({
    handlingRates: [{ id: 'hr', customer: 'Acme', loosePerCbm: 3.5, minimumCharge: 50, monthlyMinimum: 0, currency: 'USD', container20: 0, container40: 0, trailer20: 0, trailer40: 0 }],
    handlingCharges: [
      { id: 'h1', customerName: 'Acme', date: '2026-07-05', reference: 'J1', cbm: 25, packageQty: 100, packageUom: 'CTN' },
      { id: 'h2', customerName: 'Acme', date: '2026-07-06', reference: 'J2', cbm: 5, packageQty: 1, packageUom: 'CTN' },
    ],
  })
  assert.equal(manualHandlingAmount(db, db.handlingCharges[0]).amount, 87.5) // 25 * 3.5
  const h2 = manualHandlingAmount(db, db.handlingCharges[1])
  assert.equal(h2.amount, 50) // 5*3.5=17.5 -> min 50
  assert.equal(h2.minimumApplied, true)
  assert.equal(manualHandlingAmount({ ...db, handlingRates: [] }, db.handlingCharges[0]).rateMissing, true)
})

test('activity lines apply per-job minimum charge', () => {
  const db = baseDb({
    unitValues: [{ id: 'uv', customer: 'Acme', activity: 'Picking', uom: 'CTN', unitRate: 0.5, currency: 'USD', minimumCharge: 100, minimumFixedValue: 0 }],
    operationsActivities: [{ id: 'a1', status: 'complete', storageType: null, customerName: 'Acme', type: 'Picking', date: '2026-07-10', customerRef: 'PO', qty: 10, uom: 'CTN' }],
  })
  const line = computeBillingLines(db, '2026-07').find((l) => l.source === 'activity')
  assert.equal(line.totalValue, 100) // 10*0.5=5 -> min 100
  assert.equal(line.minimumApplied, true)
})

test('date-range filters transactional lines and gates monthly minimums to whole months', () => {
  const db = baseDb({ storageMovements: [{ id: 'm1', customer: 'Acme', date: '2026-07-05', reference: 'R', type: 'Inbound', cbm: 10, storage: 'Normal Storage', storageDays: 6 }] })
  const inRange = computeBillingLinesRange(db, '2026-07-06', '2026-07-08').filter((l) => l.source === 'storage')
  assert.deepEqual(inRange.map((l) => l.date), ['2026-07-06', '2026-07-07', '2026-07-08'])
  // invalid range
  assert.equal(computeBillingLinesRange(db, '2026-07-31', '2026-07-01').length, 0)
})
