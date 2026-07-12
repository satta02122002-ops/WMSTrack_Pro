import pg from 'pg'
import { applyChanges } from './merge.js'
import { shouldSnapshot, SNAPSHOT_KEEP } from './snapshot.js'

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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state_history (
      id BIGSERIAL PRIMARY KEY,
      version INTEGER NOT NULL,
      data JSONB NOT NULL,
      saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS app_state_history_saved_at_idx ON app_state_history (saved_at DESC)')
  initialized = true
}

// Best-effort point-in-time backup. Time-spaced and pruned so it never blocks
// or breaks a save — any failure is logged and swallowed.
async function captureSnapshot(data, version) {
  try {
    const { rows } = await pool.query('SELECT EXTRACT(EPOCH FROM MAX(saved_at)) * 1000 AS last FROM app_state_history')
    const lastMs = rows[0]?.last != null ? Number(rows[0].last) : null
    if (!shouldSnapshot(lastMs)) return
    await pool.query('INSERT INTO app_state_history (version, data) VALUES ($1, $2)', [version, JSON.stringify(data)])
    await pool.query(
      'DELETE FROM app_state_history WHERE id NOT IN (SELECT id FROM app_state_history ORDER BY saved_at DESC LIMIT $1)',
      [SNAPSHOT_KEEP],
    )
  } catch (err) {
    console.error('Snapshot capture failed (non-fatal):', err.message)
  }
}

export async function listSnapshots() {
  await init()
  const { rows } = await pool.query('SELECT id, version, saved_at FROM app_state_history ORDER BY saved_at DESC LIMIT 100')
  return rows.map((r) => ({ id: String(r.id), version: r.version, savedAt: r.saved_at }))
}

export async function getSnapshotData(id) {
  await init()
  const { rows } = await pool.query('SELECT data FROM app_state_history WHERE id = $1', [id])
  return rows.length ? rows[0].data : null
}

// Force a snapshot of the current state regardless of cadence (used before a
// restore so the restore itself is undoable). Best-effort.
export async function forceSnapshot() {
  try {
    const cur = await getState()
    if (cur) await pool.query('INSERT INTO app_state_history (version, data) VALUES ($1, $2)', [cur.version, JSON.stringify(cur.data)])
  } catch (err) {
    console.error('forceSnapshot failed (non-fatal):', err.message)
  }
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
  await captureSnapshot(data, rows[0].version)
  return rows[0].version
}

// ---- Record-level merge --------------------------------------------------
// The pure merge logic lives in merge.js so it can be unit-tested without a DB.

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
    await captureSnapshot(merged, up[0].version)
    return { data: merged, version: up[0].version }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}
