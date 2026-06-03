import React, { useState, useEffect } from 'react'
import { api } from '../api'

export default function JobModal({ job, onSave, onClose }) {
  const [title, setTitle] = useState(job.title || '')
  const [ticket_holder, setTicketHolder] = useState(job.ticket_holder || '')
  const [fault_description, setFaultDesc] = useState(job.fault_description || '')
  const [tech_notes, setTechNotes] = useState(job.tech_notes || '')
  const [status, setStatus] = useState(job.status || 'upcoming')
  const [priority, setPriority] = useState(job.priority || 'normal')
  const [client_id, setClientId] = useState(job.client_id || '')
  const [technician_id, setTechnicianId] = useState(job.technician_id || '')
  const [scheduled_date, setScheduledDate] = useState(job.scheduled_date ? job.scheduled_date.slice(0, 10) : '')
  const [notes, setNotes] = useState(job.notes || '')
  const [clients, setClients] = useState([])
  const [techs, setTechs] = useState([])
  const [busy, setBusy] = useState(false)
  const isNew = !job.id

  useEffect(() => {
    api.getCompanies().then(setClients).catch(() => {})
    api.getUsers().then(setTechs).catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return alert('Title is required')
    setBusy(true)
    try {
      const data = { title, ticket_holder, fault_description, tech_notes, status, priority, client_id: client_id || null, technician_id: technician_id || null, scheduled_date: scheduled_date || null, notes }
      if (isNew) await api.createJob(data)
      else await api.updateJob(job.id, data)
      onSave()
    } catch (err) { alert(err.message) }
    setBusy(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{isNew ? 'New Job' : 'Edit Job'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Title *</label><input value={title} onChange={e => setTitle(e.target.value)} required /></div>
          <div className="form-group"><label>Ticket Holder</label><input value={ticket_holder} onChange={e => setTicketHolder(e.target.value)} placeholder="Person who raised the ticket" /></div>
          <div className="form-group"><label>Description of Fault</label><textarea rows={3} value={fault_description} onChange={e => setFaultDesc(e.target.value)} placeholder="Description of the fault or issue" /></div>
          <div className="form-group"><label>Notes for Technician</label><textarea rows={2} value={tech_notes} onChange={e => setTechNotes(e.target.value)} placeholder="Internal notes for the assigned tech" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group"><label>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="upcoming">Upcoming</option><option value="ongoing">Ongoing</option>
                <option value="outstanding">Outstanding</option><option value="completed">Completed</option>
              </select></div>
            <div className="form-group"><label>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="low">Low</option><option value="normal">Normal</option>
                <option value="high">High</option><option value="urgent">Urgent</option>
              </select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group"><label>Client / Company</label>
              <select value={client_id} onChange={e => setClientId(e.target.value)}>
                <option value="">— None —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select></div>
            <div className="form-group"><label>Assign to Technician</label>
              <select value={technician_id} onChange={e => setTechnicianId(e.target.value)}>
                <option value="">— None —</option>
                {techs.filter(t => t.role === 'tech' || t.role === 'admin').map(t =>
                  <option key={t.id} value={t.id}>{t.name} ({t.role})</option>)}
              </select></div>
          </div>
          <div className="form-group"><label>Scheduled Date</label><input type="date" value={scheduled_date} onChange={e => setScheduledDate(e.target.value)} /></div>
          <div className="form-group"><label>Notes</label><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={busy}>{busy ? 'Saving...' : isNew ? 'Create' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}