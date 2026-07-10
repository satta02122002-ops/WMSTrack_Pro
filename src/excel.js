import * as XLSX from 'xlsx'

/** Export an array of plain objects to an .xlsx download. */
export function exportXlsx(filename, rows, sheetName = 'Sheet1') {
  const ws = XLSX.utils.json_to_sheet(rows)
  // Reasonable column widths from header lengths
  const headers = rows.length ? Object.keys(rows[0]) : []
  ws['!cols'] = headers.map((h) => ({
    wch: Math.min(40, Math.max(h.length + 2, ...rows.slice(0, 50).map((r) => String(r[h] ?? '').length + 2))),
  }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename)
}

/** Export rows to CSV download. */
export function exportCsv(filename, rows) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const csv = XLSX.utils.sheet_to_csv(ws)
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Parse the first sheet of an uploaded Excel/CSV file into an array of objects. */
export function readSpreadsheetFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        resolve(XLSX.utils.sheet_to_json(ws, { defval: '' }))
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

// ---- Bulk import templates -------------------------------------------------

export const IMPORT_TEMPLATES = {
  customers: {
    label: 'Customers',
    headers: ['name', 'currency', 'references'],
    sample: [{ name: 'Example Customer Ltd', currency: 'USD', references: 'REF-001;REF-002' }],
    note: 'references: separate multiple references with ;',
  },
  activities: {
    label: 'Activities',
    headers: ['name', 'storageType'],
    sample: [
      { name: 'Picking', storageType: '' },
      { name: 'Offloading', storageType: 'inbound' },
      { name: 'Loading', storageType: 'outbound' },
    ],
    note: 'storageType: inbound, outbound or leave empty for normal activities',
  },
  uoms: {
    label: 'UOM',
    headers: ['name'],
    sample: [{ name: 'CTN' }, { name: 'PLT' }],
    note: '',
  },
  unitValues: {
    label: 'Unit Values',
    headers: ['customer', 'activity', 'uom', 'unitRate', 'currency', 'minimumCharge', 'minimumFixedValue'],
    sample: [{ customer: 'Example Customer Ltd', activity: 'Picking', uom: 'CTN', unitRate: 0.5, currency: 'USD', minimumCharge: 0, minimumFixedValue: 0 }],
    note: 'customer/activity/uom must match existing master data names',
  },
  storageRates: {
    label: 'Storage Rates',
    headers: ['customer', 'storageType', 'unitRate', 'monthlyMinimum', 'currency'],
    sample: [{ customer: 'Example Customer Ltd', storageType: 'Normal Storage', unitRate: 0.35, monthlyMinimum: 0, currency: 'USD' }],
    note: 'unitRate is per CBM per day; monthlyMinimum tops up the month if storage total is below it (0 = none)',
  },
  handlingRates: {
    label: 'Handling Rates',
    headers: ['customer', 'container20', 'container40', 'trailer20', 'trailer40', 'loosePerCbm', 'minimumCharge', 'monthlyMinimum', 'currency', 'billByCbm'],
    sample: [{ customer: 'Example Customer Ltd', container20: 90, container40: 140, trailer20: 80, trailer40: 120, loosePerCbm: 3.5, minimumCharge: 50, monthlyMinimum: 0, currency: 'USD', billByCbm: 'no' }],
    note: 'container/trailer rates are per truck; loose rate is per CBM; billByCbm yes = always charge CBM x loose rate even for container/trailer',
  },
  storageMovements: {
    label: 'Storage Movements',
    headers: ['customer', 'date', 'reference', 'type', 'cbm', 'storage', 'handlingMode', 'containerSize', 'truckCount', 'packageQty', 'packageUom', 'storageDays', 'applyHandling'],
    sample: [{ customer: 'Example Customer Ltd', date: '2026-07-01', type: 'Inbound', reference: 'REF-001', cbm: 25, storage: 'Normal Storage', handlingMode: 'Container', containerSize: '40ft', truckCount: 1, packageQty: 100, packageUom: 'CTN', storageDays: '', applyHandling: 'yes' }],
    note: 'type: Inbound or Outbound; handlingMode: Container, Trailer or Loose; date in YYYY-MM-DD; applyHandling: yes/no (default yes) — whether to bill handling charges',
  },
  handlingCharges: {
    label: 'Manual Handling Charges',
    headers: ['customer', 'date', 'reference', 'cbm', 'packageQty', 'packageUom'],
    sample: [{ customer: 'Example Customer Ltd', date: '2026-07-01', reference: 'JOB-001', cbm: 25, packageQty: 100, packageUom: 'CTN' }],
    note: 'customer must have a handling rate in Master Data; charge = CBM x loose per-CBM rate (minimum applied); date in YYYY-MM-DD',
  },
}

export function downloadTemplate(kind) {
  const t = IMPORT_TEMPLATES[kind]
  if (!t) return
  const rows = t.sample.length ? t.sample : [Object.fromEntries(t.headers.map((h) => [h, '']))]
  exportXlsx(`wmstrack_template_${kind}.xlsx`, rows, t.label)
}
