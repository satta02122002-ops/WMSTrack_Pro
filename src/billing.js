import { monthKey, daysToMonthEnd, round2, num } from './utils.js'

/**
 * Compute all billable lines for a given period (YYYY-MM).
 *
 * Sources:
 *  - Completed normal activities  -> qty x unit value (+ monthly minimum top-ups per customer/activity/UOM)
 *  - Storage movements            -> Storage In/Out: days x CBM x storage rate
 *  - Storage movements (handling) -> Handling In/Out: trucks x rate (Container/Trailer) or CBM x rate (Loose)
 *  - VAS charges                  -> qty x charge per unit
 *
 * Line ids are stable so billed status survives recomputation.
 */
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
    const uv = db.unitValues.find(
      (v) => v.customer === a.customerName && v.activity === a.type && (!a.uom || v.uom === a.uom),
    )
    const rate = uv ? num(uv.unitRate) : 0
    const total = round2(num(a.qty) * rate)
    const gkey = `${a.customerName}|${a.type}|${a.uom || uv?.uom || ''}`
    groupTotals.set(gkey, round2((groupTotals.get(gkey) || 0) + total))
    lines.push({
      id: `act:${a.id}`,
      source: 'activity', reportType: 'Activities',
      customerName: a.customerName, date: a.date, customerRef: a.customerRef,
      activity: a.type, handlingType: '', vehicleType: '', truckCount: '',
      cbmQty: '', packageQty: a.qty, packageUom: a.uom || '',
      currency: uv?.currency || customerCurrency(a.customerName),
      combinedRate: rate, totalValue: total,
      rateMissing: !uv,
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

  // ---- 2 & 3. Storage movements -> storage + handling lines ----------------
  const movements = db.storageMovements.filter((m) => inPeriod(m.date))
  const handlingTotals = new Map() // customer -> total handling this month
  for (const m of movements) {
    const inbound = m.type === 'Inbound'
    const cur = customerCurrency(m.customer)

    // Storage line
    const sr = db.storageRates.find((r) => r.customer === m.customer && r.storageType === m.storage)
    const days = m.storageDays != null && m.storageDays !== '' ? num(m.storageDays) : daysToMonthEnd(m.date)
    const sRate = sr ? num(sr.unitRate) : 0
    lines.push({
      id: `sto:${m.id}`,
      source: 'storage', reportType: 'Storage',
      customerName: m.customer, date: m.date, customerRef: m.reference,
      activity: inbound ? 'Storage In' : 'Storage Out',
      handlingType: m.storage || '', vehicleType: '', truckCount: '',
      cbmQty: num(m.cbm), packageQty: m.packageQty || '', packageUom: m.packageUom || '',
      currency: sr?.currency || cur,
      combinedRate: round2(days * sRate), // rate per CBM for the period
      totalValue: round2(days * num(m.cbm) * sRate),
      storageDays: days, rateMissing: !sr,
    })

    // Handling line
    if (m.handlingMode) {
      const hr = db.handlingRates.find((r) => r.customer === m.customer)
      let rate = 0
      let amount = 0
      if (m.handlingMode === 'Loose') {
        rate = hr ? num(hr.loosePerCbm) : 0
        amount = round2(num(m.cbm) * rate)
      } else {
        const is40 = String(m.containerSize || '').includes('40')
        if (m.handlingMode === 'Container') rate = hr ? num(is40 ? hr.container40 : hr.container20) : 0
        else rate = hr ? num(is40 ? hr.trailer40 : hr.trailer20) : 0
        amount = round2(num(m.truckCount) * rate)
      }
      const minCharge = hr ? num(hr.minimumCharge) : 0
      const finalAmount = Math.max(amount, minCharge)
      handlingTotals.set(m.customer, round2((handlingTotals.get(m.customer) || 0) + finalAmount))
      lines.push({
        id: `han:${m.id}`,
        source: 'handling', reportType: 'Handling',
        customerName: m.customer, date: m.date, customerRef: m.reference,
        activity: `Handling ${inbound ? 'In' : 'Out'} ${m.handlingMode}`,
        handlingType: m.handlingMode, vehicleType: m.containerSize || '',
        truckCount: m.truckCount || '',
        cbmQty: num(m.cbm), packageQty: m.packageQty || '', packageUom: m.packageUom || '',
        currency: hr?.currency || cur,
        combinedRate: rate, totalValue: finalAmount,
        minimumApplied: finalAmount > amount, rateMissing: !hr,
      })
    }
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
