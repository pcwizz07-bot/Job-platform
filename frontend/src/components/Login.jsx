import React, { useState } from 'react'
import { api } from '../api'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [step2FA, setStep2FA] = useState(false)
  const [tempToken, setTempToken] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await api.login(email, password)
      if (res.requires_2fa) {
        setTempToken(res.temp_token)
        setStep2FA(true)
      } else {
        onLogin(res.user, res.token)
      }
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const handle2FA = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await api.verify2fa(tempToken, code)
      onLogin(res.user, res.token)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  if (step2FA) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Two-Factor Auth</h1>
          <p>Enter the code from your authenticator app</p>
          {error && <div className="error">{error}</div>}
          <form onSubmit={handle2FA}>
            <div className="form-group">
              <label>Authentication Code</label>
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="000000" required maxLength={6} />
            </div>
            <button type="submit" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>⚡ JobBoard</h1>
        <p>Sign in to your account</p>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tech@example.com" required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <button type="submit" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}