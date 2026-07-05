import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { uid, sha256, todayISO, nowISO, toISODate, activityDuration, round2, num, daysToMonthEnd } from './utils.js'

const DB_KEY = 'wmstrack_pro_db_v1'
const SESSION_KEY = 'wmstrack_pro_session_v1'
export const REMEMBER_KEY = 'wmstrack_pro_remember_uid'

// ---- Pages & roles -------------------------------------------------------

export const PAGES = [
  { key: 'operations', label: 'Operations Execution', icon: '▶️' },
  { key: 'pending', label: 'Pending Activity', icon: '🕘' },
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
  Supervisor: ['operations', 'pending', 'storage', 'reports'],
  User: ['operations', 'pending'],
}

export function pagesForUser(user) {
  if (!user) return []
  if (user.role === 'Developer') return ROLE_PAGES.Developer
  if (Array.isArray(user.allowedPages) && user.allowedPages.length) {
    return user.allowedPages.filter((k) => k !== 'users' || user.role === 'Developer')
  }
  return ROLE_PAGES[user.role] || []
}

// ---- Seed data -----------------------------------------------------------

const H = {
  developer: '88fa0d759f845b47c044c2cd44e29082cf6fea665c30c146374ec7c8f3d699e3',
  admin: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
  user: '04f8996da763b7a969b1028ee3007569eaf3a635486ddab211d512c85b9df8fb',
}

function seedDb() {
  const customers = [
    { id: uid('cus'), name: 'Acme Trading Co', currency: 'USD', references: ['PO-1001', 'PO-1002', 'PO-1003'] },
    { id: uid('cus'), name: 'Gulf Distribution LLC', currency: 'USD', references: ['GD-2201', 'GD-2202'] },
    { id: uid('cus'), name: 'Nordwind Retail', currency: 'EUR', references: ['NW-88', 'NW-89'] },
  ]
  const activitiesMaster = [
    { id: uid('act'), name: 'Picking', storageType: null },
    { id: uid('act'), name: 'Packing', storageType: null },
    { id: uid('act'), name: 'Labeling', storageType: null },
    { id: uid('act'), name: 'Sorting', storageType: null },
    { id: uid('act'), name: 'Kitting', storageType: null },
    { id: uid('act'), name: 'Cycle Count', storageType: null },
    { id: uid('act'), name: 'Offloading', storageType: 'inbound' },
    { id: uid('act'), name: 'Loading', storageType: 'outbound' },
  ]
  const uoms = ['CTN', 'PLT', 'PCS', 'KG', 'CBM'].map((name) => ({ id: uid('uom'), name }))
  const currencies = ['USD', 'EUR', 'SAR'].map((name) => ({ id: uid('cur'), name }))
  const vehicleTypes = ['20ft', '40ft'].map((name) => ({ id: uid('veh'), name }))

  const unitValues = []
  const uvSeed = [
    ['Acme Trading Co', 'Picking', 'CTN', 0.45, 'USD', 500],
    ['Acme Trading Co', 'Picking', 'PLT', 4.5, 'USD', 0],
    ['Acme Trading Co', 'Picking', 'PCS', 0.05, 'USD', 0],
    ['Acme Trading Co', 'Packing', 'CTN', 0.55, 'USD', 0],
    ['Acme Trading Co', 'Labeling', 'PCS', 0.08, 'USD', 0],
    ['Acme Trading Co', 'Sorting', 'CTN', 0.3, 'USD', 0],
    ['Gulf Distribution LLC', 'Picking', 'CTN', 0.5, 'USD', 0],
    ['Gulf Distribution LLC', 'Packing', 'PLT', 4.5, 'USD', 0],
    ['Gulf Distribution LLC', 'Kitting', 'PCS', 0.12, 'USD', 300],
    ['Nordwind Retail', 'Picking', 'CTN', 0.4, 'EUR', 0],
    ['Nordwind Retail', 'Labeling', 'PCS', 0.07, 'EUR', 0],
    ['Nordwind Retail', 'Cycle Count', 'PLT', 2.0, 'EUR', 0],
  ]
  for (const [customer, activity, uom, unitRate, currency, minimumFixedValue] of uvSeed) {
    unitValues.push({ id: uid('uv'), customer, activity, uom, unitRate, currency, minimumFixedValue })
  }

  const storageRates = []
  for (const c of customers) {
    storageRates.push({ id: uid('sr'), customer: c.name, storageType: 'Normal Storage', unitRate: 0.35, currency: c.currency })
    storageRates.push({ id: uid('sr'), customer: c.name, storageType: 'Cold Storage', unitRate: 0.85, currency: c.currency })
  }

  const handlingRates = customers.map((c) => ({
    id: uid('hr'),
    customer: c.name,
    container20: 90,
    container40: 140,
    trailer20: 80,
    trailer40: 120,
    loosePerCbm: 3.5,
    minimumCharge: 50,
    monthlyMinimum: 0,
    currency: c.currency,
  }))
  handlingRates[0].monthlyMinimum = 800

  const users = [
    { id: uid('usr'), name: 'System Developer', userId: 'developer', passwordHash: H.developer, role: 'Developer', active: true, allowedPages: null },
    { id: uid('usr'), name: 'Warehouse Admin', userId: 'admin', passwordHash: H.admin, role: 'Admin', active: true, allowedPages: null },
    { id: uid('usr'), name: 'Warehouse Operator', userId: 'user', passwordHash: H.user, role: 'User', active: true, allowedPages: null },
  ]

  const db = {
    version: 1,
    createdAt: nowISO(),
    users,
    customers,
    activitiesMaster,
    uoms,
    currencies,
    vehicleTypes,
    unitValues,
    storageRates,
    handlingRates,
    storageMovements: [],
    operationsActivities: [],
    pendingAssignments: [],
    vasCharges: [],
    attendance: [],
    billedRecords: [],
    auditLog: [],
    settings: { billingApiUrl: '' },
  }
  seedDemoTransactions(db)
  db.auditLog.push({ id: uid('log'), dateTime: nowISO(), user: 'system', action: 'Seed', entityType: 'System', details: 'Initial database seeded with demo data' })
  return db
}

