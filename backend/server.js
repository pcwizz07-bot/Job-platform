require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const nodemailer = require('nodemailer');
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// --- Setup ---
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const DB_PATH = process.env.DB_PATH || './data/jobs.db';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

let db;

// DB helpers
function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
function dbGet(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}
function dbRun(sql, params = []) { db.run(sql, params); saveDb(); }
function dbExec(sql) { db.exec(sql); saveDb(); }
function saveDb() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}
function getLastId() {
  const row = dbGet('SELECT last_insert_rowid() as id');
  return row ? row.id : null;
}

// Email setup (configure with env vars)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  dbExec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      contact_person TEXT,
      accounts_person TEXT,
      email TEXT,
      phone TEXT,
      location_lat REAL,
      location_lng REAL,
      location_address TEXT,
      subdivision TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'tech' CHECK(role IN ('admin','tech','client','viewer')),
      company_id INTEGER REFERENCES companies(id),
      totp_secret TEXT,
      totp_enabled INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      ticket_holder TEXT,
      fault_description TEXT,
      tech_notes TEXT,
      client_id INTEGER REFERENCES companies(id),
      technician_id INTEGER REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'upcoming' CHECK(status IN ('upcoming','ongoing','outstanding','completed')),
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
      scheduled_date TEXT,
      notes TEXT,
      timer_start TEXT,
      timer_end TEXT,
      timer_seconds INTEGER DEFAULT 0,
      completion_description TEXT,
      hardware_used TEXT,
      client_signature TEXT,
      client_feedback TEXT,
      tech_signature TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS work_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER REFERENCES jobs(id),
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      title TEXT NOT NULL,
      message TEXT,
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// --- Auth Middleware ---
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

function adminOrTechOnly(req, res, next) {
  if (req.user.role === 'client' || req.user.role === 'viewer') 
    return res.status(403).json({ error: 'Access denied' });
  next();
}

// --- Auth Routes ---
app.post('/api/seed', async (req, res) => {
  const existing = dbGet("SELECT id FROM users WHERE role = 'admin'");
  if (existing) return res.json({ message: 'Already seeded' });

  const aHash = await bcrypt.hash('admin123', 10);
  const vHash = await bcrypt.hash('view123', 10);
  const cHash = await bcrypt.hash('client123', 10);
  dbRun("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'admin')", ['Admin', 'admin@platform.com', aHash]);
  dbRun("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'viewer')", ['Display TV', 'tv@platform.com', vHash]);
  dbRun("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'client')", ['Demo Client', 'client@demo.com', cHash]);
  res.json({ message: 'Accounts: admin@platform.com/admin123, tv@platform.com/view123, client@demo.com/client123' });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = dbGet('SELECT * FROM users WHERE email = ? AND active = 1', [email]);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (!(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: 'Invalid credentials' });
  if (user.totp_enabled)
    return res.json({ requires_2fa: true, temp_token: jwt.sign({ id: user.id, step: '2fa' }, JWT_SECRET, { expiresIn: '5m' }) });
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role, company_id: user.company_id }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, company_id: user.company_id } });
});

app.post('/api/auth/verify-2fa', (req, res) => {
  const { temp_token, code } = req.body;
  try {
    const decoded = jwt.verify(temp_token, JWT_SECRET);
    if (decoded.step !== '2fa') return res.status(400).json({ error: 'Invalid token' });
    const user = dbGet('SELECT * FROM users WHERE id = ?', [decoded.id]);
    if (!user || !user.totp_secret) return res.status(400).json({ error: '2FA not set up' });
    if (!speakeasy.totp.verify({ secret: user.totp_secret, encoding: 'base32', token: code, window: 1 }))
      return res.status(401).json({ error: 'Invalid 2FA code' });
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role, company_id: user.company_id }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, company_id: user.company_id } });
  } catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
});

// --- Company/Client CRUD ---
app.get('/api/companies', authMiddleware, (req, res) => {
  let query = 'SELECT * FROM companies ORDER BY company_name';
  const params = [];
  if (req.user.role === 'client' && req.user.company_id) {
    query = 'SELECT * FROM companies WHERE id = ?';
    params.push(req.user.company_id);
  }
  res.json(dbAll(query, params));
});

