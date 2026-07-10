// ---- Generic helpers ----------------------------------------------------

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export async function sha256(text) {
  const data = new TextEncoder().encode(text)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---- Dates (all stored as ISO strings internally) -----------------------

export function todayISO() {
  return toISODate(new Date())
}

export function firstOfMonthISO() {
  const d = new Date()
  d.setDate(1)
  return toISODate(d)
}

export function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function nowISO() {
  return new Date().toISOString()
}

export function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  if (isNaN(d)) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
}

export function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function monthKey(isoDate) {
  return (isoDate || '').slice(0, 7) // YYYY-MM
}

export function daysInMonth(year, month1based) {
  return new Date(year, month1based, 0).getDate()
}

export function monthName(month1based) {
  return new Date(2000, month1based - 1, 1).toLocaleString(undefined, { month: 'long' })
}

/** Days from a movement date to the end of its month, inclusive (default storage-day count). */
export function daysToMonthEnd(isoDate) {
  const d = new Date(isoDate + 'T00:00:00')
  if (isNaN(d)) return 1
  const total = daysInMonth(d.getFullYear(), d.getMonth() + 1)
  return Math.max(1, total - d.getDate() + 1)
}

// ---- Numbers -------------------------------------------------------------

export function num(v, fallback = 0) {
  const n = parseFloat(v)
  return isNaN(n) ? fallback : n
}

export function fmtNum(v, decimals = 2) {
  const n = num(v)
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function fmtMoney(v, currency = '') {
  return `${fmtNum(v)}${currency ? ' ' + currency : ''}`
}

export function round2(v) {
  return Math.round(num(v) * 100) / 100
}

// ---- Activity duration ---------------------------------------------------

/** Live duration (seconds) of an operations activity, given current time. */
export function activityDuration(act, nowMs = Date.now()) {
  let secs = act.accumulatedSeconds || 0
  if (act.status === 'in_progress' && act.lastResumeTime) {
    secs += Math.max(0, (nowMs - new Date(act.lastResumeTime).getTime()) / 1000)
  }
  return Math.round(secs)
}

/** Human-readable quantity for an activity: "600 PCS" or "1 PLT + 10 CTN + 600 PCS". */
export function qtyDisplay(a) {
  if (Array.isArray(a.qtyLines) && a.qtyLines.length > 1) {
    return a.qtyLines.map((l) => `${l.qty} ${l.uom}`).join(' + ')
  }
  if (a.qty == null || a.qty === '') return '—'
  return `${a.qty}${a.uom ? ' ' + a.uom : ''}`
}

/** Same for movement/activity package details: packageLines[] or flat packageQty/packageUom. */
export function pkgDisplay(x) {
  if (Array.isArray(x.packageLines) && x.packageLines.length > 1) {
    return x.packageLines.map((l) => `${l.qty} ${l.uom}`).join(' + ')
  }
  if (x.packageQty == null || x.packageQty === '') return '—'
  return `${x.packageQty}${x.packageUom ? ' ' + x.packageUom : ''}`
}

// ---- Misc ---------------------------------------------------------------

export function classNames(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function download(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
