require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// --- Setup ---
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const DB_PATH = process.env.DB_PATH || './data/jobs.db';

app.use(cors());
app.use(express.json());

// Ensure data dir
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

let db;

// Helper: load/save database
function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function dbGet(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function dbRun(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

function dbExec(sql) {
  db.exec(sql);
  saveDb();
}

function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function getLastId() {
  const row = dbGet('SELECT last_insert_rowid() as id');
  return row ? row.id : null;
}

async function initDb() {
  const SQL = await initSqlJs();
  
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  dbExec(`
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
}

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
  const existing = dbGet("SELECT id FROM technicians WHERE role = 'admin'");
  if (existing) return res.json({ message: 'Already seeded' });

  const hash = await bcrypt.hash('admin123', 10);
  dbRun("INSERT INTO technicians (name, email, password, role, totp_enabled) VALUES (?, ?, ?, 'admin', 0)", 
    ['Admin', 'admin@platform.com', hash]);
  res.json({ message: 'Admin created — email: admin@platform.com, password: admin123' });
});

// Technician login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const tech = dbGet('SELECT * FROM technicians WHERE email = ? AND active = 1', [email]);
  if (!tech) return res.status(401).json({ error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, tech.password);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

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

    const tech = dbGet('SELECT * FROM technicians WHERE id = ?', [decoded.id]);
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

// Setup 2FA
app.post('/api/technicians/:id/setup-2fa', authMiddleware, adminOnly, async (req, res) => {
  const tech = dbGet('SELECT * FROM technicians WHERE id = ?', [req.params.id]);
  if (!tech) return res.status(404).json({ error: 'Technician not found' });

  const secret = speakeasy.generateSecret({ name: `JobPlatform:${tech.email}` });
  dbRun('UPDATE technicians SET totp_secret = ? WHERE id = ?', [secret.base32, tech.id]);

  const qr = await qrcode.toDataURL(secret.otpauth_url);
  res.json({ secret: secret.base32, qr });
});

// Enable 2FA
app.post('/api/technicians/:id/enable-2fa', authMiddleware, adminOnly, (req, res) => {
  const { code } = req.body;
  const tech = dbGet('SELECT * FROM technicians WHERE id = ?', [req.params.id]);
  if (!tech || !tech.totp_secret) return res.status(400).json({ error: '2FA not set up yet' });

  const verified = speakeasy.totp.verify({ secret: tech.totp_secret, encoding: 'base32', token: code, window: 1 });
  if (!verified) return res.status(400).json({ error: 'Invalid code' });

  dbRun('UPDATE technicians SET totp_enabled = 1 WHERE id = ?', [tech.id]);
  res.json({ message: '2FA enabled' });
});

// Disable 2FA
app.post('/api/technicians/:id/disable-2fa', authMiddleware, adminOnly, (req, res) => {
  dbRun('UPDATE technicians SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?', [req.params.id]);
  res.json({ message: '2FA disabled' });
});

// --- Technician CRUD ---
app.get('/api/technicians', authMiddleware, adminOnly, (req, res) => {
  const techs = dbAll('SELECT id, name, email, phone, totp_enabled, active, created_at FROM technicians ORDER BY name');
  res.json(techs);
});

app.post('/api/technicians', authMiddleware, adminOnly, async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required' });

  const exists = dbGet('SELECT id FROM technicians WHERE email = ?', [email]);
  if (exists) return res.status(400).json({ error: 'Email already exists' });

  const hash = await bcrypt.hash(password, 10);
  dbRun('INSERT INTO technicians (name, email, password, phone) VALUES (?, ?, ?, ?)', [name, email, hash, phone || null]);
  res.json({ id: getLastId(), name, email });
});

app.put('/api/technicians/:id', authMiddleware, adminOnly, async (req, res) => {
  const { name, email, password, phone, active } = req.body;
  const tech = dbGet('SELECT id FROM technicians WHERE id = ?', [req.params.id]);
  if (!tech) return res.status(404).json({ error: 'Not found' });

  const updates = []; const params = [];
  if (name) { updates.push('name = ?'); params.push(name); }
  if (email) { updates.push('email = ?'); params.push(email); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
  if (active !== undefined) { updates.push('active = ?'); params.push(active ? 1 : 0); }
  if (password) { const h = await bcrypt.hash(password, 10); updates.push('password = ?'); params.push(h); }
  if (updates.length) {
    params.push(req.params.id);
    dbRun(`UPDATE technicians SET ${updates.join(', ')} WHERE id = ?`, params);
  }
  res.json({ message: 'Updated' });
});

app.delete('/api/technicians/:id', authMiddleware, adminOnly, (req, res) => {
  dbRun('DELETE FROM technicians WHERE id = ? AND role IS NULL', [req.params.id]);
  res.json({ message: 'Deleted' });
});

// --- Client CRUD ---
app.get('/api/clients', authMiddleware, (req, res) => {
  res.json(dbAll('SELECT * FROM clients ORDER BY name'));
});

app.get('/api/clients/:id', authMiddleware, (req, res) => {
  const client = dbGet('SELECT * FROM clients WHERE id = ?', [req.params.id]);
  if (!client) return res.status(404).json({ error: 'Not found' });
  res.json(client);
});

app.post('/api/clients', authMiddleware, (req, res) => {
  const { name, email, phone, address, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  dbRun('INSERT INTO clients (name, email, phone, address, notes) VALUES (?, ?, ?, ?, ?)',
    [name, email || null, phone || null, address || null, notes || null]);
  res.json({ id: getLastId(), name });
});

app.put('/api/clients/:id', authMiddleware, (req, res) => {
  const { name, email, phone, address, notes } = req.body;
  const client = dbGet('SELECT id FROM clients WHERE id = ?', [req.params.id]);
  if (!client) return res.status(404).json({ error: 'Not found' });
  const updates = []; const params = [];
  if (name) { updates.push('name = ?'); params.push(name); }
  if (email !== undefined) { updates.push('email = ?'); params.push(email); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
  if (address !== undefined) { updates.push('address = ?'); params.push(address); }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
  if (updates.length) { params.push(req.params.id); dbRun(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`, params); }
  res.json({ message: 'Updated' });
});

