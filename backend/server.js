const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// ── DB ──────────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ── AI ──────────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

// ── Auth middleware ──────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-in-prod');
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── DB Init ──────────────────────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      productivity_score INT DEFAULT 70,
      streak INT DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      priority TEXT DEFAULT 'medium',
      due_date DATE,
      category TEXT DEFAULT 'General',
      done BOOLEAN DEFAULT FALSE,
      ai_score INT DEFAULT 50,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS goals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      target_date DATE,
      progress INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS habits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      streak INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS habit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      habit_id UUID REFERENCES habits(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      log_date DATE NOT NULL,
      done BOOLEAN DEFAULT TRUE,
      UNIQUE(habit_id, log_date)
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS focus_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
      task_title TEXT,
      duration_minutes INT DEFAULT 25,
      completed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('DB initialized');
}

// ── Auth Routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { email, name, password } = req.body;
  if (!email || !name || !password) return res.status(400).json({ error: 'All fields required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, name, password_hash) VALUES ($1,$2,$3) RETURNING id,email,name,productivity_score,streak',
      [email.toLowerCase(), name, hash]
    );
    const user = result.rows[0];
    // Seed default habits
    await pool.query(
      `INSERT INTO habits (user_id, name) VALUES ($1,'Exercise'),($1,'Read 20 min'),($1,'Morning review'),($1,'Hydrate 2L')`,
      [user.id]
    );
    // Seed sample tasks
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 7);
    await pool.query(
      `INSERT INTO tasks (user_id,title,priority,due_date,category,ai_score) VALUES
       ($1,'Complete onboarding setup','high',$2,'Setup',90),
       ($1,'Review welcome guide','medium',$3,'Learning',60)`,
      [user.id, tomorrow.toISOString().split('T')[0], nextWeek.toISOString().split('T')[0]]
    );
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'dev-secret-change-in-prod', { expiresIn: '30d' });
    res.json({ token, user });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    console.error(e);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'dev-secret-change-in-prod', { expiresIn: '30d' });
    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT id,email,name,productivity_score,streak,created_at FROM users WHERE id=$1',
    [req.user.id]
  );
  res.json(result.rows[0]);
});

// ── Tasks ────────────────────────────────────────────────────────────────────
app.get('/api/tasks', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM tasks WHERE user_id=$1 ORDER BY ai_score DESC, created_at DESC',
    [req.user.id]
  );
  res.json(result.rows);
});

app.post('/api/tasks', auth, async (req, res) => {
  const { title, priority, due_date, category, notes } = req.body;
  const scoreMap = { urgent: 90, high: 70, medium: 50, low: 25 };
  const base = scoreMap[priority] || 50;
  const ai_score = Math.min(99, base + Math.floor(Math.random() * 10));
  const result = await pool.query(
    'INSERT INTO tasks (user_id,title,priority,due_date,category,notes,ai_score) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [req.user.id, title, priority || 'medium', due_date || null, category || 'General', notes || null, ai_score]
  );
  res.json(result.rows[0]);
});

app.patch('/api/tasks/:id', auth, async (req, res) => {
  const { done, title, priority, due_date, category, notes } = req.body;
  const fields = [];
  const vals = [];
  let i = 1;
  if (done !== undefined) { fields.push(`done=$${i++}`); vals.push(done); if (done) { fields.push(`completed_at=$${i++}`); vals.push(new Date()); } }
  if (title) { fields.push(`title=$${i++}`); vals.push(title); }
  if (priority) { fields.push(`priority=$${i++}`); vals.push(priority); }
  if (due_date !== undefined) { fields.push(`due_date=$${i++}`); vals.push(due_date); }
  if (category) { fields.push(`category=$${i++}`); vals.push(category); }
  if (notes !== undefined) { fields.push(`notes=$${i++}`); vals.push(notes); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.params.id, req.user.id);
  const result = await pool.query(
    `UPDATE tasks SET ${fields.join(',')} WHERE id=$${i++} AND user_id=$${i} RETURNING *`,
    vals
  );
  res.json(result.rows[0]);
});

