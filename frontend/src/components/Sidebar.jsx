import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

export default function Sidebar({ user, onLogout }) {
  const isAdmin = user.role === 'admin'
  const isViewer = user.role === 'viewer'

  return (
    <div className="sidebar">
      <h2>⚡ JobBoard</h2>
      <nav>
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
          📊 <span>Dashboard</span>
        </NavLink>
        {!isViewer && (
          <NavLink to="/jobs" className={({ isActive }) => isActive ? 'active' : ''}>
            📋 <span>Jobs</span>
          </NavLink>
        )}
        {isAdmin && (
          <>
            <NavLink to="/clients" className={({ isActive }) => isActive ? 'active' : ''}>
              👥 <span>Clients</span>
            </NavLink>
            <NavLink to="/technicians" className={({ isActive }) => isActive ? 'active' : ''}>
              🔧 <span>Technicians</span>
            </NavLink>
          </>
        )}
      </nav>
      <div className="user-info">
        <div className="name">{user.name}</div>
        <div className="email">{user.email}</div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
          {isAdmin ? 'Admin' : isViewer ? 'Viewer' : 'Technician'}
        </div>
        <button onClick={onLogout} className="secondary">Logout</button>
      </div>
    </div>
  )
}