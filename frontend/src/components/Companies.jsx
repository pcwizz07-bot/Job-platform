import React, { useState, useEffect } from 'react'
import { api } from '../api'

export default function Companies() {
  const [companies, setCompanies] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ company_name: '', contact_person: '', accounts_person: '', email: '', phone: '', location_lat: '', location_lng: '', location_address: '', subdivision: '', notes: '' })

  const load = async () => { try { setCompanies(await api.getCompanies()) } catch (e) { alert(e.message) } }
  useEffect(() => { load() }, [])

  const resetForm = () => { setEditing(null); setForm({ company_name: '', contact_person: '', accounts_person: '', email: '', phone: '', location_lat: '', location_lng: '', location_address: '', subdivision: '', notes: '' }) }
  const handleEdit = (c) => { setEditing(c.id); setForm({ ...c }) }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.company_name.trim()) return alert('Company name required')
    try {
      if (editing) { await api.updateCompany(editing, form) } else { await api.createCompany(form) }
      resetForm(); load()
    } catch (e) { alert(e.message) }
  }

  const handleDelete = async (id) => { if (!confirm('Delete?')) return; await api.deleteCompany(id); load() }

  return (
    <div>
      <div className="header"><h1>Companies</h1><p>Client company database</p></div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>{editing ? 'Edit Company' : 'Add Company'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group"><label>Company Name *</label><input value={form.company_name} onChange={e => set('company_name', e.target.value)} /></div>
          <div className="form-group"><label>Contact Person</label><input value={form.contact_person} onChange={e => set('contact_person', e.target.value)} /></div>
          <div className="form-group"><label>Accounts Person</label><input value={form.accounts_person} onChange={e => set('accounts_person', e.target.value)} /></div>
          <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></div>
          <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
          <div className="form-group"><label>Subdivision</label><input value={form.subdivision} onChange={e => set('subdivision', e.target.value)} /></div>
        </div>
        <div className="form-group"><label>Location Address</label><input value={form.location_address} onChange={e => set('location_address', e.target.value)} placeholder="Physical address or pin-drop location" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group"><label>Latitude</label><input type="number" step="any" value={form.location_lat} onChange={e => set('location_lat', e.target.value)} /></div>
          <div className="form-group"><label>Longitude</label><input type="number" step="any" value={form.location_lng} onChange={e => set('location_lng', e.target.value)} /></div>
        </div>
        <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 8 }}><button onClick={handleSave}>{editing ? 'Update' : 'Add Company'}</button>{editing && <button className="secondary" onClick={resetForm}>Cancel</button>}</div>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Company</th><th>Contact</th><th>Email</th><th>Subdivision</th><th>Actions</th></tr></thead>
        <tbody>{companies.map(c => (
          <tr key={c.id}>
            <td style={{ fontWeight: 600 }}>{c.company_name}</td>
            <td>{c.contact_person || '—'}</td>
            <td>{c.email || '—'}</td>
            <td>{c.subdivision || '—'}</td>
            <td><div style={{ display: 'flex', gap: 4 }}>
              <button className="secondary" onClick={() => handleEdit(c)}>Edit</button>
              <button className="danger" onClick={() => handleDelete(c.id)}>Del</button>
            </div></td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  )
}