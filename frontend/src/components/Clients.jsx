import React, { useState, useEffect } from 'react'
import { api } from '../api'

export default function Clients() {
  const [clients, setClients] = useState([])
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')

  const load = async () => {
    try {
      const data = await api.getClients()
      setClients(data)
    } catch (err) { alert(err.message) }
  }

  useEffect(() => { load() }, [])

  const resetForm = () => {
    setEditing(null); setName(''); setEmail(''); setPhone(''); setAddress(''); setNotes('')
  }

  const handleEdit = (c) => {
    setEditing(c.id); setName(c.name); setEmail(c.email || ''); setPhone(c.phone || ''); setAddress(c.address || ''); setNotes(c.notes || '')
  }

  const handleSave = async () => {
    if (!name.trim()) return alert('Name required')
    try {
      if (editing) {
        await api.updateClient(editing, { name, email, phone, address, notes })
      } else {
        await api.createClient({ name, email, phone, address, notes })
      }
      resetForm()
      load()
    } catch (err) { alert(err.message) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this client?')) return
    await api.deleteClient(id)
    load()
  }

  return (
    <div>
      <div className="header">
        <h1>Clients</h1>
        <p>Manage client database</p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>{editing ? 'Edit Client' : 'Add Client'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Address</label>
            <input value={address} onChange={e => setAddress(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave}>{editing ? 'Update' : 'Add Client'}</button>
          {editing && <button className="secondary" onClick={resetForm}>Cancel</button>}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Address</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td>{c.email || '—'}</td>
                <td>{c.phone || '—'}</td>
                <td>{c.address || '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="secondary" onClick={() => handleEdit(c)}>Edit</button>
                    <button className="danger" onClick={() => handleDelete(c.id)}>Del</button>
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