import React, { useState, useEffect } from 'react'
import { api } from '../api'

export default function JobModal({ job, onSave, onClose }) {
  const [title, setTitle] = useState(job.title || '')
  const [description, setDescription] = useState(job.description || '')
  const [status, setStatus] = useState(job.status || 'upcoming')
  const [priority, setPriority] = useState(job.priority || 'normal')
  const [client_id, setClientId] = useState(job.client_id || '')
  const [technician_id, setTechnicianId] = useState(job.technician_id || '')
  const [scheduled_date, setScheduledDate] = useState(job.scheduled_date ? job.scheduled_date.slice(0, 10) : '')
  const [due_date, setDueDate] = useState(job.due_date ? job.due_date.slice(0, 10) : '')
  const [notes, setNotes] = useState(job.notes || '')
  const [clients, setClients] = useState([])
  const [techs, setTechs] = useState([])
  const [busy, setBusy] = useState(false)
  const isNew = !job.id

  useEffect(() => {
    api.getClients().then(setClients).catch(() => {})
    api.getTechnicians().then(setTechs).catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return alert('Title is required')
    setBusy(true)
    try {
      if (isNew) {
        const res = await api.createJob({ title, description, status, priority, client_id: client_id || null, technician_id: technician_id || null, scheduled_date: scheduled_date || null, due_date: due_date || null, notes })
        onSave(res.id, { title, description, status, priority, client_id, technician_id, scheduled_date, due_date, notes })
      } else {
        await onSave(job.id, { title, description, status, priority, client_id: client_id || null, technician_id: technician_id || null, scheduled_date: scheduled_date || null, due_date: due_date || null, notes })
      }
    } catch (err) {
      alert(err.message)
    }
    setBusy(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{isNew ? 'New Job' : 'Edit Job'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="upcoming">Upcoming</option>
                <option value="ongoing">Ongoing</option>
                <option value="outstanding">Outstanding</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div className="form-group">
              <label>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Client</label>
              <select value={client_id} onChange={e => setClientId(e.target.value)}>
                <option value="">— None —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Assigned Technician</label>
              <select value={technician_id} onChange={e => setTechnicianId(e.target.value)}>
                <option value="">— None —</option>
                {techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Scheduled Date</label>
              <input type="date" value={scheduled_date} onChange={e => setScheduledDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Due Date</label>
              <input type="date" value={due_date} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={busy}>{busy ? 'Saving...' : isNew ? 'Create' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}