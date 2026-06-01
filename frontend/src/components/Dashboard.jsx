import React, { useState, useEffect } from 'react'
import { api } from '../api'
import JobModal from './JobModal'

export default function Dashboard({ user }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editJob, setEditJob] = useState(null)

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