import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getState, setState, applyChangesTx, listSnapshots, getSnapshotData, forceSnapshot } from './db.js'
import { hashPassword, verifyPassword, isLegacyHash, signToken, authMiddleware, validatePassword } from './auth.js'
import { seedDb } from './seed.js'
import { filterAuthorizedChanges } from './authz.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001
const app = express()

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1)
}

// Content-Security-Policy for the self-hosted SPA. 'unsafe-inline' is allowed
// only for styles (the app uses inline <style>/style props); scripts are
// same-origin only. connect-src also permits https: so the optional external
// billing-API submit works.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ')

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Content-Security-Policy', CSP)
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  res.setHeader('X-XSS-Protection', '0') // deprecated; disabled per modern guidance
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  next()
})

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
}))
app.use(express.json({ limit: '10mb' }))

// General API backstop against abuse. The high-frequency authenticated poll
// (GET /api/db) and save (POST /api/db/sync) are exempt so normal use is never
// throttled; static assets are not counted either.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
  skip: (req) => {
    if (!req.path.startsWith('/api')) return true
    if (req.method === 'GET' && req.path === '/api/db') return true
    if (req.method === 'POST' && req.path === '/api/db/sync') return true
    return false
  },
})
app.use(generalLimiter)

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Tighter limit on password-mutation endpoints (defence in depth).
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many password requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

function stripPasswordHashes(data) {
  if (!data?.users) return data
  return {
    ...data,
    users: data.users.map(({ passwordHash, ...rest }) => rest),
  }
}

// ---- Auto-seed on startup ------------------------------------------------

async function ensureSeeded() {
  const state = await getState()
  if (!state) {
    console.log('Database is empty — seeding initial data...')
    const data = await seedDb()
    await setState(data)
    console.log('Database seeded with demo data (4 default users)')
  }
}

ensureSeeded().catch((err) => console.error('Auto-seed failed:', err))

// ---- Auth endpoints (no middleware) ---------------------------------------

app.post('/api/login', loginLimiter, async (req, res) => {
  try {
    const { userId, password } = req.body
    if (!userId || !password) {
      return res.status(400).json({ error: 'User ID and password are required' })
    }

    const state = await getState()
    if (!state?.data?.users) {
      return res.status(500).json({ error: 'Database not initialized' })
    }

    const user = state.data.users.find(
      (u) => u.userId.toLowerCase() === String(userId).trim().toLowerCase(),
    )
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Invalid credentials. Please check your User ID and password.' })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials. Please check your User ID and password.' })
    }

    if (isLegacyHash(user.passwordHash)) {
      const bcryptHash = await hashPassword(password)
      state.data.users = state.data.users.map((u) =>
        u.id === user.id ? { ...u, passwordHash: bcryptHash } : u,
      )
      await setState(state.data)
      console.log(`Upgraded password hash for user ${user.userId} from SHA-256 to bcrypt`)
    }

    const token = signToken({ id: user.id, userId: user.userId, role: user.role })
    res.json({
      ok: true,
      token,
      user: { id: user.id, userId: user.userId, name: user.name, role: user.role },
    })
  } catch (err) {
    console.error('POST /api/login error:', err)
    res.status(500).json({ error: 'Login failed' })
  }
})

// ---- Protected endpoints --------------------------------------------------

app.post('/api/change-password', authMiddleware, passwordLimiter, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old and new passwords are required' })
    }
    const policy = validatePassword(newPassword)
    if (!policy.ok) return res.status(400).json({ error: policy.error })

    const state = await getState()
    const user = state?.data?.users?.find((u) => u.id === req.user.id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const valid = await verifyPassword(oldPassword, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' })

    const newHash = await hashPassword(newPassword)
    state.data.users = state.data.users.map((u) =>
      u.id === user.id ? { ...u, passwordHash: newHash } : u,
    )
    await setState(state.data)
    res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/change-password error:', err)
    res.status(500).json({ error: 'Failed to change password' })
  }
})

