import { monthKey, daysToMonthEnd, round2, num } from './utils.js'

/** Add n whole days to a YYYY-MM-DD date, returning YYYY-MM-DD (local time). */
function addDaysIso(iso, n) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Compute all billable lines for a given period (YYYY-MM).
 *
 * Sources:
 *  - Completed normal activities  -> qty x unit value (+ monthly minimum top-ups per customer/activity/UOM)
 *  - Storage movements            -> one Storage line per day: rate/CBM/day x CBM (+ monthly minimum top-ups per customer/storage type)
 *  - Storage movements (handling) -> Handling In/Out: trucks x rate (Container/Trailer) or CBM x rate (Loose)
 *  - Manual handling charges      -> Handling: qty x charge per unit (ad-hoc)
 *  - VAS charges                  -> qty x charge per unit
 *
 * Line ids are stable so billed status survives recomputation.
 */
const hNorm = (s) => String(s || '').trim().toLowerCase()

/**
 * A customer's handling rate is a matrix of rate lines, each keyed by direction
 * (IN/OUT/Both), vehicle (Container/Trailer/Loose), size (20ft/40ft/3-ton…) and
 * handling UOM (Palletized/Loose). Older rate cards stored fixed fields instead;
 * they are synthesised into equivalent lines so existing configs keep working.
 */
export function handlingRateLines(hr) {
  if (Array.isArray(hr?.rateLines)) return hr.rateLines
  const L = []
  if (num(hr?.container20)) L.push({ vehicle: 'Container', size: '20ft', rate: num(hr.container20) })
  if (num(hr?.container40)) L.push({ vehicle: 'Container', size: '40ft', rate: num(hr.container40) })
  if (num(hr?.trailer20)) L.push({ vehicle: 'Trailer', size: '20ft', rate: num(hr.trailer20) })
  if (num(hr?.trailer40)) L.push({ vehicle: 'Trailer', size: '40ft', rate: num(hr.trailer40) })
  if (num(hr?.loosePerCbm)) L.push({ vehicle: 'Loose', rate: num(hr.loosePerCbm) })
  return L
}

/**
 * Best-matching rate line for a handling event. A blank field on a line is a
 * wildcard; a set field must match. More-specific matches (direction > size >
 * handling UOM) win, so a general fallback line can coexist with exact rows.
 */
function bestHandlingLine(lines, ev) {
  let best = null, bestScore = -1
  for (const l of lines) {
    let score = 0
    if (l.direction && hNorm(l.direction) !== 'both') {
      if (hNorm(l.direction) !== hNorm(ev.direction)) continue
      score += 4
    }
    if (l.size) {
      if (hNorm(l.size) !== hNorm(ev.size)) continue
      score += 2
    }
    if (l.handlingUom) {
      if (hNorm(l.handlingUom) !== hNorm(ev.handlingUom)) continue
      score += 1
    }
    if (score > bestScore) { best = l; bestScore = score }
  }
  return best
}

/**
 * Resolve and compute a handling charge for a single event, from Master Data.
 * Container/Trailer bill per truck at the matched rate; Loose (and billByCbm
 * customers) bill CBM × the loose rate. The customer's minimum charge applies.
 * `ev`: { customer, direction, vehicle, size, handlingUom, trucks, cbm }.
 */
export function handlingChargeFor(db, ev) {
  const hr = (db.handlingRates || []).find((r) => r.customer === ev.customer)
  const vehicle = hNorm(ev.vehicle) || 'loose'
  const perCbm = !!hr?.billByCbm || vehicle === 'loose'
  const lines = handlingRateLines(hr).filter((l) => hNorm(l.vehicle) === (perCbm ? 'loose' : vehicle))
  const line = bestHandlingLine(lines, ev)
  const rate = line ? num(line.rate) : 0
  const raw = perCbm ? round2(num(ev.cbm) * rate) : round2(num(ev.trucks) * rate)
  const minCharge = hr ? num(hr.minimumCharge) : 0
  const amount = Math.max(raw, minCharge)
  const currency = hr?.currency || (db.customers || []).find((c) => c.name === ev.customer)?.currency || ''
  return { rate, amount, minimumApplied: amount > raw, currency, rateMissing: !hr, perCbm, cbmBasis: perCbm && vehicle !== 'loose' }
}