app.delete('/api/tasks/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM tasks WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// ── Goals ────────────────────────────────────────────────────────────────────
app.get('/api/goals', auth, async (req, res) => {
  const result = await pool.query('SELECT * FROM goals WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
  res.json(result.rows);
});

app.post('/api/goals', auth, async (req, res) => {
  const { title, description, target_date } = req.body;
  const result = await pool.query(
    'INSERT INTO goals (user_id,title,description,target_date) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user.id, title, description || null, target_date || null]
  );
  res.json(result.rows[0]);
});

app.patch('/api/goals/:id', auth, async (req, res) => {
  const { progress, title, description, target_date } = req.body;
  const result = await pool.query(
    'UPDATE goals SET progress=COALESCE($1,progress), title=COALESCE($2,title), description=COALESCE($3,description), target_date=COALESCE($4,target_date) WHERE id=$5 AND user_id=$6 RETURNING *',
    [progress, title, description, target_date, req.params.id, req.user.id]
  );
  res.json(result.rows[0]);
});

app.delete('/api/goals/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM goals WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// ── Habits ───────────────────────────────────────────────────────────────────
app.get('/api/habits', auth, async (req, res) => {
  const habits = await pool.query('SELECT * FROM habits WHERE user_id=$1 ORDER BY created_at', [req.user.id]);
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  const result = [];
  for (const h of habits.rows) {
    const logs = await pool.query(
      'SELECT log_date, done FROM habit_logs WHERE habit_id=$1 AND log_date = ANY($2::date[])',
      [h.id, days]
    );
    const logMap = {};
    logs.rows.forEach(l => { logMap[l.log_date.toISOString().split('T')[0]] = l.done; });
    result.push({ ...h, days: days.map(d => logMap[d] ? 1 : 0), day_labels: days });
  }
  res.json(result);
});

app.post('/api/habits', auth, async (req, res) => {
  const { name } = req.body;
  const result = await pool.query('INSERT INTO habits (user_id,name) VALUES ($1,$2) RETURNING *', [req.user.id, name]);
  res.json(result.rows[0]);
});

app.post('/api/habits/:id/log', auth, async (req, res) => {
  const { date, done } = req.body;
  await pool.query(
    'INSERT INTO habit_logs (habit_id,user_id,log_date,done) VALUES ($1,$2,$3,$4) ON CONFLICT (habit_id,log_date) DO UPDATE SET done=$4',
    [req.params.id, req.user.id, date, done !== false]
  );
  // Update streak
  const logs = await pool.query(
    'SELECT log_date FROM habit_logs WHERE habit_id=$1 AND done=true ORDER BY log_date DESC LIMIT 30',
    [req.params.id]
  );
  let streak = 0;
  const logDates = logs.rows.map(r => r.log_date.toISOString().split('T')[0]);
  const checkDate = new Date(); checkDate.setDate(checkDate.getDate() - 1);
  for (let i = 0; i < 30; i++) {
    const ds = checkDate.toISOString().split('T')[0];
    if (logDates.includes(ds)) { streak++; checkDate.setDate(checkDate.getDate() - 1); }
    else break;
  }
  await pool.query('UPDATE habits SET streak=$1 WHERE id=$2', [streak, req.params.id]);
  res.json({ ok: true, streak });
});

app.delete('/api/habits/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM habits WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// ── Focus Sessions ───────────────────────────────────────────────────────────
app.get('/api/focus/sessions', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM focus_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',
    [req.user.id]
  );
  res.json(result.rows);
});

app.post('/api/focus/sessions', auth, async (req, res) => {
  const { task_id, task_title, duration_minutes, completed } = req.body;
  const result = await pool.query(
    'INSERT INTO focus_sessions (user_id,task_id,task_title,duration_minutes,completed) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.user.id, task_id || null, task_title, duration_minutes || 25, completed || false]
  );
  if (completed) {
    await pool.query(
      'UPDATE users SET productivity_score=LEAST(100,productivity_score+1), streak=streak+1 WHERE id=$1',
      [req.user.id]
    );
  }
  res.json(result.rows[0]);
});

// ── AI Chat ──────────────────────────────────────────────────────────────────
app.post('/api/ai/chat', auth, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  try {
    const [tasksRes, goalsRes, habitsRes] = await Promise.all([
      pool.query('SELECT title,priority,due_date,ai_score,done FROM tasks WHERE user_id=$1 AND done=false ORDER BY ai_score DESC LIMIT 8', [req.user.id]),
      pool.query('SELECT title,progress FROM goals WHERE user_id=$1', [req.user.id]),
      pool.query('SELECT name,streak FROM habits WHERE user_id=$1', [req.user.id]),
    ]);
    const userRes = await pool.query('SELECT name,productivity_score,streak FROM users WHERE id=$1', [req.user.id]);
    const user = userRes.rows[0];

    const context = `
User: ${user.name} | Score: ${user.productivity_score}/100 | Streak: ${user.streak} days
Today: ${new Date().toDateString()}

Open tasks:
${tasksRes.rows.map(t => `- ${t.title} (${t.priority}, due ${t.due_date?.toISOString?.()?.split('T')[0] || 'none'}, AI score ${t.ai_score})`).join('\n') || 'None'}

Goals:
${goalsRes.rows.map(g => `- ${g.title}: ${g.progress}%`).join('\n') || 'None'}

Habits:
${habitsRes.rows.map(h => `- ${h.name}: ${h.streak} day streak`).join('\n') || 'None'}
    `.trim();

    // Save history
    await pool.query('INSERT INTO chat_history (user_id,role,content) VALUES ($1,$2,$3)', [req.user.id, 'user', message]);

    const historyRes = await pool.query(
      'SELECT role,content FROM chat_history WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10',
      [req.user.id]
    );
    const history = historyRes.rows.reverse();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: `You are FocusAI, an elite productivity companion. Be concise, warm, and deeply actionable. Max 150 words per reply. No markdown, plain text only. Use the user's real data to give personalized, specific advice. Today's context:\n\n${context}`,
      messages: history.map(h => ({ role: h.role, content: h.content })),
    });

    const reply = response.content[0].text;
    await pool.query('INSERT INTO chat_history (user_id,role,content) VALUES ($1,$2,$3)', [req.user.id, 'assistant', reply]);
    res.json({ reply });
  } catch (e) {
    console.error('AI error:', e);
    res.status(500).json({ error: 'AI unavailable', reply: 'Having trouble connecting to AI right now. Try again in a moment.' });
  }
});

