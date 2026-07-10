import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const DB_PATH = join(DATA_DIR, 'logitrack.db')

mkdirSync(DATA_DIR, { recursive: true })

const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  )
`)

const getStmt = sqlite.prepare('SELECT data, version, updated_at FROM app_state WHERE id = 1')
const insertStmt = sqlite.prepare(
  'INSERT INTO app_state (id, data, version, updated_at) VALUES (1, ?, 1, ?)',
)
const updateStmt = sqlite.prepare(
  'UPDATE app_state SET data = ?, version = version + 1, updated_at = ? WHERE id = 1',
)

export function getState() {
  const row = getStmt.get()
  if (!row) return null
  return { data: JSON.parse(row.data), version: row.version }
}

export function setState(data) {
  const now = new Date().toISOString()
  const existing = getStmt.get()
  if (!existing) {
    insertStmt.run(JSON.stringify(data), now)
  } else {
    updateStmt.run(JSON.stringify(data), now)
  }
  return getStmt.get().version
}