/** Seed a few weeks of realistic completed work so dashboards/billing have content on first run. */
function seedDemoTransactions(db) {
  const rng = mulberry32(20260704)
  const users = [
    { userId: 'user', name: 'Warehouse Operator' },
    { userId: 'admin', name: 'Warehouse Admin' },
  ]
  const normals = db.activitiesMaster.filter((a) => !a.storageType)
  const today = new Date()

  for (let back = 21; back >= 1; back--) {
    const d = new Date(today)
    d.setDate(d.getDate() - back)
    if (d.getDay() === 5) continue // weekly day off
    const dateIso = toISODate(d)

    // attendance
    for (const u of users) {
      const inH = 7 + Math.floor(rng() * 2)
      const hours = 8 + rng() * 1.5
      const ci = new Date(d); ci.setHours(inH, Math.floor(rng() * 50), 0, 0)
      const co = new Date(ci.getTime() + hours * 3600 * 1000)
      db.attendance.push({
        id: uid('att'), userId: u.userId, userName: u.name, date: dateIso,
        checkInTime: ci.toISOString(), checkOutTime: co.toISOString(), hoursReported: round2(hours),
      })
    }

    // 2-4 normal activities per day
    const nActs = 2 + Math.floor(rng() * 3)
    for (let i = 0; i < nActs; i++) {
      const cust = db.customers[Math.floor(rng() * db.customers.length)]
      const act = normals[Math.floor(rng() * normals.length)]
      const uv = db.unitValues.find((v) => v.customer === cust.name && v.activity === act.name)
      const u = users[Math.floor(rng() * users.length)]
      const durS = Math.round((0.5 + rng() * 2.5) * 3600)
      const st = new Date(d); st.setHours(8 + i * 2, Math.floor(rng() * 40), 0, 0)
      const en = new Date(st.getTime() + durS * 1000)
      db.operationsActivities.push({
        id: uid('op'), customerName: cust.name,
        customerRef: cust.references[Math.floor(rng() * cust.references.length)],
        date: dateIso, type: act.name, storageType: null, status: 'complete',
        startTime: st.toISOString(), endTime: en.toISOString(),
        accumulatedSeconds: durS, lastResumeTime: null, durationSeconds: durS,
        qty: Math.round(20 + rng() * 300), uom: uv ? uv.uom : 'CTN',
        cbm: null, storageTypeUsed: null, handlingMode: null, vehicleType: null,
        truckCount: null, packageQty: null, packageUom: null,
        owner: u.userId, ownerName: u.name, participants: [], outcome: 'finished',
      })
    }

    // occasional offloading/loading with storage movement
    if (rng() < 0.55) {
      const inbound = rng() < 0.5
      const act = db.activitiesMaster.find((a) => a.storageType === (inbound ? 'inbound' : 'outbound'))
      const cust = db.customers[Math.floor(rng() * db.customers.length)]
      const u = users[Math.floor(rng() * users.length)]
      const cbm = round2(15 + rng() * 60)
      const container = rng() < 0.7
      const vehicleType = rng() < 0.5 ? '20ft' : '40ft'
      const trucks = 1 + Math.floor(rng() * 2)
      const durS = Math.round((0.75 + rng() * 1.5) * 3600)
      const st = new Date(d); st.setHours(13, Math.floor(rng() * 40), 0, 0)
      const en = new Date(st.getTime() + durS * 1000)
      const ref = cust.references[Math.floor(rng() * cust.references.length)]
      const opId = uid('op')
      db.operationsActivities.push({
        id: opId, customerName: cust.name, customerRef: ref, date: dateIso,
        type: act.name, storageType: act.storageType, status: 'complete',
        startTime: st.toISOString(), endTime: en.toISOString(),
        accumulatedSeconds: durS, lastResumeTime: null, durationSeconds: durS,
        qty: null, uom: null, cbm,
        storageTypeUsed: rng() < 0.8 ? 'Normal Storage' : 'Cold Storage',
        handlingMode: container ? 'Container' : 'Loose',
        vehicleType: container ? vehicleType : null, truckCount: container ? trucks : null,
        packageQty: Math.round(50 + rng() * 200), packageUom: 'CTN',
        owner: u.userId, ownerName: u.name, participants: [], outcome: 'finished',
      })
      const op = db.operationsActivities[db.operationsActivities.length - 1]
      db.storageMovements.push({
        id: uid('mov'), customer: cust.name, date: dateIso, reference: ref,
        type: inbound ? 'Inbound' : 'Outbound', cbm, storage: op.storageTypeUsed,
        handlingMode: op.handlingMode, containerSize: op.vehicleType, truckCount: op.truckCount,
        packageQty: op.packageQty, packageUom: op.packageUom,
        storageDays: null, sourceActivityId: opId,
      })
    }

    // occasional VAS
    if (rng() < 0.3) {
      const cust = db.customers[Math.floor(rng() * db.customers.length)]
      db.vasCharges.push({
        id: uid('vas'), customerName: cust.name, date: dateIso,
        vasReference: `VAS-${dateIso.replaceAll('-', '')}`,
        quantity: Math.round(5 + rng() * 40), charges: round2(1 + rng() * 4), currency: cust.currency,
      })
    }
  }

  // one forwarded pending job
  const c0 = db.customers[0]
  db.pendingAssignments.push({
    id: uid('pnd'), customerName: c0.name, customerRef: c0.references[0], date: todayISO(),
    status: 'Pending', lastActivityName: 'Picking', forwardedFromUser: 'Warehouse Admin', createdAt: nowISO(),
  })
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- Persistence ---------------------------------------------------------

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      const db = JSON.parse(raw)
      if (db && db.version === 1) return db
    }
  } catch (e) {
    console.error('Failed to load DB, reseeding', e)
  }
  const db = seedDb()
  localStorage.setItem(DB_KEY, JSON.stringify(db))
  return db
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
  const [db, setDb] = useState(loadDb)
  const [session, setSession] = useState(loadSession)
  const [toasts, setToasts] = useState([])
  const [prefill, setPrefill] = useState(null) // pending -> operations handoff
  const dbRef = useRef(db)
  dbRef.current = db

  useEffect(() => {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
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

  /** Append an audit log entry (capped at 5000). Usable inside update() chains via returned patch. */
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
    if (!session) return null
    return db.users.find((u) => u.id === session.userRecordId) || null
  }, [db.users, session])

  const login = useCallback(
    async (userIdInput, password) => {
      const hash = await sha256(password)
      const u = dbRef.current.users.find((x) => x.userId.toLowerCase() === String(userIdInput || '').trim().toLowerCase())
      if (!u || u.passwordHash !== hash || !u.active) {
        return { ok: false, error: 'Invalid credentials. Please check your User ID and password.' }
      }
      setSession({ userRecordId: u.id, userId: u.userId, name: u.name, role: u.role, loginAt: nowISO() })
      update((d) => logEntry(u.name, 'Login', 'Auth', `User ${u.userId} logged in`)(d))
      return { ok: true }
    },
    [update, logEntry],
  )

  const logout = useCallback(
    (silent = false) => {
      if (session && !silent) update((d) => logEntry(session.name, 'Logout', 'Auth', `User ${session.userId} logged out`)(d))
      setSession(null)
      setPrefill(null)
    },
    [session, update, logEntry],
  )

  const changePassword = useCallback(
    async (oldPassword, newPassword) => {
      if (!currentUser) return { ok: false, error: 'Not logged in' }
      const oldHash = await sha256(oldPassword)
      if (currentUser.passwordHash !== oldHash) return { ok: false, error: 'Current password is incorrect' }
      const newHash = await sha256(newPassword)
      update((d) =>
        logEntry(currentUser.name, 'Change Password', 'Auth', `User ${currentUser.userId} changed password`)({
          ...d,
          users: d.users.map((u) => (u.id === currentUser.id ? { ...u, passwordHash: newHash } : u)),
        }),
      )
      return { ok: true }
    },
    [currentUser, update, logEntry],
  )

  // ---- Attendance / daily gate --------------------------------------------

  const todayAttendance = useMemo(() => {
    if (!currentUser) return null
    return (
      db.attendance.find((a) => a.userId === currentUser.userId && a.date === todayISO() && !a.checkOutTime) || null
    )
  }, [db.attendance, currentUser])

  const isCheckedIn = !!todayAttendance
  const needsCheckIn = currentUser ? currentUser.role !== 'Developer' && !isCheckedIn : false

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

  /** Activity the current user is engaged in (owner or participant), if any. */
  const myActiveActivity = useMemo(() => {
    if (!currentUser) return null
    return (
      db.operationsActivities.find(
        (a) =>
          a.status !== 'complete' &&
          (a.owner === currentUser.userId || (a.participants || []).some((p) => p.userId === currentUser.userId)),
      ) || null
    )
  }, [db.operationsActivities, currentUser])

  const startActivity = useCallback(
    ({ customerName, customerRef, type }) => {
      if (!currentUser) return
      const master = dbRef.current.activitiesMaster.find((a) => a.name === type)
      const act = {
        id: uid('op'), customerName, customerRef, date: todayISO(),
        type, storageType: master?.storageType || null, status: 'in_progress',
        startTime: nowISO(), endTime: null,
        accumulatedSeconds: 0, lastResumeTime: nowISO(), durationSeconds: null,
        qty: null, uom: null, cbm: null, storageTypeUsed: null,
        handlingMode: null, vehicleType: null, truckCount: null, packageQty: null, packageUom: null,
        owner: currentUser.userId, ownerName: currentUser.name, participants: [], outcome: null,
      }
      update((d) =>
        logEntry(currentUser.name, 'Start Activity', 'Operations', `${type} for ${customerName} (${customerRef})`)({
          ...d,
          operationsActivities: [act, ...d.operationsActivities],
        }),
      )
      toast(`Activity "${type}" started`)
      return act
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

  /**
   * End an activity. payload:
   *  { qty, uom }  for normal activities
   *  { cbm, storageTypeUsed, handlingMode, vehicleType, truckCount, packageQty, packageUom } for inbound/outbound
   *  { forward: bool } — Forward creates a pending assignment; Finish closes matching pending rows.
   */
  const endActivity = useCallback(
    (id, payload) => {
      const act = dbRef.current.operationsActivities.find((a) => a.id === id)
      if (!act || act.status === 'complete') return
      const durationSeconds = activityDuration(act)
      const end = nowISO()
      const completed = {
        ...act, ...payload, status: 'complete', endTime: end,
        accumulatedSeconds: durationSeconds, lastResumeTime: null, durationSeconds,
        outcome: payload.forward ? 'forwarded' : 'finished',
      }
      delete completed.forward

      update((d) => {
        let next = {
          ...d,
          operationsActivities: d.operationsActivities.map((a) => (a.id === id ? completed : a)),
        }

        // Storage & handling movement for inbound/outbound activity types
        if (act.storageType === 'inbound' || act.storageType === 'outbound') {
          const mov = {
            id: uid('mov'), customer: act.customerName, date: completed.date, reference: act.customerRef,
            type: act.storageType === 'inbound' ? 'Inbound' : 'Outbound',
            cbm: num(payload.cbm), storage: payload.storageTypeUsed,
            handlingMode: payload.handlingMode,
            containerSize: payload.handlingMode === 'Loose' ? null : payload.vehicleType,
            truckCount: payload.handlingMode === 'Loose' ? null : num(payload.truckCount),
            packageQty: num(payload.packageQty), packageUom: payload.packageUom,
            storageDays: null, sourceActivityId: id,
          }
          next = { ...next, storageMovements: [mov, ...next.storageMovements] }
          next = logEntry(
            session?.name || act.ownerName, 'Storage Movement', 'Storage',
            `${mov.type} movement auto-created: ${mov.cbm} CBM for ${mov.customer} (${mov.reference})`,
          )(next)
        }

        if (payload.forward) {
          const pend = {
            id: uid('pnd'), customerName: act.customerName, customerRef: act.customerRef, date: completed.date,
            status: 'Pending', lastActivityName: act.type,
            forwardedFromUser: session?.name || act.ownerName, createdAt: nowISO(),
          }
          next = { ...next, pendingAssignments: [pend, ...next.pendingAssignments] }
        } else {
          // Finish closes matching open pending assignments
          next = {
            ...next,
            pendingAssignments: next.pendingAssignments.map((p) =>
              p.status === 'Pending' && p.customerName === act.customerName && p.customerRef === act.customerRef
                ? { ...p, status: 'Done' }
                : p,
            ),
          }
        }

        return logEntry(
          session?.name || act.ownerName, 'End Activity', 'Operations',
          `${act.type} for ${act.customerName} (${act.customerRef}) — ${payload.forward ? 'forwarded' : 'finished'}`,
        )(next)
      })
      toast(payload.forward ? 'Activity completed and forwarded to Pending Activity' : 'Activity completed')
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

  /** Map of billed line id -> {billedBy, billedDate} */
  const billedMap = useMemo(() => {
    const m = new Map()
    for (const r of db.billedRecords) for (const lid of r.lineIds) m.set(lid, { billedBy: r.billedBy, billedDate: r.billedDate, periodKey: r.periodKey })
    return m
  }, [db.billedRecords])

  // ---- Danger zone -----------------------------------------------------------

  const resetDb = useCallback(() => {
    const fresh = seedDb()
    setDb(fresh)
    toast('Database reset to seed data', 'info')
  }, [toast])

  const value = {
    db, update, upsert, remove,
    session, currentUser, login, logout, changePassword,
    isCheckedIn, needsCheckIn, todayAttendance, checkIn, checkOut,
    myActiveActivity, startActivity, pauseActivity, resumeActivity, joinActivity, leaveActivity, endActivity,
    recordBilling, billedMap,
    logAction, toast, toasts,
    prefill, setPrefill,
    pagesForUser, resetDb,
    storageDaysDefault: daysToMonthEnd,
  }

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}
