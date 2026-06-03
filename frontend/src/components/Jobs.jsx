import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import JobModal from './JobModal'

export default function Jobs({ user }) {
  const [jobs, setJobs] = useState([])
  const [filter, setFilter] = useState('')
  const [editJob, setEditJob] = useState(null)
  const navigate = useNavigate()
  const isAdmin = user.role === 'admin'

  const load = async () => {
    try { setJobs(await api.getJobs(filter || undefined)) }
    catch (e) { alert(e.message) }
  }
  useEffect(() => { load() }, [filter])

  const handleDelete = async (id) => {
    if (!confirm('Delete this job?')) return
    await api.deleteJob(id)
    load()
  }

  return (
    <div>
      <div className="header"><h1>Jobs</h1><p>All jobs across statuses</p></div>
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

      {jobs.length === 0 ? <div className="empty">No jobs found</div> : (
        <div className="table-wrap"><table>
          <thead><tr>
            <th>Title</th><th>Status</th><th>Client</th><th>Technician</th><th>Scheduled</th><th>Timer</th>
            {isAdmin && <th>Actions</th>}{(user.role === 'tech') && <th>Work</th>}
          </tr></thead>
          <tbody>{jobs.filter(j => filter ? j.status === filter : true).map(job => (
            <tr key={job.id}>
              <td style={{ fontWeight: 600 }}>{job.title}</td>
              <td><span className={`badge ${job.status}`}>{job.status}</span></td>
              <td>{job.company_name || '—'}</td>
              <td>{job.technician_name || '—'}</td>
              <td>{job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString() : '—'}</td>
              <td>{job.timer_seconds ? `${Math.floor(job.timer_seconds / 60)}m` : '—'}</td>
              {isAdmin && <td><div style={{ display: 'flex', gap: 4 }}>
                <button className="secondary" onClick={() => setEditJob(job)}>Edit</button>
                <button className="danger" onClick={() => handleDelete(job.id)}>Del</button>
              </div></td>}
              {user.role === 'tech' && job.status !== 'completed' && (
                <td><button className="secondary" onClick={() => navigate(`/jobs/${job.id}/workflow`)}>▶ Work</button></td>
              )}
            </tr>
          ))}</tbody>
        </table></div>
      )}

      {editJob && <JobModal job={editJob} onSave={() => { setEditJob(null); load() }} onClose={() => setEditJob(null)} />}
    </div>
  )
}