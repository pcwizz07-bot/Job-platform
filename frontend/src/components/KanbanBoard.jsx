import React, { useState, useEffect } from 'react'
import { api } from '../api'
import JobModal from './JobModal'

const COLORS = {
  outstanding: { bg: '#450a0a', border: '#ef4444', text: '#fca5a5' },
  ongoing: { bg: '#14532d', border: '#22c55e', text: '#86efac' },
  upcoming: { bg: '#1e3a5f', border: '#3b82f6', text: '#93c5fd' }
}

export default function KanbanBoard({ user, onLogout }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editJob, setEditJob] = useState(null)
  const isViewer = user.role === 'viewer'

  const load = async () => {
    try { setData(await api.getDashboard()) }
    catch (e) {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Auto-refresh for viewer
  useEffect(() => {
    if (!isViewer) return;
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, [isViewer])

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>
  if (!data) return null

  const { stats, columns } = data

  const handleDelete = async (id) => {
    if (!confirm('Delete this job?')) return
    await api.deleteJob(id)
    load()
  }

  // Fetch all jobs for the kanban (includes clients, techs)
  const kanbanJobs = columns || { outstanding: [], ongoing: [], upcoming: [] }

  // Full-screen viewer mode
  if (isViewer) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--border)' }}>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>⚡ Job Board</h1>
          {onLogout && <button onClick={onLogout} className="secondary">Logout</button>}
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 16, padding: 16 }}>
          {['outstanding', 'ongoing', 'upcoming'].map(col => (
            <div key={col} style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', background: COLORS[col].bg, borderBottom: `2px solid ${COLORS[col].border}` }}>
                <h2 style={{ fontSize: 18, textTransform: 'uppercase', letterSpacing: 1, color: COLORS[col].text }}>
                  {col} ({kanbanJobs[col]?.length || 0})
                </h2>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                {(kanbanJobs[col] || []).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--text2)', fontSize: 13 }}>No jobs</div>
                ) : (
                  (kanbanJobs[col] || []).map(job => (
                    <div key={job.id} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, borderLeft: `3px solid ${COLORS[col].border}` }}>
                      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{job.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                        {job.company_name && <div>🏢 {job.company_name}</div>}
                        {job.technician_name && <div>🔧 {job.technician_name}</div>}
                        {job.scheduled_date && <div>📅 {new Date(job.scheduled_date).toLocaleDateString()}</div>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Admin/Tech mode with sidebar
  return (
    <div>
      <div className="header">
        <h1>Dashboard</h1>
        <p>Kanban board — drag jobs between columns</p>
      </div>

      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card" style={{ borderLeft: '3px solid #ef4444' }}>
          <div className="num" style={{ color: '#ef4444' }}>{stats.outstanding || 0}</div>
          <div className="label">Outstanding</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid #22c55e' }}>
          <div className="num" style={{ color: '#22c55e' }}>{stats.ongoing || 0}</div>
          <div className="label">Ongoing</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid #3b82f6' }}>
          <div className="num" style={{ color: '#3b82f6' }}>{stats.upcoming || 0}</div>
          <div className="label">Upcoming</div>
        </div>
        <div className="stat-card">
          <div className="num" style={{ color: 'var(--text2)' }}>{stats.completed || 0}</div>
          <div className="label">Completed</div>
        </div>
      </div>

      {user.role === 'admin' && (
        <div style={{ marginBottom: 12 }}><button onClick={() => setEditJob({})}>+ New Job</button></div>
      )}

      <div style={{ display: 'flex', gap: 12, minHeight: '60vh' }}>
        {['outstanding', 'ongoing', 'upcoming'].map(col => (
          <div key={col} style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRadius: 8, border: `1px solid var(--border)` }}>
            <div style={{ padding: '10px 14px', borderBottom: `2px solid ${COLORS[col].border}`, background: COLORS[col].bg, borderRadius: '8px 8px 0 0' }}>
              <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: COLORS[col].text }}>
                {col} ({kanbanJobs[col]?.length || 0})
              </h3>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {(kanbanJobs[col] || []).length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text2)', fontSize: 12 }}>Empty</div>
              ) : (
                (kanbanJobs[col] || []).map(job => (
                  <div key={job.id} style={{ background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px', marginBottom: 6, borderLeft: `3px solid ${COLORS[col].border}`, cursor: 'pointer' }}
                    onClick={() => user.role === 'admin' && setEditJob(job)}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{job.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                      {job.company_name && <span>🏢 {job.company_name} </span>}
                      {job.technician_name && <span>🔧 {job.technician_name} </span>}
                      {job.scheduled_date && <span>📅 {new Date(job.scheduled_date).toLocaleDateString()}</span>}
                    </div>
                    {user.role === 'admin' && (
                      <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                        <button className="secondary" style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={e => { e.stopPropagation(); setEditJob(job) }}>Edit</button>
                        <button className="danger" style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={e => { e.stopPropagation(); handleDelete(job.id) }}>Del</button>
                      </div>
                    )}
                    {user.role === 'tech' && (
                      <div style={{ marginTop: 6 }}>
                        <button className="secondary" style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={() => window.location.href = `/#/jobs/${job.id}/workflow`}>Work</button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {editJob && (
        <JobModal job={editJob} onSave={() => { setEditJob(null); load() }} onClose={() => setEditJob(null)} />
      )}
    </div>
  )
}