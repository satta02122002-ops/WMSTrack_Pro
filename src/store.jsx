import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { uid, todayISO, nowISO, activityDuration, round2, num } from './utils.js'

const SESSION_KEY = 'wmstrack_pro_session_v1'
export const REMEMBER_KEY = 'wmstrack_pro_remember_uid'
const API_BASE = '/api'

// ---- Pages & roles -------------------------------------------------------

export const PAGES = [
  { key: 'operations', label: 'Operations Execution', icon: '▶️' },
  { key: 'monitor', label: 'Operations Monitor', icon: '📡' },
  { key: 'storage', label: 'Storage & Handling', icon: '📦' },
  { key: 'vas', label: 'Value Added Services', icon: '🏷️' },
  { key: 'reports', label: 'Reports', icon: '📄' },
  { key: 'billing', label: 'Monthly Billing', icon: '💰' },
  { key: 'masterdata', label: 'Master Data', icon: '🗂️' },
  { key: 'parameter', label: 'Parameter', icon: '⚙️' },
  { key: 'attendance', label: 'Attendance', icon: '🕒' },
  { key: 'productivity', label: 'Productivity', icon: '📈' },
  { key: 'analytics', label: 'Performance Analytics', icon: '📊' },
  { key: 'activitylog', label: 'Activity Log', icon: '📜' },
  { key: 'users', label: 'User & Authorization', icon: '👥' },
]

export const ROLES = ['Developer', 'Admin', 'Supervisor', 'User']

export const ROLE_PAGES = {
  Developer: PAGES.map((p) => p.key),
  Admin: PAGES.map((p) => p.key).filter((k) => k !== 'users'),
  Supervisor: ['operations', 'monitor', 'storage', 'reports'],
  User: ['operations'],
}

export function pagesForUser(user) {
  if (!user) return []
  if (user.role === 'Developer') return ROLE_PAGES.Developer
  if (Array.isArray(user.allowedPages) && user.allowedPages.length) {
    return user.allowedPages.filter((k) => k !== 'users' || user.role === 'Developer')
  }
  return ROLE_PAGES[user.role] || []
}

// ---- Token management ----------------------------------------------------

let _authToken = null

function getToken() {
  if (_authToken) return _authToken
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY))
    return s?.token || null
  } catch {
    return null
  }
}

function setToken(token) {
  _authToken = token
}

function authHeaders() {
  const token = getToken()
  const h = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

// ---- API persistence layer -----------------------------------------------

async function fetchDbFromApi() {
  const res = await fetch(`${API_BASE}/db`, { headers: authHeaders() })
  if (res.status === 401) throw new Error('AUTH_EXPIRED')
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

async function syncDbToApi(changes) {
  const res = await fetch(`${API_BASE}/db/sync`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ changes }),
  })
  if (res.status === 401) throw new Error('AUTH_EXPIRED')
  if (!res.ok) throw new Error(`API sync error: ${res.status}`)
  return res.json()
}

// Compute per-collection changes between a baseline snapshot and the current
// state. Collections are arrays of { id, ... } records; other fields are
// compared whole. Returns null when nothing changed. The server merges these
// changes into the authoritative document so concurrent clients don't clobber
// each other.
const NON_SYNCED_FIELDS = new Set(['version'])

function computeChanges(baseline, current) {
  if (!baseline || !current) return null
  const changes = {}
  const keys = new Set([...Object.keys(baseline), ...Object.keys(current)])
  for (const key of keys) {
    if (NON_SYNCED_FIELDS.has(key)) continue
    const b = baseline[key]
    const c = current[key]
    if (Array.isArray(b) || Array.isArray(c)) {
      const bArr = Array.isArray(b) ? b : []
      const cArr = Array.isArray(c) ? c : []
      const bMap = new Map(bArr.map((r) => [r.id, r]))
      const cMap = new Map(cArr.map((r) => [r.id, r]))
      const upserts = []
      for (const [id, rec] of cMap) {
        const prev = bMap.get(id)
        if (!prev || JSON.stringify(prev) !== JSON.stringify(rec)) upserts.push(rec)
      }
      const removes = []
      for (const id of bMap.keys()) if (!cMap.has(id)) removes.push(id)
      if (upserts.length || removes.length) changes[key] = { upserts, removes }
    } else if (JSON.stringify(b) !== JSON.stringify(c)) {
      changes[key] = { value: c }
    }
  }
  return Object.keys(changes).length ? changes : null
}

