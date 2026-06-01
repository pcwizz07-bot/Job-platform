require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// --- Setup ---
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

app.use(cors());
app.use(express.json());

// Ensure data dir
const dbDir = path.dirname(process.env.DB_PATH || './data/jobs.db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(process.env.DB_PATH || './data/jobs.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Database Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS technicians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'tech',
    totp_secret TEXT,
    totp_enabled INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    client_id INTEGER REFERENCES clients(id),
    technician_id INTEGER REFERENCES technicians(id),
    status TEXT NOT NULL DEFAULT 'upcoming' CHECK(status IN ('upcoming','ongoing','outstanding','completed')),
    priority TEXT DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
    scheduled_date TEXT,
    due_date TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// --- Auth Middleware ---
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// --- Auth Routes ---

// Admin seed (first run)
app.post('/api/seed', async (req, res) => {
  const existing = db.prepare('SELECT id FROM technicians WHERE role = ?').get('admin');
  if (existing) return res.json({ message: 'Already seeded' });

  const hash = await bcrypt.hash('admin123', 10);
  db.prepare('INSERT INTO technicians (name, email, password, role, totp_enabled) VALUES (?, ?, ?, ?, ?)')
    .run('Admin', 'admin@platform.com', hash, 'admin', 0);
  res.json({ message: 'Admin created — email: admin@platform.com, password: admin123' });
});

// Technician login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const tech = db.prepare('SELECT * FROM technicians WHERE email = ? AND active = 1').get(email);
  if (!tech) return res.status(401).json({ error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, tech.password);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  // Check if TOTP is enabled
  if (tech.totp_enabled) {
    return res.json({ requires_2fa: true, temp_token: jwt.sign({ id: tech.id, step: '2fa' }, JWT_SECRET, { expiresIn: '5m' }) });
  }

  const token = jwt.sign({ id: tech.id, email: tech.email, name: tech.name, role: tech.role || 'tech' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: tech.id, name: tech.name, email: tech.email, role: tech.role || 'tech' } });
});

