import React, { useState, useEffect } from 'react'
import { api } from '../api'

export default function ClientPortal({ user, onLogout }) {
  const [company, setCompany] = useState(null)
  const [jobs, setJobs] = useState([])
  const [editing, setEditing] = useState(false)
  const [faultForm, setFaultForm] = useState({ title: '', fault_description: '' })
  const [companyForm, setCompanyForm] = useState({})
  const [message, setMessage] = useState('')
  const [showFault, setShowFault] = useState(false)

  const load = async () => {
    try {
      setCompany(await api.getMyCompany())
      setJobs(await api.getJobs())
    } catch (e) {}
  }

  useEffect(() => { load() }, [])

  const handleUpdateCompany = async () => {
    try {
      await api.updateCompany(company.id, companyForm)
      setCompany(await api.getMyCompany())
      setEditing(false)
      setMessage('Company info updated')
    } catch (e) { alert(e.message) }
  }

  const handleReportFault = async () => {
    if (!faultForm.title.trim()) return alert('Title required')
    try {
      await api.reportFault(faultForm)
      setShowFault(false)
      setFaultForm({ title: '', fault_description: '' })
      setMessage('Fault reported successfully!')
      load()
    } catch (e) { alert(e.message) }
  }

  if (!company) return <div style={{ padding: 40, textAlign: 'center' }}>
    <h2>Client Portal</h2>
    <p style={{ color: 'var(--text2)' }}>Loading your information...</p>
  </div>

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24 }}>🏢 {company.company_name}</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14 }}>Welcome, {user.name}</p>
        </div>
        <button onClick={onLogout} className="secondary">Logout</button>
      </div>

      {message && <div className="success">{message}</div>}

      {/* Company Info */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3>Company Information</h3>
          <button className="secondary" onClick={() => { setEditing(!editing); setCompanyForm({ ...company }) }}>
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>
        {editing ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group"><label>Company Name</label><input value={companyForm.company_name || ''} onChange={e => setCompanyForm(f => ({ ...f, company_name: e.target.value }))} /></div>
              <div className="form-group"><label>Contact Person</label><input value={companyForm.contact_person || ''} onChange={e => setCompanyForm(f => ({ ...f, contact_person: e.target.value }))} /></div>
              <div className="form-group"><label>Accounts Person</label><input value={companyForm.accounts_person || ''} onChange={e => setCompanyForm(f => ({ ...f, accounts_person: e.target.value }))} /></div>
              <div className="form-group"><label>Email</label><input type="email" value={companyForm.email || ''} onChange={e => setCompanyForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="form-group"><label>Phone</label><input value={companyForm.phone || ''} onChange={e => setCompanyForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div className="form-group"><label>Subdivision</label><input value={companyForm.subdivision || ''} onChange={e => setCompanyForm(f => ({ ...f, subdivision: e.target.value }))} /></div>
            </div>
            <button onClick={handleUpdateCompany} style={{ marginTop: 12 }}>Save</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 14 }}>
            <div><b>Contact:</b> {company.contact_person || '—'}</div>
            <div><b>Accounts:</b> {company.accounts_person || '—'}</div>
            <div><b>Email:</b> {company.email || '—'}</div>
            <div><b>Phone:</b> {company.phone || '—'}</div>
            <div><b>Subdivision:</b> {company.subdivision || '—'}</div>
            <div><b>Location:</b> {company.location_address || '—'}</div>
          </div>
        )}
      </div>

      {/* Report Fault */}
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setShowFault(!showFault)}>📢 Report a Fault / Query</button>
      </div>
      {showFault && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Report a Fault</h3>
          <div className="form-group"><label>Title *</label><input value={faultForm.title} onChange={e => setFaultForm(f => ({ ...f, title: e.target.value }))} placeholder="Brief title of the issue" /></div>
          <div className="form-group"><label>Description</label><textarea rows={3} value={faultForm.fault_description} onChange={e => setFaultForm(f => ({ ...f, fault_description: e.target.value }))} placeholder="Describe the fault or query..." /></div>
          <button onClick={handleReportFault}>Submit</button>
        </div>
      )}

      {/* Jobs */}
      <h3 style={{ marginBottom: 12 }}>My Jobs</h3>
      {jobs.length === 0 ? (
        <div className="empty">No jobs yet</div>
      ) : (
        jobs.map(job => (
          <div key={job.id} className={`job-card status-${job.status}`}>
            <div className="job-info">
              <div className="job-title">{job.title}</div>
              <div className="job-meta">
                <span className={`badge ${job.status}`}>{job.status}</span>
                {job.technician_name && <span>🔧 {job.technician_name}</span>}
                {job.scheduled_date && <span>📅 {new Date(job.scheduled_date).toLocaleDateString()}</span>}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}