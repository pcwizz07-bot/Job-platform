import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

export default function Sidebar({ user, onLogout }) {
  const isAdmin = user.role === 'admin'

  return (
    <div className="sidebar">
      <h2>⚡ JobBoard</h2>
      <nav>
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
          📊 <span>Dashboard</span>
        </NavLink>
        <NavLink to="/jobs" className={({ isActive }) => isActive ? 'active' : ''}>
          📋 <span>Jobs</span>
        </NavLink>
        {isAdmin && (
          <>
            <NavLink to="/companies" className={({ isActive }) => isActive ? 'active' : ''}>
              🏢 <span>Companies</span>
            </NavLink>
            <NavLink to="/users" className={({ isActive }) => isActive ? 'active' : ''}>
              👥 <span>Users</span>
            </NavLink>
          </>
        )}
      </nav>
      <div className="user-info">
        <div className="name">{user.name}</div>
        <div className="email">{user.email}</div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
          {isAdmin ? 'Admin' : 'Technician'}
        </div>
        <button onClick={onLogout} className="secondary">Logout</button>
      </div>
    </div>
  )
}