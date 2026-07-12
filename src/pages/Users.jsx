import React, { useState } from 'react'
import { useStore, PAGES, ROLES, ROLE_PAGES } from '../store.jsx'
import { Modal, Field, Select, StatusBadge, EmptyState } from '../components/ui.jsx'
import { passwordPolicyError } from '../utils.js'

function BackupsCard() {
  const { listBackups, restoreBackup } = useStore()
  const [snapshots, setSnapshots] = useState(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    setSnapshots(await listBackups())
    setLoading(false)
  }

  async function restore(s) {
    if (!window.confirm(`Restore the database to the backup from ${new Date(s.savedAt).toLocaleString()}? The current state is snapshotted first so you can undo.`)) return
    if (await restoreBackup(s.id)) load()
  }

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 12 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>💾 Database Backups</div>
        <button className="btn btn-sm btn-outline" onClick={load} disabled={loading}>{loading ? 'Loading…' : '↻ Load backups'}</button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 10 }}>
        Automatic point-in-time snapshots (taken periodically as the database changes). Restore recovers the whole database to a chosen point; the current state is snapshotted first so a restore can be undone.
      </p>
      {snapshots == null ? null : snapshots.length === 0 ? (
        <EmptyState icon="💾" title="No backups yet" hint="Snapshots appear here as the database is used." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Taken</th><th className="num">Version</th><th></th></tr></thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id}>
                  <td>{new Date(s.savedAt).toLocaleString()}</td>
                  <td className="num">{s.version}</td>
                  <td><button className="btn btn-sm btn-warn" onClick={() => restore(s)}>Restore</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function UserModal({ record, onClose }) {
  const { db, upsert, toast, logAction, setUserPassword } = useStore()
  const [r, setR] = useState(
    record || { name: '', userId: '', role: 'User', active: true, allowedPages: null },
  )
  const [password, setPassword] = useState('')
  const [customAccess, setCustomAccess] = useState(Array.isArray(record?.allowedPages) && record.allowedPages.length > 0)
  const [pages, setPages] = useState(new Set(record?.allowedPages || ROLE_PAGES[record?.role || 'User']))

  const isNew = !record
  const duplicate = db.users.some(
    (u) => u.userId.toLowerCase() === r.userId.trim().toLowerCase() && u.id !== record?.id,
  )
  // A password is required for new users, optional (reset) when editing; when
  // present it must satisfy the policy.
  const passwordOk = isNew ? !passwordPolicyError(password) : (!password || !passwordPolicyError(password))
  const valid = r.name.trim() && r.userId.trim() && !duplicate && passwordOk

  function togglePage(k) {
    setPages((s) => {
      const n = new Set(s)
      n.has(k) ? n.delete(k) : n.add(k)
      return n
    })
  }

  async function save() {
    const rec = {
      ...r,
      name: r.name.trim(),
      userId: r.userId.trim(),
      allowedPages: customAccess ? [...pages] : null,
    }
    upsert('users', rec, { entityType: 'Users', label: 'user' })
    if (password) {
      try {
        await setUserPassword(rec.userId, password)
      } catch (e) {
        toast(e.message || 'Failed to set password', 'error')
        return
      }
    }
    logAction(isNew ? 'User Created' : 'User Edited', 'Users', `${rec.userId} (${rec.role})${password ? ' — password set' : ''}`)
    toast(isNew ? 'User created' : 'User updated')
    onClose()
  }

  return (
    <Modal
      title={isNew ? 'Create User' : `Edit User — ${record.userId}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!valid} onClick={save}>{isNew ? 'Create User' : 'Save Changes'}</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Full name" required>
          <input type="text" value={r.name} onChange={(e) => setR((s) => ({ ...s, name: e.target.value }))} autoFocus />
        </Field>
        <Field label="User ID" required hint={duplicate ? '⚠ This User ID is already taken' : 'Login is case-insensitive'}>
          <input type="text" value={r.userId} onChange={(e) => setR((s) => ({ ...s, userId: e.target.value }))} />
        </Field>
        <Field label={isNew ? 'Password' : 'Reset password'} required={isNew} hint={password || isNew ? (passwordPolicyError(password) || '✓ Meets policy') : 'Leave empty to keep current password'}>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isNew ? '' : '(unchanged)'} />
        </Field>
        <Field label="Role" required>
          <Select value={r.role} onChange={(v) => { setR((s) => ({ ...s, role: v })); if (!customAccess) setPages(new Set(ROLE_PAGES[v])) }} options={ROLES} />
        </Field>
      </div>

      <label className="checkbox-row" style={{ margin: '4px 0 10px' }}>
        <input type="checkbox" checked={r.active} onChange={(e) => setR((s) => ({ ...s, active: e.target.checked }))} />
        Active (inactive users cannot log in)
      </label>

      <label className="checkbox-row" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={customAccess} onChange={(e) => { setCustomAccess(e.target.checked); if (e.target.checked) setPages(new Set(ROLE_PAGES[r.role])) }} />
        Custom page access (override role defaults)
      </label>

      {customAccess && (
        <div className="row" style={{ gap: 8 }}>
          {PAGES.filter((p) => p.key !== 'users' || r.role === 'Developer').map((p) => (
            <label key={p.key} className="checkbox-row" style={{ border: '1px solid var(--ink-200)', borderRadius: 8, padding: '5px 10px' }}>
              <input type="checkbox" checked={pages.has(p.key)} onChange={() => togglePage(p.key)} />
              {p.label}
            </label>
          ))}
        </div>
      )}
    </Modal>
  )
}

export default function Users() {
  const { db, currentUser, upsert, toast, logAction, resetDb, clearDemoData } = useStore()
  const [modal, setModal] = useState(null) // null | 'new' | user record

  function toggleActive(u) {
    if (u.id === currentUser.id) return toast('You cannot deactivate yourself', 'error')
    upsert('users', { ...u, active: !u.active }, { entityType: 'Users', label: 'user' })
    logAction('User Edited', 'Users', `${u.userId} set ${!u.active ? 'active' : 'inactive'}`)
  }

  return (
    <div>
      <h1 className="page-title">User &amp; Authorization</h1>
      <p className="page-sub">Create users, assign roles, control page access and account status.</p>

      <div className="card">
        <div className="spread" style={{ marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>👥 Users</div>
          <button className="btn btn-sm btn-primary" onClick={() => setModal('new')}>＋ Create User</button>
        </div>

        {db.users.length === 0 ? (
          <EmptyState icon="👥" title="No users" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Name</th><th>User ID</th><th>Role</th><th>Page Access</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {db.users.map((u) => (
                  <tr key={u.id}>
                    <td><b>{u.name}</b></td>
                    <td>{u.userId}</td>
                    <td><span className="badge badge-blue">{u.role.toUpperCase()}</span></td>
                    <td>{Array.isArray(u.allowedPages) && u.allowedPages.length ? `Custom (${u.allowedPages.length} pages)` : 'Role default'}</td>
                    <td><StatusBadge status={u.active ? 'active' : 'inactive'} /></td>
                    <td>
                      <div className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => setModal(u)}>Edit</button>
                        <button className="btn btn-sm btn-warn" disabled={u.id === currentUser.id} onClick={() => toggleActive(u)}>
                          {u.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ borderColor: '#fecaca' }}>
        <div className="card-title" style={{ color: 'var(--red-600)' }}>⚠ Danger Zone</div>
        <p style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 10 }}>
          Clear all demo transactions and master data (customers, activities, rates, attendance, operations, billing, VAS charges). User accounts are preserved.
        </p>
        <button className="btn btn-danger" style={{ marginBottom: 16 }} onClick={() => window.confirm('Clear all demo transactions and master data? User accounts will be kept. This cannot be undone.') && clearDemoData()}>
          Clear Demo Data
        </button>
        <p style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 10 }}>
          Reset the entire database back to the seed/demo data. All operations, billing and users you created will be lost.
        </p>
        <button className="btn btn-danger" onClick={() => window.confirm('Reset ALL data back to seed/demo state? This cannot be undone.') && resetDb()}>
          Reset Database to Seed Data
        </button>
      </div>

      {currentUser.role === 'Developer' && <BackupsCard />}

      {modal && <UserModal record={modal === 'new' ? null : modal} onClose={() => setModal(null)} />}
    </div>
  )
}
