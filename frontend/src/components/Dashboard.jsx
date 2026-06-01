import React, { useState, useEffect } from 'react'
import { api } from '../api'
import JobModal from './JobModal'

export default function Dashboard({ user, onLogout }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editJob, setEditJob] = useState(null)
  const isViewer = user.role === 'viewer'

  const load = async () => {
    try {
      const d = await api.getDashboard()
      setData(d)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Auto-refresh every 30s for TV display
  useEffect(() => {
    if (!isViewer) return;
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [isViewer]);

  const handleUpdate = async (id, updates) => {
    try {
      await api.updateJob(id, updates)
      setEditJob(null)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this job?')) return
    await api.deleteJob(id)
    load()
  }

  if (loading) return <p>Loading dashboard...</p>
  if (error) return <div className="error">{error}</div>
  if (!data) return null

  const { stats, jobs } = data

  // --- VIEWER TV MODE: full screen, no nav, scrollable ---
  if (isViewer) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', padding: 0, margin: '-24px', background: 'var(--bg)' }}>
        {/* Header */}
        <div style={{ padding: '24px 32px 16px', borderBottom: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: 36, fontWeight: 700 }}>⚡ Job Board</h1>
          {onLogout && <button onClick={onLogout} className="secondary" style={{ fontSize: 14 }}>Logout</button>}
        </div>

        {/* Stats bar */}
        <div style={{ display: 'flex', gap: 16, padding: '16px 32px', borderBottom: '2px solid var(--border)', background: 'var(--surface)' }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--green)' }}>{stats.ongoing || 0}</div>
            <div style={{ fontSize: 14, color: 'var(--text2)', textTransform: 'uppercase' }}>Ongoing</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--blue)' }}>{stats.upcoming || 0}</div>
            <div style={{ fontSize: 14, color: 'var(--text2)', textTransform: 'uppercase' }}>Upcoming</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--red)' }}>{stats.outstanding || 0}</div>
            <div style={{ fontSize: 14, color: 'var(--text2)', textTransform: 'uppercase' }}>Outstanding</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text2)' }}>{stats.completed || 0}</div>
            <div style={{ fontSize: 14, color: 'var(--text2)', textTransform: 'uppercase' }}>Completed</div>
          </div>
        </div>

        {/* Scrollable job list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 32px 32px' }}>
          {jobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)', fontSize: 24 }}>
              No active jobs
            </div>
          ) : (
            <div>
              {jobs.map(job => (
                <div key={job.id} className={`job-card status-${job.status}`}
                     style={{ padding: '20px 24px', marginBottom: 12, borderWidth: '0 0 0 6px' }}>
                  <div className="job-info">
                    <div className="job-title" style={{ fontSize: 24, fontWeight: 600 }}>{job.title}</div>
                    <div className="job-meta" style={{ fontSize: 18, gap: 20, marginTop: 8 }}>
                      <span className={`badge ${job.status}`} style={{ fontSize: 16, padding: '6px 16px', borderRadius: 6 }}>{job.status}</span>
                      {job.priority !== 'normal' && (
                        <span className={`badge ${job.priority}`} style={{ fontSize: 16, padding: '6px 16px', borderRadius: 6 }}>{job.priority}</span>
                      )}
                      {job.client_name && <span>👤 Client: {job.client_name}</span>}
                      {job.technician_name && <span>🔧 {job.technician_name}</span>}
                      {job.due_date && <span>📅 Due: {new Date(job.due_date).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // --- ADMIN / TECH MODE ---
  return (
    <div>
      <div className="header">
        <h1>Dashboard</h1>
        <p>Overview of all work and assignments</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card ongoing">
          <div className="num">{stats.ongoing || 0}</div>
          <div className="label">Ongoing</div>
        </div>
        <div className="stat-card upcoming">
          <div className="num">{stats.upcoming || 0}</div>
          <div className="label">Upcoming</div>
        </div>
        <div className="stat-card outstanding">
          <div className="num">{stats.outstanding || 0}</div>
          <div className="label">Outstanding</div>
        </div>
        <div className="stat-card completed">
          <div className="num">{stats.completed || 0}</div>
          <div className="label">Completed</div>
        </div>
      </div>

      {user.role === 'admin' && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => setEditJob({})}>+ New Job</button>
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="empty">
          <p style={{ fontSize: 18, marginBottom: 8 }}>No active jobs</p>
          <p>Create a new job to get started.</p>
        </div>
      ) : (
        <div>
          {jobs.map(job => (
            <div key={job.id} className={`job-card status-${job.status}`}
                 onClick={() => user.role === 'admin' && setEditJob(job)}>
              <div className="job-info">
                <div className="job-title">{job.title}</div>
                <div className="job-meta">
                  <span className={`badge ${job.status}`}>{job.status}</span>
                  {job.priority !== 'normal' && <span className={`badge ${job.priority}`}>{job.priority}</span>}
                  {job.client_name && <span>Client: {job.client_name}</span>}
                  {job.technician_name && <span>👤 {job.technician_name}</span>}
                  {job.due_date && <span>Due: {new Date(job.due_date).toLocaleDateString()}</span>}
                  {job.scheduled_date && <span>📅 {new Date(job.scheduled_date).toLocaleDateString()}</span>}
                </div>
              </div>
              {user.role === 'admin' && (
                <div className="job-actions">
                  <button className="secondary" onClick={e => { e.stopPropagation(); setEditJob(job) }}>Edit</button>
                  <button className="danger" onClick={e => { e.stopPropagation(); handleDelete(job.id) }}>X</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editJob && (
        <JobModal
          job={editJob}
          onSave={(id, data) => handleUpdate(id, data)}
          onClose={() => setEditJob(null)}
        />
      )}
    </div>
  )
}