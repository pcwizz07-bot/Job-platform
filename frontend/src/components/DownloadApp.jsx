import React, { useState, useEffect } from 'react'
import { api } from '../api'

export default function DownloadApp({ user }) {
  const [apkInfo, setApkInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [buildLog, setBuildLog] = useState('')
  const [building, setBuilding] = useState(false)
  const isAdmin = user.role === 'admin'

  useEffect(() => {
    fetch('/api/apk-info')
      .then(r => r.json())
      .then(setApkInfo)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleBuild = async () => {
    if (!confirm('Start APK build? This takes a few minutes.')) return
    setBuilding(true)
    setBuildLog('Starting build...')
    try {
      const res = await fetch('/api/build-apk', { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
      const data = await res.json()
      setBuildLog(data.message || 'Build started')
      if (data.log) setBuildLog(data.log)
      // Refresh APK info after build
      setTimeout(async () => {
        const r = await fetch('/api/apk-info').then(r => r.json())
        setApkInfo(r)
        setBuilding(false)
      }, 5000)
    } catch (e) {
      setBuildLog('Build error: ' + e.message)
      setBuilding(false)
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <div className="header">
        <h1>📱 Mobile App</h1>
        <p>Download the Android APK for JobBoard Mobile</p>
      </div>

      <div className="card" style={{ textAlign: 'center', padding: 32, marginBottom: 16 }}>
        {loading ? (
          <p>Checking for available builds...</p>
        ) : apkInfo?.available ? (
          <>
            <div style={{ fontSize: 64, marginBottom: 16 }}>📱</div>
            <h2 style={{ marginBottom: 8 }}>APK Available</h2>
            <p style={{ color: 'var(--text2)', marginBottom: 16, fontSize: 14 }}>
              {apkInfo.filename} • {(apkInfo.size / 1024 / 1024).toFixed(1)} MB<br />
              Built: {new Date(apkInfo.date).toLocaleDateString()}
            </p>
            <a href={apkInfo.url} download style={{ textDecoration: 'none' }}>
              <button style={{ fontSize: 18, padding: '14px 40px' }}>
                ⬇ Download APK
              </button>
            </a>
            <p style={{ color: 'var(--text2)', fontSize: 12, marginTop: 8 }}>
              After downloading, open the APK on your Android phone to install.
              You may need to enable "Install from unknown sources" in settings.
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 64, marginBottom: 16 }}>📱</div>
            <h2 style={{ marginBottom: 8 }}>No APK Available</h2>
            <p style={{ color: 'var(--text2)', marginBottom: 16, fontSize: 14 }}>
              The Android app hasn't been built yet.{isAdmin ? ' You can trigger a build below.' : ' Ask your admin to build it.'}
            </p>
            {isAdmin && (
              <button onClick={handleBuild} disabled={building} style={{ fontSize: 16, padding: '12px 32px' }}>
                {building ? '⏳ Building...' : '🔨 Build APK'}
              </button>
            )}
            {buildLog && (
              <div style={{ marginTop: 12, padding: 12, background: 'var(--bg)', borderRadius: 6, fontSize: 12, textAlign: 'left', color: 'var(--text2)', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                {buildLog}
              </div>
            )}
          </>
        )}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ marginBottom: 8 }}>Installation Instructions</h3>
        <ol style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Download the APK file above</li>
          <li>Transfer it to your Android phone (USB, email, or direct download)</li>
          <li>Open the APK file on your phone</li>
          <li>If prompted, enable <b>"Install from unknown sources"</b></li>
          <li>Complete installation and open the app</li>
          <li>Log in with your JobBoard account</li>
        </ol>
      </div>

      {isAdmin && (
        <div className="card" style={{ padding: 20, marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>For Developers</h3>
          <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 }}>
            Source code:{' '}
            <a href="https://github.com/pcwizz07-bot/Job-platform-mobile" target="_blank" rel="noreferrer"
              style={{ color: 'var(--primary)' }}>
              github.com/pcwizz07-bot/Job-platform-mobile
            </a>
            <br />
            To build locally: <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>cd Job-platform-mobile && npm install && npx eas build -p android</code>
          </p>
        </div>
      )}
    </div>
  )
}