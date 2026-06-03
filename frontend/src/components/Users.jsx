import React, { useState, useEffect } from 'react'
import { api } from '../api'

export default function Users() {
  const [users, setUsers] = useState([])
  const [companies, setCompanies] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', role: 'tech', company_id: '', active: true })
  const [qrData, setQrData] = useState(null)
  const [qrUserId, setQrUserId] = useState(null)
  const [verifyCode, setVerifyCode] = useState('')

  const load = async () => { try { setUsers(await api.getUsers()); setCompanies(await api.getCompanies()) } catch (e) { alert(e.message) } }
  useEffect(() => { load() }, [])

  const resetForm = () => { setEditing(null); setForm({ name: '', email: '', password: '', phone: '', role: 'tech', company_id: '', active: true }) }
  const handleEdit = (u) => { setEditing(u.id); setForm({ name: u.name, email: u.email, password: '', phone: u.phone || '', role: u.role, company_id: u.company_id || '', active: !!u.active }) }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) return alert('Name and email required')
    try {
      if (editing) { const p = { ...form }; if (!p.password) delete p.password; await api.updateUser(editing, p) }
      else { if (!form.password) return alert('Password required'); await api.createUser(form) }
      resetForm(); load()
    } catch (e) { alert(e.message) }
  }

  const handleDelete = async (id) => { if (!confirm('Delete?')) return; await api.deleteUser(id); load() }

  const handleSetup2FA = async (id) => { try { const d = await api.setup2FA(id); setQrUserId(id); setQrData(d); setVerifyCode('') } catch (e) { alert(e.message) } }
  const handleEnable2FA = async () => { try { await api.enable2FA(qrUserId, verifyCode); setQrData(null); load() } catch (e) { alert(e.message) } }
  const handleDisable2FA = async (id) => { if (!confirm('Disable 2FA?')) return; await api.disable2FA(id); load() }

  return (
    <div>
      <div className="header"><h1>Users</h1><p>Manage accounts — admin, tech, and client users</p></div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>{editing ? 'Edit User' : 'Add User'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => set('name', e.target.value)} /></div>
          <div className="form-group"><label>Email *</label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></div>
          <div className="form-group"><label>{editing ? 'Password (blank = keep)' : 'Password *'}</label><input type="password" value={form.password} onChange={e => set('password', e.target.value)} /></div>
          <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
          <div className="form-group"><label>Role</label><select value={form.role} onChange={e => set('role', e.target.value)}>
            <option value="tech">Technician</option>
            <option value="admin">Admin</option>
            <option value="client">Client</option>
            <option value="viewer">Viewer (TV)</option>
          </select></div>
          <div className="form-group"><label>Company (for client accounts)</label><select value={form.company_id} onChange={e => set('company_id', e.target.value)}>
            <option value="">— None —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select></div>
        </div>
        {editing && <div className="form-group"><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} style={{ width: 'auto' }} /> Active
        </label></div>}
        <div style={{ display: 'flex', gap: 8 }}><button onClick={handleSave}>{editing ? 'Update' : 'Add User'}</button>{editing && <button className="secondary" onClick={resetForm}>Cancel</button>}</div>
      </div>

      {qrData && (
        <div className="modal-overlay" onClick={() => setQrData(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Setup Two-Factor Auth</h2>
            <p style={{ color: 'var(--text2)', marginBottom: 16, fontSize: 14 }}>Scan with authenticator app</p>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <img src={qrData.qr} alt="QR" style={{ width: 200, height: 200, background: 'white', padding: 8, borderRadius: 8 }} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', marginBottom: 16 }}>
              Secret: <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>{qrData.secret}</code>
            </p>
            <div style={{ display: 'flex', gap: 8 }}><div className="form-group" style={{ flex: 1, marginBottom: 0 }}><label>Code</label>
              <input value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder="000000" maxLength={6} /></div>
              <button onClick={handleEnable2FA}>Enable</button>
            </div>
          </div>
        </div>
      )}

      <div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Company</th><th>2FA</th><th>Active</th><th>Actions</th></tr></thead>
        <tbody>{users.filter(u => u.role !== 'viewer').map(u => (
          <tr key={u.id}>
            <td style={{ fontWeight: 600 }}>{u.name}</td>
            <td>{u.email}</td>
            <td><span className={`badge ${u.role}`}>{u.role}</span></td>
            <td>{u.company_name || '—'}</td>
            <td>{u.totp_enabled ? <span style={{ color: 'var(--green)' }}>✅</span> : '—'}</td>
            <td>{u.active ? <span style={{ color: 'var(--green)' }}>Active</span> : <span style={{ color: 'var(--red)' }}>Inactive</span>}</td>
            <td><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button className="secondary" onClick={() => handleEdit(u)}>Edit</button>
              {!u.totp_enabled ? <button className="secondary" onClick={() => handleSetup2FA(u.id)}>2FA</button> : <button className="secondary" onClick={() => handleDisable2FA(u.id)}>Disable 2FA</button>}
              <button className="danger" onClick={() => handleDelete(u.id)}>Del</button>
            </div></td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  )
}