app.post('/api/set-user-password', authMiddleware, passwordLimiter, async (req, res) => {
  try {
    if (!['Admin', 'Developer'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Admin or Developer can set user passwords' })
    }

    const { targetUserId, password } = req.body
    if (!targetUserId || !password) {
      return res.status(400).json({ error: 'Target user ID and password are required' })
    }
    const policy = validatePassword(password)
    if (!policy.ok) return res.status(400).json({ error: policy.error })

    const state = await getState()
    const user = state?.data?.users?.find(
      (u) => u.userId.toLowerCase() === String(targetUserId).trim().toLowerCase(),
    )
    if (!user) return res.status(404).json({ error: 'User not found' })

    const newHash = await hashPassword(password)
    state.data.users = state.data.users.map((u) =>
      u.id === user.id ? { ...u, passwordHash: newHash } : u,
    )
    await setState(state.data)
    res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/set-user-password error:', err)
    res.status(500).json({ error: 'Failed to set password' })
  }
})

app.get('/api/db', authMiddleware, async (_req, res) => {
  try {
    const state = await getState()
    if (!state) return res.json({ data: null, version: 0 })
    res.json({ data: stripPasswordHashes(state.data), version: state.version })
  } catch (err) {
    console.error('GET /api/db error:', err)
    res.status(500).json({ error: 'Failed to read database' })
  }
})

// Record-level sync: clients send only their per-collection changes, which are
// merged into the authoritative document under a row lock so concurrent users
// never overwrite each other. Also handles sendBeacon (token in body).
app.post('/api/db/sync', authMiddleware, async (req, res) => {
  try {
    const { changes } = req.body
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      return res.status(400).json({ error: 'Missing or invalid changes' })
    }
    // Authorization: apply only the collections this role may write; drop the
    // rest (e.g. a User cannot escalate via `users`, or edit master data/rates).
    // Stripping rather than rejecting keeps a legitimate multi-collection save
    // from failing wholesale; denied writes never persist and revert on poll.
    const { allowed, denied } = filterAuthorizedChanges(changes, req.user.role)
    if (denied.length) {
      console.warn(`sync: denied ${req.user.role} write to [${denied.join(', ')}] by ${req.user.userId}`)
    }
    if (Object.keys(allowed).length === 0) {
      const current = await getState()
      return res.json({ ok: true, version: current?.version || 0, data: stripPasswordHashes(current?.data || {}) })
    }
    const result = await applyChangesTx(allowed)
    if (!result) return res.status(500).json({ error: 'Database not initialized' })
    res.json({ ok: true, version: result.version, data: stripPasswordHashes(result.data) })
  } catch (err) {
    console.error('POST /api/db/sync error:', err)
    res.status(500).json({ error: 'Failed to sync database' })
  }
})

app.post('/api/db/reset', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Developer') {
      return res.status(403).json({ error: 'Only Developer role can reset the database' })
    }
    const data = await seedDb()
    const version = await setState(data)
    res.json({ ok: true, version, data: stripPasswordHashes(data) })
  } catch (err) {
    console.error('POST /api/db/reset error:', err)
    res.status(500).json({ error: 'Failed to reset database' })
  }
})

app.post('/api/db/clear-demo-data', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Developer') {
      return res.status(403).json({ error: 'Only Developer role can clear demo data' })
    }
    const current = await getState()
    if (!current?.data) return res.status(500).json({ error: 'Database not initialized' })

    const data = {
      ...current.data,
      customers: [],
      activitiesMaster: [],
      uoms: [],
      currencies: [],
      vehicleTypes: [],
      storageTypes: [],
      unitValues: [],
      storageRates: [],
      handlingRates: [],
      handlingCharges: [],
      storageMovements: [],
      operationsActivities: [],
      pendingAssignments: [],
      vasCharges: [],
      attendance: [],
      billedRecords: [],
      auditLog: [
        ...(current.data.auditLog || []),
        {
          id: `log_${Date.now().toString(36)}`,
          dateTime: new Date().toISOString(),
          user: req.user.userId,
          action: 'Clear Demo Data',
          entityType: 'System',
          details: 'Demo transactions and master data cleared; user accounts preserved',
        },
      ],
    }
    const version = await setState(data)
    res.json({ ok: true, version, data: stripPasswordHashes(data) })
  } catch (err) {
    console.error('POST /api/db/clear-demo-data error:', err)
    res.status(500).json({ error: 'Failed to clear demo data' })
  }
})

// ---- Backups (point-in-time snapshots) — Developer only -------------------

app.get('/api/db/history', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Developer') {
      return res.status(403).json({ error: 'Only Developer role can view backups' })
    }
    res.json({ snapshots: await listSnapshots() })
  } catch (err) {
    console.error('GET /api/db/history error:', err)
    res.status(500).json({ error: 'Failed to list backups' })
  }
})

app.post('/api/db/restore', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Developer') {
      return res.status(403).json({ error: 'Only Developer role can restore backups' })
    }
    const { id } = req.body
    if (!id) return res.status(400).json({ error: 'Snapshot id is required' })
    const data = await getSnapshotData(id)
    if (!data) return res.status(404).json({ error: 'Snapshot not found' })
    await forceSnapshot() // preserve the current state so the restore is undoable
    const version = await setState(data)
    res.json({ ok: true, version, data: stripPasswordHashes(data) })
  } catch (err) {
    console.error('POST /api/db/restore error:', err)
    res.status(500).json({ error: 'Failed to restore backup' })
  }
})

// ---- Static files ---------------------------------------------------------

const distDir = join(__dirname, '..', 'dist')
app.use(express.static(distDir))
app.get('*', (_req, res) => {
  res.sendFile(join(distDir, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`LogiTrack Pro API server running on http://0.0.0.0:${PORT}`)
})
