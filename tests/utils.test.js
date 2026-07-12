import { test } from 'node:test'
import assert from 'node:assert/strict'
import { round2, num, daysToMonthEnd, storageTypeNames } from '../src/utils.js'
import { monthsInRange } from '../src/billing.js'

test('round2 rounds to two decimals', () => {
  assert.equal(round2(3.14159), 3.14)
  assert.equal(round2(2.5), 2.5)
  assert.equal(round2(10 / 3), 3.33)
  assert.equal(round2(5), 5)
})

test('num coerces and falls back', () => {
  assert.equal(num('5'), 5)
  assert.equal(num('3.5'), 3.5)
  assert.equal(num(''), 0)
  assert.equal(num('abc', 7), 7)
  assert.equal(num(undefined, 2), 2)
})

test('daysToMonthEnd counts inclusive days to month end', () => {
  assert.equal(daysToMonthEnd('2026-07-01'), 31) // July
  assert.equal(daysToMonthEnd('2026-07-31'), 1)
  assert.equal(daysToMonthEnd('2026-02-15'), 14) // non-leap Feb (28)
  assert.equal(daysToMonthEnd('2024-02-15'), 15) // leap Feb (29)
})

test('storageTypeNames unions managed list, rates, then defaults', () => {
  assert.deepEqual(
    storageTypeNames({ storageTypes: [{ id: 1, name: 'Cold Storage' }], storageRates: [] }),
    ['Cold Storage'],
  )
  assert.deepEqual(
    storageTypeNames({ storageRates: [{ storageType: 'Normal Storage' }] }),
    ['Normal Storage'],
  )
  assert.deepEqual(storageTypeNames({}), ['Normal Storage', 'Cold Storage', 'Bonded Storage'])
})

test('monthsInRange enumerates months inclusively', () => {
  assert.deepEqual(monthsInRange('2026-06-20', '2026-07-05'), ['2026-06', '2026-07'])
  assert.deepEqual(monthsInRange('2026-07-01', '2026-07-31'), ['2026-07'])
  assert.deepEqual(monthsInRange('2025-11-01', '2026-02-01'), ['2025-11', '2025-12', '2026-01', '2026-02'])
})
