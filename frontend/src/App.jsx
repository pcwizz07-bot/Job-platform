import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import KanbanBoard from './components/KanbanBoard'
import Jobs from './components/Jobs'
import JobWorkflow from './components/JobWorkflow'
import Companies from './components/Companies'
import Users from './components/Users'
import ClientPortal from './components/ClientPortal'
import Sidebar from './components/Sidebar'

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const u = localStorage.getItem('user')
    const t = localStorage.getItem('token')
    if (u && t) setUser(JSON.parse(u))
    setLoading(false)
  }, [])

  const handleLogin = (user, token) => {
    localStorage.setItem('user', JSON.stringify(user))
    localStorage.setItem('token', token)
    setUser(user)
  }

  const handleLogout = () => {
    localStorage.removeItem('user'); localStorage.removeItem('token')
    setUser(null); navigate('/login')
  }

  if (loading) return <div className="login-page"><p>Loading...</p></div>
  if (!user) return <Login onLogin={handleLogin} />

  const isAdmin = user.role === 'admin'
  const isClient = user.role === 'client'
  const isViewer = user.role === 'viewer'
  const isTech = user.role === 'tech'

  // Viewers get full-screen kanban
  if (isViewer) return <KanbanBoard user={user} onLogout={handleLogout} />

  // Clients get client portal
  if (isClient) return <ClientPortal user={user} onLogout={handleLogout} />

  return (
    <div className="app-layout">
      <Sidebar user={user} onLogout={handleLogout} />
      <div className="main-content">
        <Routes>
          <Route path="/" element={<KanbanBoard user={user} />} />
          <Route path="/jobs" element={<Jobs user={user} />} />
          <Route path="/jobs/:id/workflow" element={<JobWorkflow user={user} />} />
          {isAdmin && <Route path="/companies" element={<Companies />} />}
          {isAdmin && <Route path="/users" element={<Users />} />}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  )
}