// ── AI Smart Schedule ────────────────────────────────────────────────────────
app.post('/api/ai/schedule', auth, async (req, res) => {
  try {
    const tasksRes = await pool.query(
      'SELECT title,priority,due_date,ai_score FROM tasks WHERE user_id=$1 AND done=false ORDER BY ai_score DESC LIMIT 10',
      [req.user.id]
    );
    const prompt = `Create a realistic daily schedule for these tasks. Return ONLY valid JSON array (no markdown, no extra text):
[{"time":"9:00 AM","title":"Task name","type":"purple|teal|coral|gray|ai","duration":"X min","ai_note":"why"}]

Tasks: ${JSON.stringify(tasksRes.rows)}
Today: ${new Date().toDateString()}
Rules: Start at 8 AM, end at 6 PM, include breaks, put high-priority tasks in morning, add a focus buffer afternoon block.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    let schedule = [];
    try {
      const text = response.content[0].text.replace(/```json?|```/g, '').trim();
      schedule = JSON.parse(text);
    } catch {
      schedule = [
        { time: '8:00 AM', title: 'Morning review & planning', type: 'teal', duration: '20 min', ai_note: 'Set intentions' },
        { time: '9:00 AM', title: 'Deep work block — top priority task', type: 'purple', duration: '90 min', ai_note: 'Peak focus window' },
        { time: '10:30 AM', title: 'Short break', type: 'gray', duration: '15 min', ai_note: 'Recharge' },
        { time: '11:00 AM', title: 'Second priority task', type: 'purple', duration: '60 min', ai_note: 'Still high focus' },
        { time: '12:00 PM', title: 'Lunch break', type: 'gray', duration: '60 min', ai_note: 'Rest' },
        { time: '1:00 PM', title: 'Emails & communication', type: 'coral', duration: '30 min', ai_note: 'Low-energy task' },
        { time: '2:00 PM', title: 'Meetings & collaboration', type: 'teal', duration: '60 min', ai_note: 'Social tasks post-lunch' },
        { time: '3:00 PM', title: 'AI focus buffer (protected)', type: 'ai', duration: '60 min', ai_note: 'Overflow or deep thinking' },
        { time: '4:00 PM', title: 'Admin & miscellaneous', type: 'gray', duration: '45 min', ai_note: 'Wind down' },
        { time: '5:00 PM', title: 'Daily shutdown review', type: 'teal', duration: '15 min', ai_note: 'Close loops' },
      ];
    }
    res.json(schedule);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Schedule generation failed' });
  }
});

// ── AI Task Suggest ──────────────────────────────────────────────────────────
app.post('/api/ai/suggest-task', auth, async (req, res) => {
  try {
    const goalsRes = await pool.query('SELECT title,progress FROM goals WHERE user_id=$1', [req.user.id]);
    const tasksRes = await pool.query('SELECT title FROM tasks WHERE user_id=$1 AND done=false LIMIT 5', [req.user.id]);
    const prompt = `Suggest 3 specific, actionable tasks for a productive professional.
Their goals: ${goalsRes.rows.map(g => g.title).join(', ') || 'Not set'}
Their open tasks: ${tasksRes.rows.map(t => t.title).join(', ') || 'None'}
Return ONLY valid JSON (no markdown): [{"title":"...","priority":"medium","category":"..."}]`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text.replace(/```json?|```/g, '').trim();
    const suggestions = JSON.parse(text);
    res.json(suggestions);
  } catch (e) {
    res.json([
      { title: 'Review weekly priorities', priority: 'high', category: 'Planning' },
      { title: 'Follow up with key stakeholders', priority: 'medium', category: 'Communication' },
      { title: 'Document progress on current project', priority: 'medium', category: 'Documentation' },
    ]);
  }
});

// ── Dashboard Summary ────────────────────────────────────────────────────────
app.get('/api/dashboard', auth, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const [tasks, goals, user, sessions] = await Promise.all([
    pool.query('SELECT * FROM tasks WHERE user_id=$1 ORDER BY ai_score DESC', [req.user.id]),
    pool.query('SELECT * FROM goals WHERE user_id=$1', [req.user.id]),
    pool.query('SELECT id,name,email,productivity_score,streak,created_at FROM users WHERE id=$1', [req.user.id]),
    pool.query('SELECT count(*) FROM focus_sessions WHERE user_id=$1 AND completed=true', [req.user.id]),
  ]);
  const openTasks = tasks.rows.filter(t => !t.done);
  const todayTasks = tasks.rows.filter(t => t.due_date?.toISOString?.()?.startsWith(today) && !t.done);
  const overdueTasks = tasks.rows.filter(t => t.due_date && new Date(t.due_date) < new Date() && !t.done);

  res.json({
    user: user.rows[0],
    stats: {
      open: openTasks.length,
      today: todayTasks.length,
      overdue: overdueTasks.length,
      goals: goals.rows.length,
      sessions: parseInt(sessions.rows[0].count),
    },
    urgent: tasks.rows.filter(t => !t.done && (t.priority === 'urgent' || t.priority === 'high')).slice(0, 5),
    goals: goals.rows,
  });
});

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Serve frontend ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// ── Start ────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`FocusAI running on :${PORT}`));
}).catch(e => { console.error('DB init failed:', e); process.exit(1); });
