// Pure record-level merge logic for the single-document store. Kept free of any
// database or framework imports so it can be unit-tested in isolation and reused
// by db.js. Applies a set of per-collection changes onto an authoritative state
// object so concurrent clients never overwrite each other's whole document.

const AUDIT_LOG_CAP = 5000

function mergeRecord(key, existing, incoming) {
  // The client never receives password hashes (stripped on GET), so a user
  // upsert must never wipe the server-held hash.
  if (key === 'users') {
    return { ...incoming, passwordHash: incoming.passwordHash || existing.passwordHash || null }
  }
  return incoming
}

function mergeCollection(existing, change, key) {
  const arr = Array.isArray(existing) ? existing : []
  const upserts = Array.isArray(change.upserts) ? change.upserts : []
  const removes = new Set(Array.isArray(change.removes) ? change.removes : [])
  const upsertMap = new Map(upserts.map((r) => [r.id, r]))
  const seen = new Set()
  const result = []
  // Preserve existing order; replace in place; drop removed.
  for (const rec of arr) {
    if (removes.has(rec.id)) continue
    if (upsertMap.has(rec.id)) {
      result.push(mergeRecord(key, rec, upsertMap.get(rec.id)))
      seen.add(rec.id)
    } else {
      result.push(rec)
    }
  }
  // Append genuinely new records.
  for (const rec of upserts) {
    if (!seen.has(rec.id) && !removes.has(rec.id)) result.push(rec)
  }
  // The audit log is newest-first and capped.
  if (key === 'auditLog') {
    result.sort((a, b) => String(b.dateTime || '').localeCompare(String(a.dateTime || '')))
    return result.slice(0, AUDIT_LOG_CAP)
  }
  return result
}

export function applyChanges(state, changes) {
  const next = { ...state }
  for (const [key, change] of Object.entries(changes)) {
    if (!change || typeof change !== 'object') continue
    if ('value' in change) {
      next[key] = change.value
    } else {
      next[key] = mergeCollection(next[key], change, key)
    }
  }
  return next
}
