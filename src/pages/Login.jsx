import React, { useState } from 'react'
import { useStore, REMEMBER_KEY } from '../store.jsx'
import { Field } from '../components/ui.jsx'
import Logo from '../components/Logo.jsx'
import WarehouseBackdrop from '../components/WarehouseBackdrop.jsx'

export default function Login() {
  const { login } = useStore()
  const [userId, setUserId] = useState(localStorage.getItem(REMEMBER_KEY) || '')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(!!localStorage.getItem(REMEMBER_KEY))
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!userId.trim() || !password) return
    setBusy(true)
    setError('')
    const res = await login(userId, password)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    if (remember) localStorage.setItem(REMEMBER_KEY, userId.trim())
    else localStorage.removeItem(REMEMBER_KEY)
  }

  return (
    <div className="login-wrap">
      <WarehouseBackdrop />
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <Logo size={74} />
        </div>
        <h1>LogiTrack Pro</h1>
        <div className="sub">Integrated Service Solutions · Warehouse Operations &amp; Billing</div>
        {error && <div className="login-error">{error}</div>}
        <Field label="User ID" required>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="e.g. developer"
            autoFocus
            autoComplete="username"
          />
        </Field>
        <Field label="Password" required>
          <div className="input-wrap">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{ paddingRight: 36 }}
            />
            <button type="button" className="eye" onClick={() => setShowPw((v) => !v)} title={showPw ? 'Hide password' : 'Show password'}>
              {showPw ? '🙈' : '👁️'}
            </button>
          </div>
        </Field>
        <label className="checkbox-row" style={{ marginBottom: 16 }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember User ID
        </label>
        <button className="btn btn-primary" style={{ width: '100%', padding: '11px' }} disabled={!userId.trim() || !password || busy}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  )
}