// Verify 2FA
app.post('/api/auth/verify-2fa', (req, res) => {
  const { temp_token, code } = req.body;
  if (!temp_token || !code) return res.status(400).json({ error: 'Token and code required' });

  try {
    const decoded = jwt.verify(temp_token, JWT_SECRET);
    if (decoded.step !== '2fa') return res.status(400).json({ error: 'Invalid token' });

    const tech = db.prepare('SELECT * FROM technicians WHERE id = ?').get(decoded.id);
    if (!tech || !tech.totp_secret) return res.status(400).json({ error: '2FA not set up' });

    const verified = speakeasy.totp.verify({
      secret: tech.totp_secret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!verified) return res.status(401).json({ error: 'Invalid 2FA code' });

    const token = jwt.sign({ id: tech.id, email: tech.email, name: tech.name, role: tech.role || 'tech' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: tech.id, name: tech.name, email: tech.email, role: tech.role || 'tech' } });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// Setup 2FA (admin only)
app.post('/api/technicians/:id/setup-2fa', authMiddleware, adminOnly, async (req, res) => {
  const tech = db.prepare('SELECT * FROM technicians WHERE id = ?').get(req.params.id);
  if (!tech) return res.status(404).json({ error: 'Technician not found' });

  const secret = speakeasy.generateSecret({ name: `JobPlatform:${tech.email}` });
  db.prepare('UPDATE technicians SET totp_secret = ? WHERE id = ?').run(secret.base32, tech.id);

  const qr = await qrcode.toDataURL(secret.otpauth_url);
  res.json({ secret: secret.base32, qr });
});

// Enable 2FA (after verified)
app.post('/api/technicians/:id/enable-2fa', authMiddleware, adminOnly, (req, res) => {
  const { code } = req.body;
  const tech = db.prepare('SELECT * FROM technicians WHERE id = ?').get(req.params.id);
  if (!tech || !tech.totp_secret) return res.status(400).json({ error: '2FA not set up yet' });

  const verified = speakeasy.totp.verify({ secret: tech.totp_secret, encoding: 'base32', token: code, window: 1 });
  if (!verified) return res.status(400).json({ error: 'Invalid code' });

  db.prepare('UPDATE technicians SET totp_enabled = 1 WHERE id = ?').run(tech.id);
  res.json({ message: '2FA enabled' });
});

// Disable 2FA
app.post('/api/technicians/:id/disable-2fa', authMiddleware, adminOnly, (req, res) => {
  db.prepare('UPDATE technicians SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: '2FA disabled' });
});

// --- Technician CRUD (Admin) ---
app.get('/api/technicians', authMiddleware, adminOnly, (req, res) => {
  const techs = db.prepare('SELECT id, name, email, phone, totp_enabled, active, created_at FROM technicians ORDER BY name').all();
  res.json(techs);
});

app.post('/api/technicians', authMiddleware, adminOnly, async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required' });

  const exists = db.prepare('SELECT id FROM technicians WHERE email = ?').get(email);
  if (exists) return res.status(400).json({ error: 'Email already exists' });

  const hash = await bcrypt.hash(password, 10);
  const result = db.prepare('INSERT INTO technicians (name, email, password, phone) VALUES (?, ?, ?, ?)').run(name, email, hash, phone || null);
  res.json({ id: result.lastInsertRowid, name, email });
});

app.put('/api/technicians/:id', authMiddleware, adminOnly, async (req, res) => {
  const { name, email, password, phone, active } = req.body;
  const tech = db.prepare('SELECT id FROM technicians WHERE id = ?').get(req.params.id);
  if (!tech) return res.status(404).json({ error: 'Not found' });

  const updates = [];
  const params = [];
  if (name) { updates.push('name = ?'); params.push(name); }
  if (email) { updates.push('email = ?'); params.push(email); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
  if (active !== undefined) { updates.push('active = ?'); params.push(active ? 1 : 0); }
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    updates.push('password = ?');
    params.push(hash);
  }
  if (updates.length) {
    params.push(req.params.id);
    db.prepare(`UPDATE technicians SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  res.json({ message: 'Updated' });
});

app.delete('/api/technicians/:id', authMiddleware, adminOnly, (req, res) => {
  db.prepare('DELETE FROM technicians WHERE id = ? AND role IS NULL').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// --- Client CRUD ---
app.get('/api/clients', authMiddleware, (req, res) => {
  const clients = db.prepare('SELECT * FROM clients ORDER BY name').all();
  res.json(clients);
});

app.get('/api/clients/:id', authMiddleware, (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Not found' });
  res.json(client);
});

app.post('/api/clients', authMiddleware, (req, res) => {
  const { name, email, phone, address, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const result = db.prepare('INSERT INTO clients (name, email, phone, address, notes) VALUES (?, ?, ?, ?, ?)')
    .run(name, email || null, phone || null, address || null, notes || null);
  res.json({ id: result.lastInsertRowid, name });
});

app.put('/api/clients/:id', authMiddleware, (req, res) => {
  const { name, email, phone, address, notes } = req.body;
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Not found' });

  const updates = []; const params = [];
  if (name) { updates.push('name = ?'); params.push(name); }
  if (email !== undefined) { updates.push('email = ?'); params.push(email); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
  if (address !== undefined) { updates.push('address = ?'); params.push(address); }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
  if (updates.length) {
    params.push(req.params.id);
    db.prepare(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  res.json({ message: 'Updated' });
});

app.delete('/api/clients/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// --- Jobs CRUD ---
app.get('/api/jobs', authMiddleware, (req, res) => {
  const techId = req.user.role === 'tech' ? req.user.id : null;
  let query = `
    SELECT j.*, c.name as client_name, t.name as technician_name, t.email as technician_email
    FROM jobs j
    LEFT JOIN clients c ON j.client_id = c.id
    LEFT JOIN technicians t ON j.technician_id = t.id
  `;
  const params = [];

  if (req.query.status) {
    const statuses = req.query.status.split(',');
    query += ` WHERE j.status IN (${statuses.map(() => '?').join(',')})`;
    params.push(...statuses);
  } else if (techId) {
    query += ` WHERE j.technician_id = ?`;
    params.push(techId);
  }

  query += ' ORDER BY j.updated_at DESC';
  const jobs = db.prepare(query).all(...params);
  res.json(jobs);
});

app.get('/api/jobs/:id', authMiddleware, (req, res) => {
  const job = db.prepare(`
    SELECT j.*, c.name as client_name, t.name as technician_name, t.email as technician_email
    FROM jobs j
    LEFT JOIN clients c ON j.client_id = c.id
    LEFT JOIN technicians t ON j.technician_id = t.id
    WHERE j.id = ?
  `).get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json(job);
});

app.post('/api/jobs', authMiddleware, (req, res) => {
  const { title, description, client_id, technician_id, status, priority, scheduled_date, due_date, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  const result = db.prepare(`
    INSERT INTO jobs (title, description, client_id, technician_id, status, priority, scheduled_date, due_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title, description || null,
    client_id || null, technician_id || null,
    status || 'upcoming', priority || 'normal',
    scheduled_date || null, due_date || null, notes || null
  );
  res.json({ id: result.lastInsertRowid, title });
});

app.put('/api/jobs/:id', authMiddleware, (req, res) => {
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });

  const { title, description, client_id, technician_id, status, priority, scheduled_date, due_date, notes } = req.body;
  const updates = []; const params = [];
  if (title) { updates.push('title = ?'); params.push(title); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (client_id !== undefined) { updates.push('client_id = ?'); params.push(client_id); }
  if (technician_id !== undefined) { updates.push('technician_id = ?'); params.push(technician_id); }
  if (status) { updates.push('status = ?'); params.push(status); }
  if (priority) { updates.push('priority = ?'); params.push(priority); }
  if (scheduled_date !== undefined) { updates.push('scheduled_date = ?'); params.push(scheduled_date); }
  if (due_date !== undefined) { updates.push('due_date = ?'); params.push(due_date); }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
  updates.push("updated_at = datetime('now')");

  if (updates.length > 1) {
    params.push(req.params.id);
    db.prepare(`UPDATE jobs SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  res.json({ message: 'Updated' });
});

app.delete('/api/jobs/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// --- Dashboard endpoint ---
app.get('/api/dashboard', authMiddleware, (req, res) => {
  const techId = req.user.role === 'tech' ? req.user.id : null;

  let whereClause = '';
  const params = [];
  if (techId) {
    whereClause = 'WHERE j.technician_id = ?';
    params.push(techId);
  }

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN j.status = 'ongoing' THEN 1 ELSE 0 END) as ongoing,
      SUM(CASE WHEN j.status = 'upcoming' THEN 1 ELSE 0 END) as upcoming,
      SUM(CASE WHEN j.status = 'outstanding' THEN 1 ELSE 0 END) as outstanding,
      SUM(CASE WHEN j.status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM jobs j ${whereClause}
  `).get(...params);

  const jobs = db.prepare(`
    SELECT j.id, j.title, j.status, j.priority, j.scheduled_date, j.due_date,
           c.name as client_name, t.name as technician_name, t.email as technician_email
    FROM jobs j
    LEFT JOIN clients c ON j.client_id = c.id
    LEFT JOIN technicians t ON j.technician_id = t.id
    ${whereClause ? whereClause + ' AND' : 'WHERE'} j.status IN ('ongoing', 'upcoming', 'outstanding')
    ORDER BY j.updated_at DESC
  `).all(...params);

  res.json({ stats, jobs });
});

// --- Serve static frontend ---
const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
  });
}

// --- Start ---
app.listen(PORT, () => {
  console.log(`Job Platform API running on http://localhost:${PORT}`);
});