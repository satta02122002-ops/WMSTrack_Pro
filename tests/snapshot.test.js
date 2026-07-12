import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldSnapshot, SNAPSHOT_INTERVAL_MS } from '../server/snapshot.js'

test('shouldSnapshot always true when there is no prior snapshot', () => {
  assert.equal(shouldSnapshot(null), true)
  assert.equal(shouldSnapshot(undefined), true)
})

test('shouldSnapshot respects the interval', () => {
  const now = 1_000_000_000_000
  assert.equal(shouldSnapshot(now - (SNAPSHOT_INTERVAL_MS - 1), now), false) // just under interval
  assert.equal(shouldSnapshot(now - SNAPSHOT_INTERVAL_MS, now), true) // exactly at interval
  assert.equal(shouldSnapshot(now - 2 * SNAPSHOT_INTERVAL_MS, now), true) // well past
  assert.equal(shouldSnapshot(now, now), false) // just snapshotted
})
