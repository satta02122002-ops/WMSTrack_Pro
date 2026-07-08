import React, { useState } from 'react'
import { useStore, PAGES, pagesForUser } from '../store.jsx'
import { Modal, Field } from './ui.jsx'
import Logo from './Logo.jsx'
import { fmtTime } from '../utils.js'

function ChangePasswordModal({ onClose }) {
  const { changePassword, toast } = useStore()
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')

  const valid = oldPw && newPw.length >= 4 && newPw === confirmPw

  async function submit() {
    setError('')
    if (newPw !== confirmPw) return setError('New passwords do not match')
    const res = await changePassword(oldPw, newPw)
    if (!res.ok) return setError(res.error)
    toast('Password changed successfully')
    onClose()
  }

  return (
    <Modal
      title="Change Password"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!valid} onClick={submit}>Update Password</button>
        </>
      }
    >
      {error && <div className="login-error">{error}</div>}
      <Field label="Current password" required>
        <input type={show ? 'text' : 'password'} value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoFocus />
      </Field>
      <Field label="New password" required hint="Minimum 4 characters">
        <input type={show ? 'text' : 'password'} value={newPw} onChange={(e) => setNewPw(e.target.value)} />
      </Field>
      <Field label="Confirm new password" required>
        <input type={show ? 'text' : 'password'} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
      </Field>
      <label className="checkbox-row">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
      </label>
    </Modal>
  )
}

export default function Layout({ page, setPage, children }) {
  const { currentUser, logout, isCheckedIn, needsCheckIn, todayAttendance, checkIn, checkOut, toasts } = useStore()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)

  const allowed = pagesForUser(currentUser)
  const navPages = PAGES.filter((p) => allowed.includes(p.key))

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="hamburger" onClick={() => setMobileOpen((v) => !v)} aria-label="Menu">☰</button>
        <div className="header-logo">
          <Logo size={30} />
        </div>
        <div className="header-title">
          LogiTrack Pro
          <small>Integrated Service Solutions</small>
        </div>
        <div className="header-spacer" />
        <div className="header-user">
          <div className="name">{currentUser?.name}</div>
          <div className="role">
            {currentUser?.role}
            {isCheckedIn && todayAttendance && <> · On shift since {fmtTime(todayAttendance.checkInTime)}</>}
          </div>
        </div>
        <div className="header-actions">
          {!isCheckedIn ? (
            <button className="btn btn-header" onClick={checkIn} title="Mark yourself present to start operations">
              ✅ Check-In
            </button>
          ) : (
            <button className="btn btn-header" onClick={checkOut} title="End your shift, record hours and log out">
              🕔 Check-Out
            </button>
          )}
          <button className="btn btn-header" onClick={() => setPwOpen(true)}>🔑 Password</button>
          <button className="btn btn-header" onClick={() => logout()}>Logout</button>
        </div>
      </header>

      <div className="app-body">
        {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}
        <aside className={'sidebar' + (collapsed ? ' collapsed' : '') + (mobileOpen ? ' mobile-open' : '')}>
          <nav className="sidebar-nav">
            {navPages.map((p) => (
              <button
                key={p.key}
                className={'nav-item' + (page === p.key ? ' active' : '')}
                onClick={() => { setPage(p.key); setMobileOpen(false) }}
                title={p.label}
              >
                <span className="ico">{p.icon}</span>
                {!collapsed && <span>{p.label}</span>}
              </button>
            ))}
          </nav>
          <div className="sidebar-foot">
            <button className="collapse-btn" onClick={() => setCollapsed((v) => !v)}>
              {collapsed ? '»' : '« Collapse'}
            </button>
          </div>
        </aside>

        <main className="app-main">
          {needsCheckIn && page === 'operations' && (
            <div className="banner banner-warn">
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div>
                <b>You are not checked in.</b> Click <b>Check-In</b> in the header to mark yourself present before starting warehouse operations.
              </div>
            </div>
          )}
          {children}
        </main>
      </div>

      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={'toast toast-' + t.kind}>
            <span>{t.kind === 'error' ? '⛔' : t.kind === 'info' ? 'ℹ️' : '✅'}</span>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}