app.delete('/api/clients/:id', authMiddleware, (req, res) => {
  dbRun('DELETE FROM clients WHERE id = ?', [req.params.id]);
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
  res.json(dbAll(query, params));
});

app.get('/api/jobs/:id', authMiddleware, (req, res) => {
  const job = dbGet(`
    SELECT j.*, c.name as client_name, t.name as technician_name, t.email as technician_email
    FROM jobs j
    LEFT JOIN clients c ON j.client_id = c.id
    LEFT JOIN technicians t ON j.technician_id = t.id
    WHERE j.id = ?
  `, [req.params.id]);
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json(job);
});

app.post('/api/jobs', authMiddleware, (req, res) => {
  const { title, description, client_id, technician_id, status, priority, scheduled_date, due_date, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  dbRun(`INSERT INTO jobs (title, description, client_id, technician_id, status, priority, scheduled_date, due_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, description || null, client_id || null, technician_id || null,
     status || 'upcoming', priority || 'normal', scheduled_date || null, due_date || null, notes || null]);
  res.json({ id: getLastId(), title });
});

app.put('/api/jobs/:id', authMiddleware, (req, res) => {
  const job = dbGet('SELECT id FROM jobs WHERE id = ?', [req.params.id]);
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
  if (updates.length > 1) { params.push(req.params.id); dbRun(`UPDATE jobs SET ${updates.join(', ')} WHERE id = ?`, params); }
  res.json({ message: 'Updated' });
});

app.delete('/api/jobs/:id', authMiddleware, (req, res) => {
  dbRun('DELETE FROM jobs WHERE id = ?', [req.params.id]);
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

  const stats = dbGet(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN j.status = 'ongoing' THEN 1 ELSE 0 END) as ongoing,
      SUM(CASE WHEN j.status = 'upcoming' THEN 1 ELSE 0 END) as upcoming,
      SUM(CASE WHEN j.status = 'outstanding' THEN 1 ELSE 0 END) as outstanding,
      SUM(CASE WHEN j.status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM jobs j ${whereClause}
  `, params) || { total: 0, ongoing: 0, upcoming: 0, outstanding: 0, completed: 0 };

  const jobs = dbAll(`
    SELECT j.id, j.title, j.status, j.priority, j.scheduled_date, j.due_date,
           c.name as client_name, t.name as technician_name, t.email as technician_email
    FROM jobs j
    LEFT JOIN clients c ON j.client_id = c.id
    LEFT JOIN technicians t ON j.technician_id = t.id
    ${whereClause ? whereClause + ' AND' : 'WHERE'} j.status IN ('ongoing', 'upcoming', 'outstanding')
    ORDER BY j.updated_at DESC
  `, params);

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
async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Job Platform API running on http://localhost:${PORT}`);
  });
}

start();