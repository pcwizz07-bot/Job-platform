import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'

const STEP_ICONS = ['🔧', '📝', '✍️', '✍️', '✅']

export default function JobWorkflow({ user }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [step, setStep] = useState(0)
  const [timer, setTimer] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [completionDesc, setCompletionDesc] = useState('')
  const [hardwareUsed, setHardwareUsed] = useState('')
  const [clientSig, setClientSig] = useState('')
  const [clientFeedback, setClientFeedback] = useState('')
  const [techSig, setTechSig] = useState('')
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef(null)

  const load = async () => {
    try { setJob(await api.getJob(id)) }
    catch (e) { alert('Job not found'); navigate('/') }
  }
  useEffect(() => { load() }, [id])

  // Load saved timer
  useEffect(() => {
    if (job) {
      setTimer(job.timer_seconds || 0)
      setTimerRunning(!!job.timer_start)
      if (job.completion_description) setCompletionDesc(job.completion_description)
      if (job.hardware_used) setHardwareUsed(job.hardware_used)
      if (job.client_signature) setClientSig(job.client_signature)
      if (job.client_feedback) setClientFeedback(job.client_feedback)
      if (job.tech_signature) setTechSig(job.tech_signature)
      if (job.status === 'completed') setStep(4)
    }
  }, [job])

  // Timer tick
  useEffect(() => {
    if (!timerRunning) return;
    const i = setInterval(() => setTimer(t => t + 1), 1000)
    return () => clearInterval(i)
  }, [timerRunning])

  const formatTime = (s) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  const handleStartStop = async () => {
    if (timerRunning) {
      await api.pauseTimer(id)
      setTimerRunning(false)
    } else {
      await api.startTimer(id)
      setTimerRunning(true)
    }
  }

  const handleCompleteWork = async () => {
    if (!completionDesc.trim()) return alert('Description is required')
    setBusy(true)
    await api.completeWork(id, { completion_description: completionDesc, hardware_used: hardwareUsed })
    setTimerRunning(false)
    setStep(1)
    setBusy(false)
  }

  const handleClientSign = () => {
    const sig = canvasRef.current?.toDataURL()
    if (sig) setClientSig(sig)
    setStep(2)
  }

  const handleClientSignoff = async () => {
    setBusy(true)
    await api.clientSignoff(id, { client_signature: clientSig, client_feedback: clientFeedback || null })
    setStep(3)
    setBusy(false)
  }

  const handleTechSign = () => {
    const sig = document.getElementById('tech-canvas')?.toDataURL()
    if (sig) setTechSig(sig)
  }

  const handleTechSignoff = async () => {
    setBusy(true)
    await api.techSignoff(id, { tech_signature: techSig })
    setStep(4)
    setBusy(false)
  }

  if (!job) return <div style={{ padding: 40, textAlign: 'center' }}>Loading job...</div>

  // Simple signature pad component
  const SignaturePad = ({ canvasRef: ref, onDone }) => {
    const isDrawing = useRef(false)
    useEffect(() => {
      const canvas = ref.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      canvas.width = canvas.offsetWidth * 2
      canvas.height = canvas.offsetHeight * 2
      ctx.scale(2, 2)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2

      const start = (e) => { isDrawing.current = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y) }
      const draw = (e) => { if (!isDrawing.current) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke() }
      const end = () => { isDrawing.current = false }
      const getPos = (e) => {
        const r = canvas.getBoundingClientRect()
        const t = e.touches ? e.touches[0] : e
        return { x: t.clientX - r.left, y: t.clientY - r.top }
      }
      canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', draw); canvas.addEventListener('mouseup', end)
      canvas.addEventListener('touchstart', start); canvas.addEventListener('touchmove', draw); canvas.addEventListener('touchend', end)
      return () => { canvas.removeEventListener('mousedown', start); canvas.removeEventListener('mousemove', draw); canvas.removeEventListener('mouseup', end)
        canvas.removeEventListener('touchstart', start); canvas.removeEventListener('touchmove', draw); canvas.removeEventListener('touchend', end) }
    }, [ref])

    return (
      <div>
        <canvas ref={ref} style={{ width: '100%', height: 120, background: '#1a1d27', border: '1px solid var(--border)', borderRadius: 8, touchAction: 'none' }}></canvas>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="secondary" onClick={() => { const c = ref.current?.getContext('2d'); if (c) { c.clearRect(0, 0, 1000, 500) } }}>Clear</button>
          {onDone && <button onClick={onDone}>Next →</button>}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>{job.title}</h1>
          <p>{job.company_name || 'N/A'} • {job.technician_name || 'Unassigned'}</p>
        </div>
        <button className="secondary" onClick={() => navigate('/')}>← Back</button>
      </div>

      {/* Timer */}
      <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: 20 }}>
        <div style={{ fontSize: 48, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 2, marginBottom: 8 }}>
          {formatTime(timer)}
        </div>
        {step === 0 && (
          <button onClick={handleStartStop} style={{ fontSize: 16, padding: '10px 24px' }}>
            {timerRunning ? '⏸ Pause' : '▶ Start Job'}
          </button>
        )}
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {['Work', 'Materials', 'Client Sign', 'Tech Sign', 'Done'].map((s, i) => (
          <div key={s} style={{ flex: 1, textAlign: 'center', padding: '6px 8px', borderRadius: 6,
            background: i <= step ? 'var(--primary)' : 'var(--surface2)', color: i <= step ? '#fff' : 'var(--text2)', fontSize: 12, fontWeight: 600 }}>
            {STEP_ICONS[i]} {s}
          </div>
        ))}
      </div>

      {/* Step 0: Work Description */}
      {step === 0 && timerRunning === false && timer > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>📝 Describe what was done</h3>
          <div className="form-group">
            <label>Full description of work *</label>
            <textarea rows={4} value={completionDesc} onChange={e => setCompletionDesc(e.target.value)} placeholder="Describe the work completed..." />
          </div>
          <button onClick={handleCompleteWork} disabled={busy || !completionDesc.trim()}>
            {busy ? 'Saving...' : 'Next →'}
          </button>
        </div>
      )}

      {/* Step 1: Hardware Used */}
      {step === 1 && (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>🔩 Hardware / Parts Used</h3>
          <div className="form-group">
            <label>List all hardware, parts, or materials used</label>
            <textarea rows={4} value={hardwareUsed} onChange={e => setHardwareUsed(e.target.value)}
              placeholder={`- Screws (x10)\n- Cable ties\n- Power supply unit`} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStep(0)} className="secondary">← Back</button>
            <button onClick={() => setStep(2)}>Next →</button>
          </div>
        </div>
      )}

      {/* Step 2: Client Signature */}
      {step === 2 && (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>✍️ Client Sign-off</h3>
          {!clientSig ? (
            <>
              <p style={{ color: 'var(--text2)', marginBottom: 12, fontSize: 14 }}>Ask the client to sign below</p>
              <SignaturePad canvasRef={canvasRef} onDone={handleClientSign} />
            </>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <img src={clientSig} alt="Client signature" style={{ width: '100%', maxHeight: 80, background: '#fff', borderRadius: 8, padding: 8 }} />
              </div>
              <div className="form-group">
                <label>Client feedback (optional)</label>
                <textarea rows={2} value={clientFeedback} onChange={e => setClientFeedback(e.target.value)} placeholder="Any feedback from the client..." />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setClientSig(''); setStep(1) }} className="secondary">← Back</button>
                <button onClick={handleClientSignoff} disabled={busy}>Next →</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 3: Tech Signature */}
      {step === 3 && (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>✍️ Technician Sign-off</h3>
          {!techSig ? (
            <>
              <p style={{ color: 'var(--text2)', marginBottom: 12, fontSize: 14 }}>Sign to finalize the job</p>
              <SignaturePad canvasRef={useRef(null)} onDone={() => {
                const c = document.getElementById('tech-canvas-final')
                if (c) { setTechSig(c.toDataURL()); handleTechSignoff() }
              }} />
              <canvas id="tech-canvas-final" ref={el => {
                if (!el) return
                el.width = el.offsetWidth * 2
                el.height = 120 * 2
                const ctx = el.getContext('2d')
                ctx.scale(2, 2)
                let drawing = false
                el.addEventListener('mousedown', e => { drawing = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY) })
                el.addEventListener('mousemove', e => { if (!drawing) return; ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke() })
                el.addEventListener('mouseup', () => { drawing = false })
                el.addEventListener('touchstart', e => { const t = e.touches[0]; const r = el.getBoundingClientRect(); drawing = true; ctx.beginPath(); ctx.moveTo(t.clientX - r.left, t.clientY - r.top) })
                el.addEventListener('touchmove', e => { if (!drawing) return; e.preventDefault(); const t = e.touches[0]; const r = el.getBoundingClientRect(); ctx.lineTo(t.clientX - r.left, t.clientY - r.top); ctx.stroke() })
                el.addEventListener('touchend', () => { drawing = false })
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 2
              }} style={{ width: '100%', height: 120, background: '#1a1d27', border: '1px solid var(--border)', borderRadius: 8, touchAction: 'none' }}></canvas>
            </>
          ) : (
            <p>Signing off...</p>
          )}
        </div>
      )}

      {/* Step 4: Done */}
      {step === 4 && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h2 style={{ marginBottom: 8 }}>Job Complete!</h2>
          <p style={{ color: 'var(--text2)', marginBottom: 16 }}>The report has been sent to all administrators.</p>
          <div style={{ fontSize: 24, fontFamily: 'monospace', marginBottom: 16 }}>
            Time: {formatTime(timer)}
          </div>
          <button onClick={() => navigate('/')}>← Back to Dashboard</button>
        </div>
      )}
    </div>
  )
}