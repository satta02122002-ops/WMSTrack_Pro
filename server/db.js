import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com')
    ? { rejectUnauthorized: false }
    : false,
})

let initialized = false

async function init() {
  if (initialized) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data JSONB NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  initialized = true
}

export async function getState() {
  await init()
  const { rows } = await pool.query('SELECT data, version FROM app_state WHERE id = 1')
  if (!rows.length) return null
  return { data: rows[0].data, version: rows[0].version }
}

export async function setState(data) {
  await init()
  const { rows } = await pool.query(
    `INSERT INTO app_state (id, data, version, updated_at)
     VALUES (1, $1, 1, NOW())
     ON CONFLICT (id) DO UPDATE SET
       data = $1,
       version = app_state.version + 1,
       updated_at = NOW()
     RETURNING version`,
    [JSON.stringify(data)],
  )
  return rows[0].version
}

// ---- Record-level merge --------------------------------------------------
// Applies a set of per-collection changes onto the authoritative state so
// concurrent clients never overwrite each other's whole document.

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
    return result.slice(0, 5000)
  }
  return result
}

function applyChanges(state, changes) {
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

export async function applyChangesTx(changes) {
  await init()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT data FROM app_state WHERE id = 1 FOR UPDATE')
    if (!rows.length) {
      await client.query('ROLLBACK')
      return null
    }
    const merged = applyChanges(rows[0].data, changes)
    const { rows: up } = await client.query(
      `UPDATE app_state SET data = $1, version = version + 1, updated_at = NOW()
       WHERE id = 1 RETURNING version`,
      [JSON.stringify(merged)],
    )
    await client.query('COMMIT')
    return { data: merged, version: up[0].version }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}
