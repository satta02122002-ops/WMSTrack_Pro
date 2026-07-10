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
