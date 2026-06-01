import React, { useState, useEffect } from 'react'
import { api } from '../api'

export default function Technicians() {
  const [techs, setTechs] = useState([])
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [active, setActive] = useState(true)
  const [qrData, setQrData] = useState(null)
  const [qrTechId, setQrTechId] = useState(null)
  const [verifyCode, setVerifyCode] = useState('')

  const load = async () => {
    try {
      const data = await api.getTechnicians()
      setTechs(data)
    } catch (err) { alert(err.message) }
  }

  useEffect(() => { load() }, [])

  const resetForm = () => {
    setEditing(null); setName(''); setEmail(''); setPassword(''); setPhone(''); setActive(true)
  }

  const handleEdit = (t) => {
    setEditing(t.id); setName(t.name); setEmail(t.email); setPhone(t.phone || ''); setActive(!!t.active); setPassword('')
  }

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) return alert('Name and email required')
    try {
      if (editing) {
        const payload = { name, email, phone, active: active ? 1 : 0 }
        if (password) payload.password = password
        await api.updateTechnician(editing, payload)
      } else {
        if (!password) return alert('Password required for new tech')
        await api.createTechnician({ name, email, password, phone })
      }
      resetForm()
      load()
    } catch (err) { alert(err.message) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this technician?')) return
    await api.deleteTechnician(id)
    load()
  }

  const handleSetup2FA = async (id) => {
    try {
      const data = await api.setup2FA(id)
      setQrTechId(id)
      setQrData(data)
      setVerifyCode('')
    } catch (err) { alert(err.message) }
  }

  const handleEnable2FA = async () => {
    try {
      await api.enable2FA(qrTechId, verifyCode)
      setQrData(null)
      setQrTechId(null)
      load()
    } catch (err) { alert(err.message) }
  }

  const handleDisable2FA = async (id) => {
    if (!confirm('Disable 2FA for this technician?')) return
    await api.disable2FA(id)
    load()
  }

  return (
    <div>
      <div className="header">
        <h1>Technicians</h1>
        <p>Manage technician accounts and 2FA</p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>{editing ? 'Edit Technician' : 'Add Technician'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Email *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label>{editing ? 'New Password (leave blank to keep)' : 'Password *'}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
        </div>
        {editing && (
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} style={{ width: 'auto' }} />
              Active
            </label>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave}>{editing ? 'Update' : 'Add Technician'}</button>
          {editing && <button className="secondary" onClick={resetForm}>Cancel</button>}
        </div>
      </div>

      {/* 2FA Modal */}
      {qrData && (
        <div className="modal-overlay" onClick={() => setQrData(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Setup Two-Factor Auth</h2>
            <p style={{ color: 'var(--text2)', marginBottom: 16, fontSize: 14 }}>
              Scan this QR code with Google Authenticator or any TOTP app
            </p>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <img src={qrData.qr} alt="2FA QR Code" style={{ width: 200, height: 200, background: 'white', padding: 8, borderRadius: 8 }} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', marginBottom: 16 }}>
              Or enter secret manually: <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>{qrData.secret}</code>
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>Verify Code</label>
                <input value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder="000000" maxLength={6} />
              </div>
              <button onClick={handleEnable2FA}>Enable 2FA</button>
            </div>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>2FA</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {techs.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight: 600 }}>{t.name}</td>
                <td>{t.email}</td>
                <td>{t.phone || '—'}</td>
                <td>
                  {t.totp_enabled ? (
                    <span style={{ color: 'var(--green)' }}>✅ Enabled</span>
                  ) : (
                    <span style={{ color: 'var(--text2)' }}>—</span>
                  )}
                </td>
                <td>{t.active ? <span style={{ color: 'var(--green)' }}>Active</span> : <span style={{ color: 'var(--red)' }}>Inactive</span>}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button className="secondary" onClick={() => handleEdit(t)}>Edit</button>
                    {!t.totp_enabled
                      ? <button className="secondary" onClick={() => handleSetup2FA(t.id)}>Setup 2FA</button>
                      : <button className="secondary" onClick={() => handleDisable2FA(t.id)}>Disable 2FA</button>
                    }
                    <button className="danger" onClick={() => handleDelete(t.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}