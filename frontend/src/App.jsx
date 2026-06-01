import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import Jobs from './components/Jobs'
import Clients from './components/Clients'
import Technicians from './components/Technicians'
import Sidebar from './components/Sidebar'

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const u = localStorage.getItem('user')
    const t = localStorage.getItem('token')
    if (u && t) {
      setUser(JSON.parse(u))
    }
    setLoading(false)
  }, [])

  const handleLogin = (user, token) => {
    localStorage.setItem('user', JSON.stringify(user))
    localStorage.setItem('token', token)
    setUser(user)
  }

  const handleLogout = () => {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    setUser(null)
    navigate('/login')
  }

  if (loading) return <div className="login-page"><p>Loading...</p></div>

  if (!user) {
    return <Login onLogin={handleLogin} />
  }

  const isAdmin = user.role === 'admin'

  return (
    <div className="app-layout">
      <Sidebar user={user} onLogout={handleLogout} />
      <div className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="/jobs" element={<Jobs user={user} />} />
          {isAdmin && <Route path="/clients" element={<Clients />} />}
          {isAdmin && <Route path="/technicians" element={<Technicians />} />}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  )
}