// Backfill reference lists added after a database was first created, so legacy
// documents (missing the key entirely) get sensible defaults. Only runs when
// the key is absent — an intentionally emptied list is left alone.
function ensureDefaults(data) {
  if (data && !Array.isArray(data.storageTypes)) {
    return {
      ...data,
      storageTypes: ['Normal Storage', 'Cold Storage', 'Bonded Storage'].map((name) => ({ id: uid('sty'), name })),
    }
  }
  return data
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null
  } catch {
    return null
  }
}

// ---- Store context -------------------------------------------------------

const StoreCtx = createContext(null)

export function useStore() {
  return useContext(StoreCtx)
}

export function StoreProvider({ children }) {
  const [db, setDb] = useState(null)
  const [dbReady, setDbReady] = useState(false)
  const [dbError, setDbError] = useState(null)
  const [session, setSession] = useState(loadSession)
  const [toasts, setToasts] = useState([])
  const [saveStatus, setSaveStatus] = useState('saved')
  const dbRef = useRef(db)
  dbRef.current = db
  const baselineRef = useRef(null) // last state known to match the server
  const saveTimerRef = useRef(null)
  const initialLoadRef = useRef(true)

  // Load database from API on mount (only if we have a token)
  useEffect(() => {
    let cancelled = false
    const token = getToken()

    if (!token) {
      setDbReady(true)
      return
    }

    fetchDbFromApi()
      .then(({ data }) => {
        if (cancelled) return
        if (data && typeof data === 'object' && Array.isArray(data.users)) {
          baselineRef.current = data
          setDb(ensureDefaults(data)) // baseline lacks any backfill, so it syncs on first change
        }
        setDbReady(true)
        setTimeout(() => { initialLoadRef.current = false }, 100)
      })
      .catch((err) => {
        if (cancelled) return
        if (err.message === 'AUTH_EXPIRED') {
          setToken(null)
          setSession(null)
          localStorage.removeItem(SESSION_KEY)
          setDbReady(true)
        } else {
          console.error('Failed to load from API:', err)
          setDbError(err.message)
        }
      })
    return () => { cancelled = true }
  }, [])

  // Debounced save to API on db changes — sends only the per-collection diff
  // so it merges into the server document instead of overwriting it.
  useEffect(() => {
    if (initialLoadRef.current || !db) return

    const changes = computeChanges(baselineRef.current, db)
    if (!changes) {
      setSaveStatus('saved')
      return
    }

    setSaveStatus('saving')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    const snapshot = db
    saveTimerRef.current = setTimeout(() => {
      syncDbToApi(changes)
        .then(() => {
          baselineRef.current = snapshot
          setSaveStatus('saved')
        })
        .catch((err) => {
          console.error('Auto-save failed:', err)
          if (err.message === 'AUTH_EXPIRED') {
            setToken(null)
            setSession(null)
            setDb(null)
            localStorage.removeItem(SESSION_KEY)
          }
          setSaveStatus('error')
        })
    }, 500)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [db])

  // Poll the server for changes made by other users. Skips while this client
  // has unsynced local edits so it never stomps in-flight work.
  useEffect(() => {
    if (!session) return
    const interval = setInterval(() => {
      if (initialLoadRef.current || !dbRef.current) return
      if (computeChanges(baselineRef.current, dbRef.current)) return // dirty; wait
      fetchDbFromApi()
        .then(({ data }) => {
          if (!data || !Array.isArray(data.users)) return
          if (computeChanges(baselineRef.current, dbRef.current)) return // changed while fetching
          baselineRef.current = data
          setDb(data)
        })
        .catch((err) => {
          if (err.message === 'AUTH_EXPIRED') {
            setToken(null)
            setSession(null)
            setDb(null)
            localStorage.removeItem(SESSION_KEY)
          }
        })
    }, 5000)
    return () => clearInterval(interval)
  }, [session])

  // Save on page unload
  useEffect(() => {
    const handleUnload = () => {
      if (!db || initialLoadRef.current) return
      const changes = computeChanges(baselineRef.current, db)
      if (!changes) return
      const token = getToken()
      const blob = new Blob([JSON.stringify({ changes, token })], { type: 'application/json' })
      navigator.sendBeacon(`${API_BASE}/db/sync`, blob)
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [db])

  useEffect(() => {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  }, [session])

  const toast = useCallback((message, kind = 'success') => {
    const id = uid('toast')
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])

  const update = useCallback((fn) => {
    setDb((prev) => {
      const next = fn(prev)
      return next || prev
    })
  }, [])

  const logEntry = useCallback((user, action, entityType, details) => {
    const entry = { id: uid('log'), dateTime: nowISO(), user, action, entityType, details }
    return (dbState) => {
      const log = [entry, ...dbState.auditLog].slice(0, 5000)
      return { ...dbState, auditLog: log }
    }
  }, [])

  const logAction = useCallback(
    (action, entityType, details, userName) => {
      const who = userName || session?.name || 'system'
      update((d) => logEntry(who, action, entityType, details)(d))
    },
    [update, session, logEntry],
  )

  // ---- Auth --------------------------------------------------------------

  const currentUser = useMemo(() => {
    if (!session || !db) return null
    return db.users.find((u) => u.id === session.userRecordId) || null
  }, [db?.users, session])

  const login = useCallback(
    async (userIdInput, password) => {
      try {
        const res = await fetch(`${API_BASE}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: String(userIdInput || '').trim(), password }),
        })
        const result = await res.json()
        if (!res.ok || !result.ok) {
          return { ok: false, error: result.error || 'Login failed' }
        }

        setToken(result.token)
        const sess = {
          userRecordId: result.user.id,
          userId: result.user.userId,
          name: result.user.name,
          role: result.user.role,
          loginAt: nowISO(),
          token: result.token,
        }
        setSession(sess)

        const dbRes = await fetchDbFromApi()
        if (dbRes.data && typeof dbRes.data === 'object') {
          baselineRef.current = dbRes.data
          setDb(ensureDefaults(dbRes.data)) // baseline lacks any backfill, so it syncs on first change
          initialLoadRef.current = false
        }

        return { ok: true }
      } catch (err) {
        console.error('Login error:', err)
        return { ok: false, error: 'Connection error. Please try again.' }
      }
    },
    [],
  )

  const logout = useCallback(
    (silent = false) => {
      if (session && !silent && db) {
        const nextDb = logEntry(session.name, 'Logout', 'Auth', `User ${session.userId} logged out`)(db)
        update(() => nextDb)
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        const changes = computeChanges(baselineRef.current, nextDb)
        if (changes) syncDbToApi(changes).catch(() => {})
      }
      setTimeout(() => {
        setToken(null)
        setSession(null)
        setDb(null)
        initialLoadRef.current = true
      }, 50)
    },
    [session, db, update, logEntry],
  )

  const changePassword = useCallback(
    async (oldPassword, newPassword) => {
      if (!currentUser) return { ok: false, error: 'Not logged in' }
      try {
        const res = await fetch(`${API_BASE}/change-password`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ oldPassword, newPassword }),
        })
        const result = await res.json()
        if (!res.ok || !result.ok) {
          return { ok: false, error: result.error || 'Failed to change password' }
        }
        return { ok: true }
      } catch {
        return { ok: false, error: 'Connection error. Please try again.' }
      }
    },
    [currentUser],
  )

  // ---- Admin user password management -------------------------------------

  const setUserPassword = useCallback(
    async (targetUserId, password) => {
      try {
        const res = await fetch(`${API_BASE}/set-user-password`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ targetUserId, password }),
        })
        const result = await res.json()
        if (!res.ok || !result.ok) {
          return { ok: false, error: result.error || 'Failed to set password' }
        }
        return { ok: true }
      } catch {
        return { ok: false, error: 'Connection error' }
      }
    },
    [],
  )

  // ---- Attendance / daily gate --------------------------------------------

  const todayAttendance = useMemo(() => {
    if (!currentUser || !db) return null
    return (
      db.attendance.find((a) => a.userId === currentUser.userId && a.date === todayISO() && !a.checkOutTime) || null
    )
  }, [db?.attendance, currentUser])

  const isCheckedIn = !!todayAttendance
  // Only the User role checks in/out; Developer, Admin and Supervisor are exempt.
  const attendanceRequired = currentUser?.role === 'User'
  const needsCheckIn = attendanceRequired && !isCheckedIn

  const checkIn = useCallback(() => {
    if (!currentUser || isCheckedIn) return
    const rec = {
      id: uid('att'), userId: currentUser.userId, userName: currentUser.name,
      date: todayISO(), checkInTime: nowISO(), checkOutTime: null, hoursReported: null,
    }
    update((d) => logEntry(currentUser.name, 'Check-In', 'Attendance', `Checked in at warehouse`)({ ...d, attendance: [rec, ...d.attendance] }))
    toast('Checked in — have a productive shift!')
  }, [currentUser, isCheckedIn, update, logEntry, toast])

  const checkOut = useCallback(() => {
    if (!currentUser || !todayAttendance) return
    const end = nowISO()
    const hours = round2((new Date(end) - new Date(todayAttendance.checkInTime)) / 3600000)
    update((d) =>
      logEntry(currentUser.name, 'Check-Out', 'Attendance', `Checked out — ${hours} hours`)({
        ...d,
        attendance: d.attendance.map((a) => (a.id === todayAttendance.id ? { ...a, checkOutTime: end, hoursReported: hours } : a)),
      }),
    )
    toast(`Checked out — ${hours} hours recorded. Logging out.`)
    setTimeout(() => logout(), 600)
  }, [currentUser, todayAttendance, update, logEntry, toast, logout])

  // ---- Operations ----------------------------------------------------------

  const myActiveActivity = useMemo(() => {
    if (!currentUser || !db) return null
    return (
      db.operationsActivities.find(
        (a) =>
          a.status !== 'complete' &&
          (a.owner === currentUser.userId || (a.participants || []).some((p) => p.userId === currentUser.userId)),
      ) || null
    )
  }, [db?.operationsActivities, currentUser])

  // Add several activities at once for the same customer + reference — one
  // assigned activity per selected type (same job, different activities).
  const addActivities = useCallback(
    ({ customerName, customerRef, types, assignedTo }) => {
      if (!currentUser || !types?.length) return
      const assignee = assignedTo ? dbRef.current.users.find((u) => u.userId === assignedTo) : null
      const acts = types.map((type) => {
        const master = dbRef.current.activitiesMaster.find((a) => a.name === type)
        return {
          id: uid('op'), customerName, customerRef, date: todayISO(),
          type, storageType: master?.storageType || null, status: 'assigned',
          startTime: null, endTime: null,
          accumulatedSeconds: 0, lastResumeTime: null, durationSeconds: null,
          qty: null, uom: null, cbm: null, storageTypeUsed: null,
          handlingMode: null, vehicleType: null, truckCount: null, packageQty: null, packageUom: null,
          assignedTo: assignedTo || null, assignedToName: assignee?.name || null,
          owner: null, ownerName: null, participants: [], outcome: null,
          createdBy: currentUser.userId, createdByName: currentUser.name,
        }
      })
      update((d) =>
        logEntry(currentUser.name, 'Assign Activity', 'Operations', `${types.join(', ')} for ${customerName} (${customerRef})${assignee ? ` → ${assignee.name}` : ' (unassigned)'}`)({
          ...d,
          operationsActivities: [...acts, ...d.operationsActivities],
        }),
      )
      toast(`${acts.length} activit${acts.length === 1 ? 'y' : 'ies'} added${assignee ? ` for ${assignee.name}` : ''}`)
      return acts
    },
    [currentUser, update, logEntry, toast],
  )

  // A user picks up an assigned activity and begins executing it.
  const startAssignedActivity = useCallback(
    (id) => {
      if (!currentUser) return
      const act = dbRef.current.operationsActivities.find((a) => a.id === id)
      if (!act || act.status !== 'assigned') return
      update((d) =>
        logEntry(currentUser.name, 'Start Activity', 'Operations', `${act.type} for ${act.customerName} (${act.customerRef})`)({
          ...d,
          operationsActivities: d.operationsActivities.map((a) =>
            a.id === id
              ? { ...a, status: 'in_progress', owner: currentUser.userId, ownerName: currentUser.name, startTime: nowISO(), lastResumeTime: nowISO(), accumulatedSeconds: 0 }
              : a,
          ),
        }),
      )
      toast(`Activity "${act.type}" started`)
    },
    [currentUser, update, logEntry, toast],
  )

  const pauseActivity = useCallback(
    (id) => {
      update((d) =>
        logEntry(session?.name || 'system', 'Pause Activity', 'Operations', `Activity ${id} paused`)({
          ...d,
          operationsActivities: d.operationsActivities.map((a) =>
            a.id === id && a.status === 'in_progress'
              ? { ...a, status: 'paused', accumulatedSeconds: activityDuration(a), lastResumeTime: null }
              : a,
          ),
        }),
      )
      toast('Activity paused', 'info')
    },
    [update, logEntry, session, toast],
  )

  const resumeActivity = useCallback(
    (id) => {
      update((d) =>
        logEntry(session?.name || 'system', 'Resume Activity', 'Operations', `Activity ${id} resumed`)({
          ...d,
          operationsActivities: d.operationsActivities.map((a) =>
            a.id === id && a.status === 'paused' ? { ...a, status: 'in_progress', lastResumeTime: nowISO() } : a,
          ),
        }),
      )
      toast('Activity resumed')
    },
    [update, logEntry, session, toast],
  )

  const joinActivity = useCallback(
    (id) => {
      if (!currentUser) return
      update((d) =>
        logEntry(currentUser.name, 'Join Activity', 'Operations', `Joined activity ${id} as participant`)({
          ...d,
          operationsActivities: d.operationsActivities.map((a) =>
            a.id === id && a.status !== 'complete' && !(a.participants || []).some((p) => p.userId === currentUser.userId)
              ? { ...a, participants: [...(a.participants || []), { userId: currentUser.userId, name: currentUser.name }] }
              : a,
          ),
        }),
      )
      toast('Joined activity as participant')
    },
    [currentUser, update, logEntry, toast],
  )

  const leaveActivity = useCallback(
    (id) => {
      if (!currentUser) return
      update((d) =>
        logEntry(currentUser.name, 'Leave Activity', 'Operations', `Left activity ${id}`)({
          ...d,
          operationsActivities: d.operationsActivities.map((a) =>
            a.id === id ? { ...a, participants: (a.participants || []).filter((p) => p.userId !== currentUser.userId) } : a,
          ),
        }),
      )
      toast('Left activity', 'info')
    },
    [currentUser, update, logEntry, toast],
  )

  const endActivity = useCallback(
    (id, payload) => {
      const act = dbRef.current.operationsActivities.find((a) => a.id === id)
      if (!act || act.status === 'complete') return
      const durationSeconds = activityDuration(act)
      const end = nowISO()
      const completed = {
        ...act, ...payload, status: 'complete', endTime: end,
        accumulatedSeconds: durationSeconds, lastResumeTime: null, durationSeconds,
        outcome: 'finished',
      }
      delete completed.forward

      update((d) => {
        let next = {
          ...d,
          operationsActivities: d.operationsActivities.map((a) => (a.id === id ? completed : a)),
        }

        if (act.storageType === 'inbound' || act.storageType === 'outbound') {
          const mov = {
            id: uid('mov'), customer: act.customerName, date: completed.date, reference: act.customerRef,
            type: act.storageType === 'inbound' ? 'Inbound' : 'Outbound',
            cbm: num(payload.cbm), storage: payload.storageTypeUsed,
            handlingMode: payload.handlingMode,
            containerSize: payload.handlingMode === 'Loose' ? null : payload.vehicleType,
            truckCount: payload.handlingMode === 'Loose' ? null : num(payload.truckCount),
            packageQty: num(payload.packageQty), packageUom: payload.packageUom,
            packageLines: payload.packageLines || null,
            storageDays: null, sourceActivityId: id, applyHandling: true,
          }
          next = { ...next, storageMovements: [mov, ...next.storageMovements] }
          next = logEntry(
            session?.name || act.ownerName, 'Storage Movement', 'Storage',
            `${mov.type} movement auto-created: ${mov.cbm} CBM for ${mov.customer} (${mov.reference})`,
          )(next)
        }

        return logEntry(
          session?.name || act.ownerName, 'End Activity', 'Operations',
          `${act.type} for ${act.customerName} (${act.customerRef}) — finished`,
        )(next)
      })
      toast('Activity completed')
    },
    [update, logEntry, session, toast],
  )

  // ---- Generic collection CRUD ---------------------------------------------

  const upsert = useCallback(
    (collection, record, { entityType, label } = {}) => {
      const isNew = !record.id
      const rec = isNew ? { ...record, id: uid(collection.slice(0, 3)) } : record
      update((d) => {
        const list = d[collection] || []
        const nextList = isNew ? [rec, ...list] : list.map((x) => (x.id === rec.id ? rec : x))
        return logEntry(
          session?.name || 'system', isNew ? 'Create' : 'Update', entityType || collection,
          `${isNew ? 'Added' : 'Edited'} ${label || collection}: ${rec.name || rec.customer || rec.customerName || rec.userId || rec.id}`,
        )({ ...d, [collection]: nextList })
      })
      return rec
    },
    [update, logEntry, session],
  )

  const remove = useCallback(
    (collection, id, { entityType, label } = {}) => {
      update((d) => {
        const rec = (d[collection] || []).find((x) => x.id === id)
        return logEntry(
          session?.name || 'system', 'Delete', entityType || collection,
          `Deleted ${label || collection}: ${rec?.name || rec?.customer || rec?.customerName || id}`,
        )({ ...d, [collection]: (d[collection] || []).filter((x) => x.id !== id) })
      })
    },
    [update, logEntry, session],
  )

  // ---- Billing ---------------------------------------------------------------

  const recordBilling = useCallback(
    (periodKey, lineIds, billedDate) => {
      if (!lineIds.length) return
      const rec = {
        id: uid('bil'), periodKey, lineIds,
        billedBy: session?.name || 'system', billedDate,
      }
      update((d) =>
        logEntry(session?.name || 'system', 'Record Billing', 'Billing', `Billed ${lineIds.length} line(s) for period ${periodKey} on ${billedDate}`)({
          ...d,
          billedRecords: [rec, ...d.billedRecords],
        }),
      )
      toast(`${lineIds.length} line(s) marked as billed`)
    },
    [update, logEntry, session, toast],
  )

  const unbillRecords = useCallback(
    (lineIds) => {
      if (!lineIds.length) return
      const idsToRemove = new Set(lineIds)
      update((d) =>
        logEntry(session?.name || 'system', 'Unbill', 'Billing', `Reversed billing on ${lineIds.length} line(s)`)({
          ...d,
          billedRecords: d.billedRecords
            .map((r) => {
              const remaining = r.lineIds.filter((lid) => !idsToRemove.has(lid))
              return remaining.length ? { ...r, lineIds: remaining } : null
            })
            .filter(Boolean),
        }),
      )
      toast(`${lineIds.length} line(s) reverted to unbilled`)
    },
    [update, logEntry, session, toast],
  )

  const billedMap = useMemo(() => {
    if (!db) return new Map()
    const m = new Map()
    for (const r of db.billedRecords) for (const lid of r.lineIds) m.set(lid, { billedBy: r.billedBy, billedDate: r.billedDate, periodKey: r.periodKey })
    return m
  }, [db?.billedRecords])

  // ---- Danger zone -----------------------------------------------------------

  const resetDb = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/db/reset`, {
        method: 'POST',
        headers: authHeaders(),
      })
      const result = await res.json()
      if (!res.ok || !result.ok) {
        toast(result.error || 'Failed to reset database', 'error')
        return
      }
      if (result.data) {
        baselineRef.current = result.data
        setDb(result.data)
      }
      toast('Database reset to seed data', 'info')
    } catch {
      toast('Failed to reset database', 'error')
    }
  }, [toast])

  const clearDemoData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/db/clear-demo-data`, {
        method: 'POST',
        headers: authHeaders(),
      })
      const result = await res.json()
      if (!res.ok || !result.ok) {
        toast(result.error || 'Failed to clear demo data', 'error')
        return
      }
      if (result.data) {
        baselineRef.current = result.data
        setDb(result.data)
      }
      toast('Demo transactions and master data cleared', 'info')
    } catch {
      toast('Failed to clear demo data', 'error')
    }
  }, [toast])

  // ---- Loading state ---------------------------------------------------------

  if (dbError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <h2 style={{ color: '#c00' }}>Failed to connect to database</h2>
        <p>{dbError}</p>
        <p style={{ color: '#666' }}>Make sure the API server is running (npm run dev)</p>
        <button onClick={() => window.location.reload()} style={{ padding: '0.5rem 1.5rem', cursor: 'pointer' }}>Retry</button>
      </div>
    )
  }

  if (!dbReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ width: 40, height: 40, border: '4px solid #e0e0e0', borderTopColor: '#f0511c', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#666' }}>Connecting to database...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // Pre-login state: provide minimal context so Login page can render
  if (!db) {
    const loginValue = {
      db: null, update: () => {}, upsert: () => {}, remove: () => {},
      session: null, currentUser: null, login, logout: () => {}, changePassword: async () => ({ ok: false }),
      isCheckedIn: false, needsCheckIn: false, attendanceRequired: false, todayAttendance: null, checkIn: () => {}, checkOut: () => {},
      myActiveActivity: null, addActivities: () => {}, startAssignedActivity: () => {},
      pauseActivity: () => {}, resumeActivity: () => {},
      joinActivity: () => {}, leaveActivity: () => {}, endActivity: () => {},
      recordBilling: () => {}, unbillRecords: () => {}, billedMap: new Map(),
      logAction: () => {}, toast, toasts,
      pagesForUser, resetDb: () => {}, clearDemoData: () => {},
      saveStatus: 'saved',
      setUserPassword: async () => ({ ok: false }),
    }
    return <StoreCtx.Provider value={loginValue}>{children}</StoreCtx.Provider>
  }

  const value = {
    db, update, upsert, remove,
    session, currentUser, login, logout, changePassword,
    isCheckedIn, needsCheckIn, attendanceRequired, todayAttendance, checkIn, checkOut,
    myActiveActivity, addActivities, startAssignedActivity, pauseActivity, resumeActivity, joinActivity, leaveActivity, endActivity,
    recordBilling, unbillRecords, billedMap,
    logAction, toast, toasts,
    pagesForUser, resetDb, clearDemoData,
    saveStatus,
    setUserPassword,
  }

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}
