import express from 'express'
import cors from 'cors'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getState, setState } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001
const app = express()

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  next()
})

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
}))
app.use(express.json({ limit: '10mb' }))

function validateAppData(data) {
  return data && typeof data === 'object' && !Array.isArray(data)
}

app.get('/api/db', async (_req, res) => {
  try {
    const state = await getState()
    if (!state) return res.json({ data: null, version: 0 })
    res.json(state)
  } catch (err) {
    console.error('GET /api/db error:', err)
    res.status(500).json({ error: 'Failed to read database' })
  }
})

app.put('/api/db', async (req, res) => {
  try {
    const { data } = req.body
    if (!validateAppData(data)) return res.status(400).json({ error: 'Missing or invalid data' })
    const version = await setState(data)
    res.json({ ok: true, version })
  } catch (err) {
    console.error('PUT /api/db error:', err)
    res.status(500).json({ error: 'Failed to save database' })
  }
})

// POST /api/db — same as PUT; needed for navigator.sendBeacon which always sends POST
app.post('/api/db', async (req, res) => {
  try {
    const { data } = req.body
    if (!validateAppData(data)) return res.status(400).json({ error: 'Missing or invalid data' })
    const version = await setState(data)
    res.json({ ok: true, version })
  } catch (err) {
    console.error('POST /api/db error:', err)
    res.status(500).json({ error: 'Failed to save database' })
  }
})

app.post('/api/db/reset', async (req, res) => {
  try {
    const { data } = req.body
    if (!validateAppData(data)) return res.status(400).json({ error: 'Missing or invalid seed data' })
    const version = await setState(data)
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
