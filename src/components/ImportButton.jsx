import { useRef } from 'react'
import { readSpreadsheetFile, downloadTemplate, IMPORT_TEMPLATES } from '../excel.js'
import { useStore } from '../store.jsx'

/**
 * Bulk Excel/CSV import + template download pair.
 * `kind` keys IMPORT_TEMPLATES; `onRows(rows)` receives parsed row objects and
 * should return { imported, skipped } or a string error.
 */
export default function ImportButton({ kind, onRows }) {
  const { toast } = useStore()
  const inputRef = useRef(null)
  const tpl = IMPORT_TEMPLATES[kind]

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const rows = await readSpreadsheetFile(file)
      if (!rows.length) return toast('No rows found in the file', 'error')
      const res = onRows(rows)
      if (typeof res === 'string') return toast(res, 'error')
      toast(`Imported ${res.imported} row(s)${res.skipped ? `, skipped ${res.skipped}` : ''}`)
    } catch (err) {
      toast(`Import failed: ${err.message}`, 'error')
    }
  }

  return (
    <span className="row" style={{ gap: 6 }}>
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFile} />
      <button className="btn btn-sm btn-outline" onClick={() => inputRef.current?.click()} title={tpl?.note || ''}>
        ⬆ Import Excel
      </button>
      <button className="btn btn-sm btn-ghost" onClick={() => downloadTemplate(kind)} title="Download a sample template">
        📄 Template
      </button>
    </span>
  )
}
