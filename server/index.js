import express from 'express'
import cors from 'cors'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getState, setState } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001
const app = express()

app.use(cors())
app.use(express.json({ limit: '50mb' }))

app.get('/api/db', (_req, res) => {
  try {
    const state = getState()
    if (!state) return res.json({ data: null, version: 0 })
    res.json(state)
  } catch (err) {
    console.error('GET /api/db error:', err)
    res.status(500).json({ error: 'Failed to read database' })
  }
})

app.put('/api/db', (req, res) => {
  try {
    const { data } = req.body
    if (!data) return res.status(400).json({ error: 'Missing data' })
    const version = setState(data)
    res.json({ ok: true, version })
  } catch (err) {
    console.error('PUT /api/db error:', err)
    res.status(500).json({ error: 'Failed to save database' })
  }
})

app.post('/api/db/reset', (req, res) => {
  try {
    const { data } = req.body
    if (!data) return res.status(400).json({ error: 'Missing seed data' })
    const version = setState(data)
    res.json({ ok: true, version })
  } catch (err) {
    console.error('POST /api/db/reset error:', err)
    res.status(500).json({ error: 'Failed to reset database' })
  }
})

// Serve static files in production
const distDir = join(__dirname, '..', 'dist')
app.use(express.static(distDir))
app.get('*', (_req, res) => {
  res.sendFile(join(distDir, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`LogiTrack Pro API server running on http://0.0.0.0:${PORT}`)
})