app.get('/api/companies/:id', authMiddleware, (req, res) => {
  const c = dbGet('SELECT * FROM companies WHERE id = ?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});

app.post('/api/companies', authMiddleware, adminOrTechOnly, (req, res) => {
  const { company_name, contact_person, accounts_person, email, phone, location_lat, location_lng, location_address, subdivision, notes } = req.body;
  if (!company_name) return res.status(400).json({ error: 'Company name required' });
  dbRun(`INSERT INTO companies (company_name, contact_person, accounts_person, email, phone, location_lat, location_lng, location_address, subdivision, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [company_name, contact_person || null, accounts_person || null, email || null, phone || null,
     location_lat || null, location_lng || null, location_address || null, subdivision || null, notes || null]);
  res.json({ id: getLastId(), company_name });
});

app.put('/api/companies/:id', authMiddleware, (req, res) => {
  const { company_name, contact_person, accounts_person, email, phone, location_lat, location_lng, location_address, subdivision, notes } = req.body;
  const existing = dbGet('SELECT id FROM companies WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  // Clients can only update their own company
  if (req.user.role === 'client' && req.user.company_id != req.params.id)
    return res.status(403).json({ error: 'Access denied' });
  const u = []; const p = [];
  if (company_name !== undefined) { u.push('company_name = ?'); p.push(company_name); }
  if (contact_person !== undefined) { u.push('contact_person = ?'); p.push(contact_person); }
  if (accounts_person !== undefined) { u.push('accounts_person = ?'); p.push(accounts_person); }
  if (email !== undefined) { u.push('email = ?'); p.push(email); }
  if (phone !== undefined) { u.push('phone = ?'); p.push(phone); }
  if (location_lat !== undefined) { u.push('location_lat = ?'); p.push(location_lat); }
  if (location_lng !== undefined) { u.push('location_lng = ?'); p.push(location_lng); }
  if (location_address !== undefined) { u.push('location_address = ?'); p.push(location_address); }
  if (subdivision !== undefined) { u.push('subdivision = ?'); p.push(subdivision); }
  if (notes !== undefined) { u.push('notes = ?'); p.push(notes); }
  if (u.length) { p.push(req.params.id); dbRun(`UPDATE companies SET ${u.join(', ')} WHERE id = ?`, p); }
  res.json({ message: 'Updated' });
});

app.delete('/api/companies/:id', authMiddleware, adminOnly, (req, res) => {
  dbRun('DELETE FROM companies WHERE id = ?', [req.params.id]);
  res.json({ message: 'Deleted' });
});

// --- User (Tech/Client accounts) CRUD ---
app.get('/api/users', authMiddleware, adminOnly, (req, res) => {
  res.json(dbAll('SELECT u.id, u.name, u.email, u.phone, u.role, u.company_id, u.active, u.totp_enabled, u.created_at, c.company_name FROM users u LEFT JOIN companies c ON u.company_id = c.id ORDER BY u.name'));
});

app.post('/api/users', authMiddleware, adminOnly, async (req, res) => {
  const { name, email, password, phone, role, company_id } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required' });
  if (dbGet('SELECT id FROM users WHERE email = ?', [email]))
    return res.status(400).json({ error: 'Email already exists' });
  const hash = await bcrypt.hash(password, 10);
  dbRun('INSERT INTO users (name, email, password, phone, role, company_id) VALUES (?, ?, ?, ?, ?, ?)',
    [name, email, hash, phone || null, role || 'tech', company_id || null]);
  res.json({ id: getLastId(), name, email, role });
});

app.put('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  const { name, email, password, phone, role, active, company_id } = req.body;
  if (!dbGet('SELECT id FROM users WHERE id = ?', [req.params.id]))
    return res.status(404).json({ error: 'Not found' });
  const u = []; const p = [];
  if (name) { u.push('name = ?'); p.push(name); }
  if (email) { u.push('email = ?'); p.push(email); }
  if (phone !== undefined) { u.push('phone = ?'); p.push(phone); }
  if (role) { u.push('role = ?'); p.push(role); }
  if (active !== undefined) { u.push('active = ?'); p.push(active ? 1 : 0); }
  if (company_id !== undefined) { u.push('company_id = ?'); p.push(company_id); }
  if (password) { u.push('password = ?'); p.push(await bcrypt.hash(password, 10)); }
  if (u.length) { p.push(req.params.id); dbRun(`UPDATE users SET ${u.join(', ')} WHERE id = ?`, p); }
  res.json({ message: 'Updated' });
});

app.delete('/api/users/:id', authMiddleware, adminOnly, (req, res) => {
  dbRun('DELETE FROM users WHERE id = ? AND role != ?', [req.params.id, 'admin']);
  res.json({ message: 'Deleted' });
});

// Setup 2FA
app.post('/api/users/:id/setup-2fa', authMiddleware, adminOnly, async (req, res) => {
  const user = dbGet('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const secret = speakeasy.generateSecret({ name: `JobPlatform:${user.email}` });
  dbRun('UPDATE users SET totp_secret = ? WHERE id = ?', [secret.base32, user.id]);
  const qr = await qrcode.toDataURL(secret.otpauth_url);
  res.json({ secret: secret.base32, qr });
});

app.post('/api/users/:id/enable-2fa', authMiddleware, adminOnly, (req, res) => {
  const { code } = req.body;
  const user = dbGet('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user || !user.totp_secret) return res.status(400).json({ error: '2FA not set up yet' });
  if (!speakeasy.totp.verify({ secret: user.totp_secret, encoding: 'base32', token: code, window: 1 }))
    return res.status(400).json({ error: 'Invalid code' });
  dbRun('UPDATE users SET totp_enabled = 1 WHERE id = ?', [user.id]);
  res.json({ message: '2FA enabled' });
});

app.post('/api/users/:id/disable-2fa', authMiddleware, adminOnly, (req, res) => {
  dbRun('UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?', [req.params.id]);
  res.json({ message: '2FA disabled' });
});

// --- Jobs CRUD ---
app.get('/api/jobs', authMiddleware, (req, res) => {
  let query = `
    SELECT j.*, c.company_name, c.contact_person, c.subdivision,
           t.name as technician_name, t.email as technician_email
    FROM jobs j
    LEFT JOIN companies c ON j.client_id = c.id
    LEFT JOIN users t ON j.technician_id = t.id
  `;
  const params = [];

  if (req.user.role === 'client' && req.user.company_id) {
    query += ' WHERE j.client_id = ?';
    params.push(req.user.company_id);
  } else if (req.user.role === 'tech') {
    query += ' WHERE j.technician_id = ?';
    params.push(req.user.id);
  } else if (req.query.status) {
    query += ` WHERE j.status IN (${req.query.status.split(',').map(() => '?').join(',')})`;
    params.push(...req.query.status.split(','));
  }

  query += ' ORDER BY j.created_at DESC';
  res.json(dbAll(query, params));
});

app.get('/api/jobs/:id', authMiddleware, (req, res) => {
  const job = dbGet(`
    SELECT j.*, c.company_name, c.contact_person, c.subdivision, c.location_lat, c.location_lng, c.location_address,
           t.name as technician_name, t.email as technician_email
    FROM jobs j
    LEFT JOIN companies c ON j.client_id = c.id
    LEFT JOIN users t ON j.technician_id = t.id
    WHERE j.id = ?
  `, [req.params.id]);
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json(job);
});

app.post('/api/jobs', authMiddleware, adminOrTechOnly, (req, res) => {
  const { title, ticket_holder, fault_description, tech_notes, client_id, technician_id, status, priority, scheduled_date, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  dbRun(`INSERT INTO jobs (title, ticket_holder, fault_description, tech_notes, client_id, technician_id, status, priority, scheduled_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, ticket_holder || null, fault_description || null, tech_notes || null,
     client_id || null, technician_id || null, status || 'upcoming', priority || 'normal',
     scheduled_date || null, notes || null]);
  const jobId = getLastId();
  dbRun('INSERT INTO work_logs (job_id, user_id, action, description) VALUES (?, ?, ?, ?)',
    [jobId, req.user.id, 'created', `Job "${title}" was created`]);
  res.json({ id: jobId, title });
});

app.put('/api/jobs/:id', authMiddleware, adminOrTechOnly, (req, res) => {
  const job = dbGet('SELECT id FROM jobs WHERE id = ?', [req.params.id]);
  if (!job) return res.status(404).json({ error: 'Not found' });
  const { title, ticket_holder, fault_description, tech_notes, client_id, technician_id, status, priority, scheduled_date, notes,
    completion_description, hardware_used, client_signature, client_feedback, tech_signature } = req.body;
  const u = []; const p = [];
  if (title) { u.push('title = ?'); p.push(title); }
  if (ticket_holder !== undefined) { u.push('ticket_holder = ?'); p.push(ticket_holder); }
  if (fault_description !== undefined) { u.push('fault_description = ?'); p.push(fault_description); }
  if (tech_notes !== undefined) { u.push('tech_notes = ?'); p.push(tech_notes); }
  if (client_id !== undefined) { u.push('client_id = ?'); p.push(client_id); }
  if (technician_id !== undefined) { u.push('technician_id = ?'); p.push(technician_id); }
  if (status) { u.push('status = ?'); p.push(status); }
  if (priority) { u.push('priority = ?'); p.push(priority); }
  if (scheduled_date !== undefined) { u.push('scheduled_date = ?'); p.push(scheduled_date); }
  if (notes !== undefined) { u.push('notes = ?'); p.push(notes); }
  if (completion_description !== undefined) { u.push('completion_description = ?'); p.push(completion_description); }
  if (hardware_used !== undefined) { u.push('hardware_used = ?'); p.push(hardware_used); }
  if (client_signature !== undefined) { u.push('client_signature = ?'); p.push(client_signature); }
  if (client_feedback !== undefined) { u.push('client_feedback = ?'); p.push(client_feedback); }
  if (tech_signature !== undefined) { u.push('tech_signature = ?'); p.push(tech_signature); }
  u.push("updated_at = datetime('now')");
  if (u.length > 1) { p.push(req.params.id); dbRun(`UPDATE jobs SET ${u.join(', ')} WHERE id = ?`, p); }
  res.json({ message: 'Updated' });
});

app.delete('/api/jobs/:id', authMiddleware, adminOrTechOnly, (req, res) => {
  dbRun('DELETE FROM jobs WHERE id = ?', [req.params.id]);
  res.json({ message: 'Deleted' });
});

// --- Timer endpoints ---
app.post('/api/jobs/:id/start-timer', authMiddleware, adminOrTechOnly, (req, res) => {
  const job = dbGet('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
  if (!job) return res.status(404).json({ error: 'Not found' });
  dbRun("UPDATE jobs SET status = 'ongoing', timer_start = datetime('now'), timer_seconds = ? WHERE id = ?",
    [job.timer_seconds || 0, req.params.id]);
  dbRun('INSERT INTO work_logs (job_id, user_id, action, description) VALUES (?, ?, ?, ?)',
    [req.params.id, req.user.id, 'timer_start', 'Job timer started']);
  res.json({ message: 'Timer started' });
});

app.post('/api/jobs/:id/pause-timer', authMiddleware, adminOrTechOnly, (req, res) => {
  const job = dbGet('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
  if (!job || !job.timer_start) return res.status(400).json({ error: 'Timer not started' });
  const elapsed = Math.floor((Date.now() - new Date(job.timer_start + 'Z').getTime()) / 1000);
  const total = (job.timer_seconds || 0) + Math.max(0, elapsed);
  dbRun("UPDATE jobs SET timer_seconds = ?, timer_start = NULL WHERE id = ?", [total, req.params.id]);
  res.json({ timer_seconds: total });
});

// --- Job completion workflow ---
app.post('/api/jobs/:id/complete-work', authMiddleware, adminOrTechOnly, (req, res) => {
  const { completion_description, hardware_used } = req.body;
  if (!completion_description) return res.status(400).json({ error: 'Description is required' });
  const job = dbGet('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
  let elapsed = 0;
  if (job && job.timer_start) {
    elapsed = Math.floor((Date.now() - new Date(job.timer_start + 'Z').getTime()) / 1000);
  }
  const total = (job.timer_seconds || 0) + Math.max(0, elapsed);
  dbRun("UPDATE jobs SET completion_description = ?, hardware_used = ?, timer_end = datetime('now'), timer_seconds = ?, timer_start = NULL, status = 'completed' WHERE id = ?",
    [completion_description, hardware_used || null, total, req.params.id]);
  dbRun('INSERT INTO work_logs (job_id, user_id, action, description) VALUES (?, ?, ?, ?)',
    [req.params.id, req.user.id, 'completed', 'Work completed and described']);
  res.json({ message: 'Work completed', timer_seconds: total });
});

app.post('/api/jobs/:id/client-signoff', authMiddleware, (req, res) => {
  const { client_signature, client_feedback } = req.body;
  dbRun('UPDATE jobs SET client_signature = ?, client_feedback = ? WHERE id = ?',
    [client_signature || null, client_feedback || null, req.params.id]);
  dbRun('INSERT INTO work_logs (job_id, user_id, action, description) VALUES (?, ?, ?, ?)',
    [req.params.id, req.user.id, 'client_signed', 'Client signed off']);
  res.json({ message: 'Client signed off' });
});

app.post('/api/jobs/:id/tech-signoff', authMiddleware, adminOrTechOnly, (req, res) => {
  const { tech_signature } = req.body;
  const job = dbGet('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
  dbRun('UPDATE jobs SET tech_signature = ?, status = ? WHERE id = ?',
    [tech_signature || null, job && job.client_signature ? 'completed' : 'completed', req.params.id]);
  dbRun('INSERT INTO work_logs (job_id, user_id, action, description) VALUES (?, ?, ?, ?)',
    [req.params.id, req.user.id, 'tech_signed', 'Technician signed off and job finalized']);

  // Generate report and email
  try {
    const full = dbGet(`SELECT j.*, c.company_name, c.contact_person, t.name as tech_name, t.email as tech_email
      FROM jobs j LEFT JOIN companies c ON j.client_id = c.id LEFT JOIN users t ON j.technician_id = t.id WHERE j.id = ?`, [req.params.id]);
    const report = generateReport(full);
    // Send to all admins
    const admins = dbAll("SELECT email FROM users WHERE role = 'admin' AND email IS NOT NULL");
    for (const admin of admins) {
      transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@jobplatform.com',
        to: admin.email,
        subject: `Job Report: ${full.title}`,
        html: report
      }).catch(() => {});
    }
  } catch {}

  res.json({ message: 'Job finalized, report sent' });
});

function generateReport(job) {
  const dur = job.timer_seconds ? `${Math.floor(job.timer_seconds / 60)}m ${job.timer_seconds % 60}s` : 'N/A';
  return `<h2>Job Report: ${job.title}</h2>
    <p><b>Company:</b> ${job.company_name || 'N/A'}</p>
    <p><b>Contact:</b> ${job.contact_person || 'N/A'}</p>
    <p><b>Technician:</b> ${job.tech_name || 'N/A'}</p>
    <p><b>Description:</b> ${job.completion_description || 'N/A'}</p>
    <p><b>Hardware Used:</b> ${job.hardware_used || 'N/A'}</p>
    <p><b>Duration:</b> ${dur}</p>
    <p><b>Client Feedback:</b> ${job.client_feedback || 'None'}</p>
    <p><b>Completed:</b> ${job.timer_end || 'N/A'}</p>`;
}

// --- Dashboard with columns ---
app.get('/api/dashboard', authMiddleware, (req, res) => {
  const isTech = req.user.role === 'tech';
  const isClient = req.user.role === 'client';
  let where = '';
  const params = [];
  if (isTech) { where = 'WHERE j.technician_id = ?'; params.push(req.user.id); }
  else if (isClient && req.user.company_id) { where = 'WHERE j.client_id = ?'; params.push(req.user.company_id); }

  const stats = dbGet(`SELECT COUNT(*) as total,
    SUM(CASE WHEN j.status = 'ongoing' THEN 1 ELSE 0 END) as ongoing,
    SUM(CASE WHEN j.status = 'upcoming' THEN 1 ELSE 0 END) as upcoming,
    SUM(CASE WHEN j.status = 'outstanding' THEN 1 ELSE 0 END) as outstanding,
    SUM(CASE WHEN j.status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM jobs j ${where}`, params) || { total: 0, ongoing: 0, upcoming: 0, outstanding: 0, completed: 0 };

  // Get jobs grouped by status
  const colWhere = isTech ? 'j.technician_id = ?' : (isClient ? 'j.client_id = ?' : '1=1');
  const colParams = isTech ? [req.user.id] : (isClient ? [req.user.company_id] : []);

  const outstanding = dbAll(`SELECT j.*, c.company_name, c.contact_person, t.name as technician_name, t.email as technician_email
    FROM jobs j LEFT JOIN companies c ON j.client_id = c.id LEFT JOIN users t ON j.technician_id = t.id WHERE ${colWhere} AND j.status = 'outstanding' ORDER BY j.updated_at DESC`, colParams);
  const ongoing = dbAll(`SELECT j.*, c.company_name, c.contact_person, t.name as technician_name, t.email as technician_email
    FROM jobs j LEFT JOIN companies c ON j.client_id = c.id LEFT JOIN users t ON j.technician_id = t.id WHERE ${colWhere} AND j.status = 'ongoing' ORDER BY j.updated_at DESC`, colParams);
  const upcoming = dbAll(`SELECT j.*, c.company_name, c.contact_person, t.name as technician_name, t.email as technician_email
    FROM jobs j LEFT JOIN companies c ON j.client_id = c.id LEFT JOIN users t ON j.technician_id = t.id WHERE ${colWhere} AND j.status = 'upcoming' ORDER BY j.scheduled_date ASC`, colParams);

  res.json({ stats, columns: { outstanding, ongoing, upcoming } });
});

// --- Work logs ---
app.get('/api/jobs/:id/logs', authMiddleware, (req, res) => {
  res.json(dbAll('SELECT wl.*, u.name as user_name FROM work_logs wl LEFT JOIN users u ON wl.user_id = u.id WHERE wl.job_id = ? ORDER BY wl.created_at', [req.params.id]));
});

// --- Notifications ---
app.get('/api/notifications', authMiddleware, (req, res) => {
  res.json(dbAll('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.user.id]));
});

app.post('/api/notifications/:id/read', authMiddleware, (req, res) => {
  dbRun('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ message: 'Marked read' });
});

// --- Client fault logging ---
app.post('/api/client/fault', authMiddleware, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Clients only' });
  const { title, fault_description } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  dbRun("INSERT INTO jobs (title, fault_description, client_id, status, priority) VALUES (?, ?, ?, 'upcoming', 'normal')",
    [title, fault_description || null, req.user.company_id]);
  const jobId = getLastId();
  dbRun('INSERT INTO work_logs (job_id, user_id, action, description) VALUES (?, ?, ?, ?)',
    [jobId, req.user.id, 'client_fault', `Fault reported by client: ${title}`]);
  // Notify admins
  const admins = dbAll("SELECT id FROM users WHERE role = 'admin'");
  for (const a of admins) {
    dbRun("INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)",
      [a.id, 'New fault reported', `${req.user.name} reported: ${title}`]);
  }
  res.json({ id: jobId, title, message: 'Fault reported successfully' });
});

// --- Client portal: my info ---
app.get('/api/client/my-company', authMiddleware, (req, res) => {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Clients only' });
  if (!req.user.company_id) return res.json(null);
  res.json(dbGet('SELECT * FROM companies WHERE id = ?', [req.user.company_id]));
});

// --- Build APK endpoint (admin only) ---
app.post('/api/build-apk', authMiddleware, adminOnly, (req, res) => {
  const buildScript = path.join(__dirname, '..', 'build-apk.sh');
  if (!fs.existsSync(buildScript)) {
    return res.status(400).json({ error: 'Build script not found. Clone Job-platform-mobile repo first.' });
  }
  // Start build in background
  const { exec } = require('child_process');
  exec(`bash ${buildScript}`, { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
    if (error) {
      console.error('APK build error:', error.message);
      return;
    }
    console.log('APK build output:', stdout);
  });
  res.json({ message: 'APK build started. Check /api/apk-info in a few minutes.' });
});

// --- Serve static ---
const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
const apkDir = path.join(__dirname, '..', 'apk');

// Serve APK files if they exist
if (fs.existsSync(apkDir)) {
  app.use('/apk', express.static(apkDir));
  app.get('/api/apk-info', (req, res) => {
    const apkFiles = fs.existsSync(apkDir) ? fs.readdirSync(apkDir).filter(f => f.endsWith('.apk')) : [];
    if (apkFiles.length === 0) return res.json({ available: false });
    const latest = apkFiles.sort().reverse()[0];
    const stats = fs.statSync(path.join(apkDir, latest));
    res.json({
      available: true,
      filename: latest,
      url: `/apk/${latest}`,
      size: stats.size,
      date: stats.mtime,
    });
  });
} else {
  app.get('/api/apk-info', (req, res) => res.json({ available: false }));
}
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// --- Start ---
async function start() {
  await initDb();
  app.listen(PORT, () => console.log(`Job Platform API running on http://localhost:${PORT}`));
}
start();