/**
 * Price a manual handling charge from Master Data, mirroring operations-execution
 * handling. The user picks direction, vehicle, size, handling UOM and trucks/CBM;
 * rate, minimum and currency come from the customer's handling configuration.
 * Legacy manual charges have no handlingMode -> treated as Loose.
 */
export function manualHandlingAmount(db, h) {
  const mode = h.handlingMode || 'Loose'
  const r = handlingChargeFor(db, {
    customer: h.customerName, direction: h.direction, vehicle: mode,
    size: h.vehicleType, handlingUom: h.handlingUom, trucks: h.truckCount, cbm: h.cbm,
  })
  return { ...r, mode }
}

export function computeBillingLines(db, period) {
  const lines = []
  const inPeriod = (dateIso) => monthKey(dateIso) === period

  const customerCurrency = (name) => db.customers.find((c) => c.name === name)?.currency || ''

  // ---- 1. Normal activities ----------------------------------------------
  const acts = db.operationsActivities.filter(
    (a) => a.status === 'complete' && !a.storageType && inPeriod(a.date),
  )
  const groupTotals = new Map() // `${customer}|${activity}|${uom}` -> total
  for (const a of acts) {
    // A job may be chargeable in several UOMs at once (qtyLines); older records
    // carry a single qty/uom pair. Each line bills against its own unit value.
    const qLines =
      Array.isArray(a.qtyLines) && a.qtyLines.length ? a.qtyLines : [{ qty: a.qty, uom: a.uom }]
    qLines.forEach((ql, idx) => {
      const uv = db.unitValues.find(
        (v) => v.customer === a.customerName && v.activity === a.type && (!ql.uom || v.uom === ql.uom),
      )
      const rate = uv ? num(uv.unitRate) : 0
      const calculated = round2(num(ql.qty) * rate)
      const minCharge = uv ? num(uv.minimumCharge) : 0
      const total = minCharge > 0 ? Math.max(calculated, minCharge) : calculated
      const gkey = `${a.customerName}|${a.type}|${ql.uom || uv?.uom || ''}`
      groupTotals.set(gkey, round2((groupTotals.get(gkey) || 0) + total))
      lines.push({
        // first line keeps the legacy id so existing billed records stay billed
        id: idx === 0 ? `act:${a.id}` : `act:${a.id}:${idx}`,
        source: 'activity', reportType: 'Activities',
        customerName: a.customerName, date: a.date, customerRef: a.customerRef,
        activity: a.type, handlingType: '', vehicleType: '', truckCount: '',
        cbmQty: '', packageQty: ql.qty, packageUom: ql.uom || '',
        currency: uv?.currency || customerCurrency(a.customerName),
        combinedRate: rate, totalValue: total,
        rateMissing: !uv,
        minimumApplied: minCharge > 0 && calculated < minCharge,
      })
    })
  }

  // Monthly minimum top-ups per configured customer/activity/UOM group
  for (const uv of db.unitValues) {
    const min = num(uv.minimumFixedValue)
    if (min <= 0) continue
    const gkey = `${uv.customer}|${uv.activity}|${uv.uom}`
    if (!groupTotals.has(gkey)) continue // no activity of this group this month
    const total = groupTotals.get(gkey)
    if (total >= min) continue
    const diff = round2(min - total)
    lines.push({
      id: `minuv:${uv.id}:${period}`,
      source: 'minimum', reportType: 'Activities',
      customerName: uv.customer, date: `${period}-01`, customerRef: '—',
      activity: `${uv.activity} — Monthly Minimum Adjustment`,
      handlingType: '', vehicleType: '', truckCount: '',
      cbmQty: '', packageQty: '', packageUom: uv.uom,
      currency: uv.currency || customerCurrency(uv.customer),
      combinedRate: min, totalValue: diff,
    })
  }

  // ---- 2. Storage movements -> one Storage line per day --------------------
  // Storage is billed line-by-line for each day the cargo is in storage:
  // rate per CBM per day × CBM, one line per calendar day within this period.
  const storageTotals = new Map() // `${customer}|${storageType}` -> total storage this month
  for (const m of db.storageMovements) {
    const days = m.storageDays != null && m.storageDays !== '' ? num(m.storageDays) : daysToMonthEnd(m.date)
    if (days <= 0) continue
    const sr = db.storageRates.find((r) => r.customer === m.customer && r.storageType === m.storage)
    const sRate = sr ? num(sr.unitRate) : 0
    const inbound = m.type === 'Inbound'
    const cur = customerCurrency(m.customer)
    const multiPkg = Array.isArray(m.packageLines) && m.packageLines.length > 1
    const pkgUom = multiPkg ? 'Multi' : m.packageUom || ''
    const pkgDetail = multiPkg ? m.packageLines.map((l) => `${l.qty} ${l.uom}`).join(' + ') : null
    const dayAmount = round2(num(m.cbm) * sRate) // one day's storage
    const stoKey = `${m.customer}|${m.storage}`
    for (let i = 0; i < days; i++) {
      const dayIso = addDaysIso(m.date, i)
      const mk = monthKey(dayIso)
      if (mk < period) continue
      if (mk > period) break // days run forward, nothing left in this period
      storageTotals.set(stoKey, round2((storageTotals.get(stoKey) || 0) + dayAmount))
      lines.push({
        id: `sto:${m.id}:${dayIso}`,
        source: 'storage', reportType: 'Storage',
        // Show the customer reference only on the movement's own date; leave the
        // following storage days blank so it isn't repeated on every row.
        customerName: m.customer, date: dayIso, customerRef: dayIso === m.date ? m.reference : '',
        activity: inbound ? 'Storage In' : 'Storage Out',
        handlingType: m.storage || '', vehicleType: '', truckCount: '',
        cbmQty: num(m.cbm), packageQty: m.packageQty || '', packageUom: pkgUom, packageDetail: pkgDetail,
        currency: sr?.currency || cur,
        combinedRate: sRate,     // rate per CBM per day
        totalValue: dayAmount,   // CBM × rate for this single day
        storageDays: 1, rateMissing: !sr,
      })
    }
  }

  // ---- 3. Storage movements -> handling lines (one-time per movement) ------
  const movements = db.storageMovements.filter((m) => inPeriod(m.date))
  const handlingTotals = new Map() // customer -> total handling this month
  for (const m of movements) {
    const inbound = m.type === 'Inbound'
    const cur = customerCurrency(m.customer)
    const multiPkg = Array.isArray(m.packageLines) && m.packageLines.length > 1
    const pkgUom = multiPkg ? 'Multi' : m.packageUom || ''
    const pkgDetail = multiPkg ? m.packageLines.map((l) => `${l.qty} ${l.uom}`).join(' + ') : null

    // Handling line — auto movements (from operations) always bill; manual
    // movements only when "Add Handling Charges" was ticked (applyHandling).
    // Legacy movements have no flag, so undefined is treated as apply.
    if (m.handlingMode && m.applyHandling !== false) {
      const { rate, amount: finalAmount, minimumApplied, currency, rateMissing, cbmBasis } = handlingChargeFor(db, {
        customer: m.customer, direction: inbound ? 'IN' : 'OUT', vehicle: m.handlingMode,
        size: m.containerSize, handlingUom: m.handlingUom, trucks: m.truckCount, cbm: m.cbm,
      })
      handlingTotals.set(m.customer, round2((handlingTotals.get(m.customer) || 0) + finalAmount))
      lines.push({
        id: `han:${m.id}`,
        source: 'handling', reportType: 'Handling',
        customerName: m.customer, date: m.date, customerRef: m.reference,
        activity: `Handling ${inbound ? 'In' : 'Out'} ${m.handlingMode}`,
        handlingType: m.handlingMode, vehicleType: m.containerSize || '', handlingUom: m.handlingUom || '',
        truckCount: m.truckCount || '',
        cbmQty: num(m.cbm), packageQty: m.packageQty || '', packageUom: pkgUom, packageDetail: pkgDetail,
        currency: currency || cur,
        combinedRate: rate, totalValue: finalAmount,
        minimumApplied, rateMissing,
        cbmBasis,
      })
    }
  }

  // Storage monthly minimum top-ups (per customer + storage type)
  for (const sr of db.storageRates) {
    const min = num(sr.monthlyMinimum)
    if (min <= 0) continue
    const key = `${sr.customer}|${sr.storageType}`
    if (!storageTotals.has(key)) continue // no storage of this type this month
    const total = storageTotals.get(key)
    if (total >= min) continue
    lines.push({
      id: `minsto:${sr.id}:${period}`,
      source: 'minimum', reportType: 'Storage',
      customerName: sr.customer, date: `${period}-01`, customerRef: '—',
      activity: `${sr.storageType} — Monthly Minimum Adjustment`,
      handlingType: '', vehicleType: '', truckCount: '',
      cbmQty: '', packageQty: '', packageUom: '',
      currency: sr.currency || customerCurrency(sr.customer),
      combinedRate: min, totalValue: round2(min - total),
    })
  }

  // Manual handling charges (ad-hoc, entered on the Storage & Handling page).
  // Priced from Master Data (CBM x loose per-CBM rate, minimum applied) and
  // counted toward the customer's handling total so monthly-minimum top-ups
  // account for them.
  for (const h of (db.handlingCharges || []).filter((h) => inPeriod(h.date))) {
    const { rate, amount, minimumApplied, currency, rateMissing, mode, cbmBasis } = manualHandlingAmount(db, h)
    handlingTotals.set(h.customerName, round2((handlingTotals.get(h.customerName) || 0) + amount))
    const multiPkg = Array.isArray(h.packageLines) && h.packageLines.length > 1
    lines.push({
      id: `manhan:${h.id}`,
      source: 'handling', reportType: 'Handling',
      customerName: h.customerName, date: h.date, customerRef: h.reference || '—',
      activity: `Manual Handling ${mode}`,
      handlingType: mode, vehicleType: h.vehicleType || '', handlingUom: h.handlingUom || '', truckCount: h.truckCount || '',
      cbmQty: num(h.cbm), packageQty: h.packageQty || '',
      packageUom: multiPkg ? 'Multi' : h.packageUom || '',
      packageDetail: multiPkg ? h.packageLines.map((l) => `${l.qty} ${l.uom}`).join(' + ') : null,
      currency,
      combinedRate: rate, totalValue: amount,
      minimumApplied, rateMissing, cbmBasis,
    })
  }

  // Handling monthly minimum top-ups
  for (const hr of db.handlingRates) {
    const min = num(hr.monthlyMinimum)
    if (min <= 0) continue
    if (!handlingTotals.has(hr.customer)) continue
    const total = handlingTotals.get(hr.customer)
    if (total >= min) continue
    lines.push({
      id: `minhan:${hr.id}:${period}`,
      source: 'minimum', reportType: 'Handling',
      customerName: hr.customer, date: `${period}-01`, customerRef: '—',
      activity: 'Handling — Monthly Minimum Adjustment',
      handlingType: '', vehicleType: '', truckCount: '',
      cbmQty: '', packageQty: '', packageUom: '',
      currency: hr.currency || customerCurrency(hr.customer),
      combinedRate: min, totalValue: round2(min - total),
    })
  }

  // ---- 4. VAS charges -------------------------------------------------------
  for (const v of db.vasCharges.filter((v) => inPeriod(v.date))) {
    lines.push({
      id: `vas:${v.id}`,
      source: 'vas', reportType: 'VAS',
      customerName: v.customerName, date: v.date, customerRef: v.vasReference,
      activity: 'Value Added Service', handlingType: '', vehicleType: '', truckCount: '',
      cbmQty: '', packageQty: v.quantity, packageUom: '',
      currency: v.currency || customerCurrency(v.customerName),
      combinedRate: num(v.charges), totalValue: round2(num(v.quantity) * num(v.charges)),
    })
  }

  lines.sort((a, b) => (a.customerName + a.date).localeCompare(b.customerName + b.date))
  return lines
}

