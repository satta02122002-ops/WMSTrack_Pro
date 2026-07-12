import { createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'logitrack-dev-secret-change-in-production'
const JWT_EXPIRY = '24h'
const SALT_ROUNDS = 10

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('WARNING: JWT_SECRET environment variable not set. Using insecure default.')
}

// Baseline password policy: at least 8 characters, with a letter and a number.
// Applied when a password is set/changed; existing weaker passwords still log
// in until they are next changed.
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters long' }
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { ok: false, error: 'Password must include at least one letter and one number' }
  }
  return { ok: true }
}

export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password, storedHash) {
  if (storedHash.startsWith('$2')) {
    return bcrypt.compare(password, storedHash)
  }
  const sha = createHash('sha256').update(password).digest('hex')
  return sha === storedHash
}

export function isLegacyHash(hash) {
  return hash && !hash.startsWith('$2')
}

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY })
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  let token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token && req.body?.token) {
    token = req.body.token
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  try {
    req.user = verifyToken(token)
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
