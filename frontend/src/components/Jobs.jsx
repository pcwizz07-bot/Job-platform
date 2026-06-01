import React, { useState, useEffect } from 'react'
import { api } from '../api'
import JobModal from './JobModal'

export default function Jobs({ user }) {
  const [jobs, setJobs] = useState([])
  const [filter, setFilter] = useState('')
  const [editJob, setEditJob] = useState(null)
  const isAdmin = user.role === 'admin'

  const load = async () => {
    try {
      const data = await api.getJobs(filter || undefined)
      setJobs(data)
    } catch (err) {
      alert(err.message)
    }
  }

  useEffect(() => { load() }, [filter])

  const handleModalSave = () => {
    setEditJob(null)
    load()
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this job?')) return
    await api.deleteJob(id)
    load()
  }

  return (
    <div>
      <div className="header">
        <h1>Jobs</h1>
        <p>Manage all jobs across statuses</p>
      </div>

      <div className="toolbar">
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="upcoming">Upcoming</option>
          <option value="ongoing">Ongoing</option>
          <option value="outstanding">Outstanding</option>
          <option value="completed">Completed</option>
        </select>
        <div className="spacer" />
        {isAdmin && <button onClick={() => setEditJob({})}>+ New Job</button>}
      </div>

      {jobs.length === 0 ? (
        <div className="empty">No jobs found</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Client</th>
                <th>Assigned To</th>
                <th>Due Date</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id}>
                  <td style={{ fontWeight: 600 }}>{job.title}</td>
                  <td><span className={`badge ${job.status}`}>{job.status}</span></td>
                  <td>{job.priority !== 'normal' && <span className={`badge ${job.priority}`}>{job.priority}</span>}</td>
                  <td>{job.client_name || '—'}</td>
                  <td>{job.technician_name || '—'}</td>
                  <td>{job.due_date ? new Date(job.due_date).toLocaleDateString() : '—'}</td>
                  {isAdmin && (
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="secondary" onClick={() => setEditJob(job)}>Edit</button>
                        <button className="danger" onClick={() => handleDelete(job.id)}>Del</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editJob && (
        <JobModal
          job={editJob}
          onSave={handleModalSave}
          onClose={() => setEditJob(null)}
        />
      )}
    </div>
  )
}