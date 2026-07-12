import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canWriteCollection, filterAuthorizedChanges } from '../server/authz.js'

test('Users may write only operational collections', () => {
  for (const c of ['operationsActivities', 'storageMovements', 'attendance', 'auditLog']) {
    assert.equal(canWriteCollection(c, 'User'), true, `User -> ${c}`)
  }
  for (const c of ['users', 'customers', 'storageRates', 'handlingRates', 'handlingCharges', 'vasCharges', 'billedRecords', 'settings', 'storageTypes']) {
    assert.equal(canWriteCollection(c, 'User'), false, `User -> ${c}`)
  }
})

test('Supervisors may write operations, storage movements and handling charges', () => {
  for (const c of ['operationsActivities', 'storageMovements', 'handlingCharges', 'auditLog']) {
    assert.equal(canWriteCollection(c, 'Supervisor'), true, `Supervisor -> ${c}`)
  }
  for (const c of ['users', 'customers', 'storageRates', 'vasCharges', 'billedRecords', 'settings']) {
    assert.equal(canWriteCollection(c, 'Supervisor'), false, `Supervisor -> ${c}`)
  }
})

test('Admin and Developer may write every known collection', () => {
  const collections = ['users', 'customers', 'storageRates', 'handlingRates', 'vasCharges', 'billedRecords', 'settings', 'operationsActivities', 'storageMovements', 'attendance', 'auditLog', 'handlingCharges', 'storageTypes']
  for (const role of ['Admin', 'Developer']) {
    for (const c of collections) assert.equal(canWriteCollection(c, role), true, `${role} -> ${c}`)
  }
})

test('unknown collections are denied (whitelist)', () => {
  assert.equal(canWriteCollection('__proto__', 'Developer'), false)
  assert.equal(canWriteCollection('somethingNew', 'Admin'), false)
})

test('filterAuthorizedChanges splits allowed vs denied', () => {
  const changes = {
    operationsActivities: { upserts: [{ id: 'o1' }], removes: [] },
    auditLog: { upserts: [{ id: 'l1' }], removes: [] },
    users: { upserts: [{ id: 'u1', role: 'Developer' }], removes: [] }, // escalation attempt
    storageRates: { upserts: [{ id: 'r1' }], removes: [] },
  }
  const { allowed, denied } = filterAuthorizedChanges(changes, 'User')
  assert.deepEqual(Object.keys(allowed).sort(), ['auditLog', 'operationsActivities'])
  assert.deepEqual(denied.sort(), ['storageRates', 'users'])

  // Admin: nothing denied
  const asAdmin = filterAuthorizedChanges(changes, 'Admin')
  assert.equal(asAdmin.denied.length, 0)
  assert.deepEqual(Object.keys(asAdmin.allowed).sort(), ['auditLog', 'operationsActivities', 'storageRates', 'users'])
})
