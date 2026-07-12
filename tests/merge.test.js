import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyChanges } from '../server/merge.js'

const baseState = () => ({
  users: [{ id: 'u1', userId: 'admin', role: 'Admin', passwordHash: '$2aHASH' }],
  customers: [{ id: 'c1', name: 'Acme' }, { id: 'c2', name: 'Gulf' }],
  auditLog: [{ id: 'l0', dateTime: '2026-01-01T00:00:00Z', action: 'Seed' }],
  settings: { billingApiUrl: '' },
})

test('upsert adds new and updates existing records, preserving order', () => {
  const next = applyChanges(baseState(), {
    customers: { upserts: [{ id: 'c1', name: 'Acme Renamed' }, { id: 'c3', name: 'Nordwind' }], removes: [] },
  })
  assert.deepEqual(next.customers.map((c) => c.id), ['c1', 'c2', 'c3'])
  assert.equal(next.customers[0].name, 'Acme Renamed')
})

test('remove deletes records and is not resurrected', () => {
  const next = applyChanges(baseState(), { customers: { upserts: [], removes: ['c2'] } })
  assert.deepEqual(next.customers.map((c) => c.id), ['c1'])
})

test('user upsert never wipes the server-held password hash', () => {
  const next = applyChanges(baseState(), {
    users: { upserts: [{ id: 'u1', userId: 'admin', role: 'Supervisor' }], removes: [] },
  })
  assert.equal(next.users[0].role, 'Supervisor')
  assert.equal(next.users[0].passwordHash, '$2aHASH')
})

test('scalar fields are replaced wholesale', () => {
  const next = applyChanges(baseState(), { settings: { value: { billingApiUrl: 'https://erp/api' } } })
  assert.deepEqual(next.settings, { billingApiUrl: 'https://erp/api' })
})

test('audit log stays newest-first and capped at 5000', () => {
  const many = Array.from({ length: 5100 }, (_, i) => ({ id: `x${i}`, dateTime: `2026-02-01T00:${String(i % 60).padStart(2, '0')}:00Z` }))
  const next = applyChanges(baseState(), { auditLog: { upserts: many, removes: [] } })
  assert.equal(next.auditLog.length, 5000)
  // newest first
  assert.ok(next.auditLog[0].dateTime >= next.auditLog[1].dateTime)
})

test('two independent collection changes both survive (no clobber)', () => {
  let s = baseState()
  s = applyChanges(s, { customers: { upserts: [{ id: 'c3', name: 'New' }], removes: [] } })
  s = applyChanges(s, { customers: { upserts: [{ id: 'c1', name: 'Edited' }], removes: ['c2'] } })
  assert.deepEqual(s.customers.map((c) => c.id).sort(), ['c1', 'c3'])
  assert.equal(s.customers.find((c) => c.id === 'c1').name, 'Edited')
})