/** List of 'YYYY-MM' months touched by an inclusive from..to date range. */
export function monthsInRange(from, to) {
  const months = []
  let y = Number(from.slice(0, 4))
  let m = Number(from.slice(5, 7))
  const endY = Number(to.slice(0, 4))
  const endM = Number(to.slice(5, 7))
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

/**
 * Billable lines across an arbitrary from..to date range (inclusive).
 * Transactional lines are filtered to their exact date; monthly-minimum
 * top-ups (which are a whole-month concept) are only included for months the
 * range fully covers, so a partial-month selection never bills a full minimum.
 */
export function computeBillingLinesRange(db, from, to) {
  if (!from || !to || from > to) return []
  const monthFullyCovered = (period) => {
    const [y, m] = period.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    return from <= `${period}-01` && to >= `${period}-${String(lastDay).padStart(2, '0')}`
  }
  const out = []
  for (const period of monthsInRange(from, to)) {
    for (const l of computeBillingLines(db, period)) {
      if (l.source === 'minimum') {
        if (monthFullyCovered(period)) out.push(l)
      } else if (l.date >= from && l.date <= to) {
        out.push(l)
      }
    }
  }
  out.sort((a, b) => (a.customerName + a.date).localeCompare(b.customerName + b.date))
  return out
}
