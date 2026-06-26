import React, { useState, useEffect, useRef, useCallback } from 'react';

const API = '/api';
const token = () => localStorage.getItem('focusai_token');
const hdr = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

async function api(path, opts = {}) {
  const res = await fetch(API + path, { headers: hdr(), ...opts });
  if (res.status === 401) { localStorage.removeItem('focusai_token'); window.location.reload(); }
  return res.json();
}

// ── Styles ──────────────────────────────────────────────────────────────────
const S = {
  app: { display: 'flex', height: '100vh', overflow: 'hidden' },
  sidebar: { width: 220, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  sideHead: { padding: '20px 16px 12px', borderBottom: '1px solid var(--border)' },
  sideTitle: { fontWeight: 700, fontSize: 16, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8 },
  sideUser: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  nav: { flex: 1, padding: '8px 8px', overflowY: 'auto' },
  navSection: { fontSize: 10, color: 'var(--text-faint)', padding: '12px 8px 4px', letterSpacing: '0.08em', textTransform: 'uppercase' },
  navItem: (active) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
    borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13,
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    background: active ? 'var(--accent-light)' : 'transparent',
    fontWeight: active ? 600 : 400, border: 'none', width: '100%', textAlign: 'left',
    transition: 'all 0.12s',
  }),
  main: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  topbar: { height: 52, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', flexShrink: 0 },
  content: { flex: 1, overflowY: 'auto', padding: 20 },
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px', marginBottom: 14, boxShadow: 'var(--shadow)' },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 14 },
  metricCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', boxShadow: 'var(--shadow)' },
  btnPrimary: { padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, transition: 'opacity 0.12s' },
  btnSm: { padding: '5px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, transition: 'all 0.12s' },
  aiPanel: { background: 'var(--accent-light)', border: '1px solid var(--accent-mid)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 14 },
  badge: (p) => {
    const map = { urgent: ['#FEE2E2','#991B1B'], high: ['#FEF3C7','#92400E'], medium: ['#DBEAFE','#1E40AF'], low: ['#D1FAE5','#065F46'], done: ['#F3F4F6','#6B7280'] };
    const [bg, col] = map[p] || map.medium;
    return { background: bg, color: col, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 };
  },
  input: { width: '100%', padding: '9px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text)', outline: 'none', fontSize: 14 },
  focusBlock: { background: 'linear-gradient(135deg,var(--accent) 0%,#7B5EA7 100%)', color: '#fff', borderRadius: 'var(--radius)', padding: 28, textAlign: 'center', marginBottom: 14 },
};

// ── Priority badge ───────────────────────────────────────────────────────────
function Badge({ p }) {
  return <span style={S.badge(p)}>{p?.charAt(0)?.toUpperCase() + p?.slice(1)}</span>;
}

// ── Relative due date ────────────────────────────────────────────────────────
function DueDate({ date }) {
  if (!date) return null;
  const d = new Date(date + 'T12:00:00');
  const diff = Math.ceil((d - new Date().setHours(0,0,0,0)) / 86400000);
  if (diff < 0) return <span style={{ color: '#991B1B', fontSize: 12 }}>Overdue {Math.abs(diff)}d</span>;
  if (diff === 0) return <span style={{ color: '#991B1B', fontSize: 12 }}>Due today</span>;
  if (diff === 1) return <span style={{ color: '#92400E', fontSize: 12 }}>Due tomorrow</span>;
  return <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>Due in {diff}d</span>;
}

// ── Auth Page ────────────────────────────────────────────────────────────────
function AuthPage({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setErr('');
    try {
      const res = await fetch(`${API}/auth/${mode}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem('focusai_token', data.token);
      onAuth(data.user);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#EEEDFE 0%,#f8f8fc 60%)' }}>
      <div style={{ width: 380, background: 'var(--surface)', borderRadius: 16, padding: 36, boxShadow: '0 8px 40px rgba(83,74,183,0.15)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🧠</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>FocusAI</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Your AI productivity companion</div>
        </div>

        <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, padding: 3, marginBottom: 22 }}>
          {['login','register'].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: '7px 0', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13, background: mode === m ? 'var(--accent)' : 'transparent', color: mode === m ? '#fff' : 'var(--text-muted)', transition: 'all 0.15s' }}>
              {m === 'login' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          {mode === 'register' && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Your name</label>
              <input style={S.input} placeholder="Alex Johnson" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Email</label>
            <input style={S.input} type="email" placeholder="you@company.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Password</label>
            <input style={S.input} type="password" placeholder="••••••••" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
          </div>
          {err && <div style={{ color: '#991B1B', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: '#FEE2E2', borderRadius: 6 }}>{err}</div>}
          <button type="submit" style={{ ...S.btnPrimary, width: '100%', justifyContent: 'center', padding: '11px', fontSize: 14, opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        {mode === 'login' && (
          <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--accent-light)', borderRadius: 8, fontSize: 12, color: 'var(--accent-dark)' }}>
            <strong>Demo:</strong> demo@focusai.app / demo1234
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ user, setPanel }) {
  const [data, setData] = useState(null);
  const [insight, setInsight] = useState('');

  useEffect(() => {
    api('/dashboard').then(setData);
    api('/ai/chat', { method: 'POST', body: JSON.stringify({ message: 'Give me a single sharp productivity insight based on my tasks and goals. 2 sentences max.' }) })
      .then(r => setInsight(r.reply || ''));
  }, []);

  if (!data) return <div style={{ color: 'var(--text-muted)', padding: 20 }}>Loading dashboard…</div>;

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {data.user?.name?.split(' ')[0]} 👋</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 3 }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      <div style={S.metrics}>
        {[
          { label: 'Open tasks', value: data.stats.open, sub: `${data.stats.today} due today`, icon: 'ti-checkbox' },
          { label: 'Overdue', value: data.stats.overdue, sub: 'need attention', icon: 'ti-alert-triangle', alert: data.stats.overdue > 0 },
          { label: 'AI score', value: `${data.user?.productivity_score}/100`, sub: 'focus efficiency', icon: 'ti-brain' },
          { label: 'Streak', value: `🔥 ${data.user?.streak}d`, sub: 'days productive', icon: 'ti-bolt' },
        ].map(m => (
          <div key={m.label} style={{ ...S.metricCard, borderColor: m.alert ? '#FCA5A5' : 'var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className={`ti ${m.icon}`} style={{ fontSize: 14, color: m.alert ? '#991B1B' : 'var(--accent)' }} />
              {m.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: m.alert ? '#991B1B' : 'var(--text)' }}>{m.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {insight && (
        <div style={S.aiPanel}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
            <i className="ti ti-sparkles" /> AI insight
          </div>
          <p style={{ fontSize: 13, color: 'var(--accent-dark)', lineHeight: 1.6, marginBottom: 10 }}>{insight}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setPanel('schedule')} style={{ padding: '5px 12px', background: '#fff', border: '1px solid var(--accent-mid)', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>View schedule ↗</button>
            <button onClick={() => setPanel('assistant')} style={{ padding: '5px 12px', background: '#fff', border: '1px solid var(--accent-mid)', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>Ask AI ↗</button>
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontWeight: 600 }}>Urgent tasks</span>
          <button style={S.btnSm} onClick={() => setPanel('tasks')}>View all</button>
        </div>
        {data.urgent.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', fontSize: 13 }}>🎉 All caught up!</div>
        ) : data.urgent.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
            <i className="ti ti-checkbox" style={{ color: 'var(--accent)', fontSize: 16 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 2, alignItems: 'center' }}>
                <Badge p={t.priority} />
                <DueDate date={t.due_date?.split('T')[0]} />
              </div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', minWidth: 28, textAlign: 'right' }}>{t.ai_score}</span>
          </div>
        ))}
      </div>

      {data.goals.length > 0 && (
        <div style={S.card}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Goals progress</div>
          {data.goals.map(g => (
            <div key={g.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 500 }}>{g.title}</span>
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{g.progress}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${g.progress}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.4s' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tasks Panel ──────────────────────────────────────────────────────────────
function TasksPanel() {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [form, setForm] = useState({ title: '', priority: 'medium', due_date: '', category: '', notes: '' });

  useEffect(() => { api('/tasks').then(setTasks); }, []);

  async function addTask(e) {
    e.preventDefault();
    const t = await api('/tasks', { method: 'POST', body: JSON.stringify(form) });
    setTasks(prev => [t, ...prev]);
    setForm({ title: '', priority: 'medium', due_date: '', category: '', notes: '' });
    setShowForm(false);
  }

  async function toggleDone(t) {
    const updated = await api(`/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ done: !t.done }) });
    setTasks(prev => prev.map(x => x.id === t.id ? updated : x));
  }

  async function deleteTask(id) {
    await api(`/tasks/${id}`, { method: 'DELETE' });
    setTasks(prev => prev.filter(x => x.id !== id));
  }

  async function getSuggestions() {
    setLoadingSuggest(true);
    const s = await api('/ai/suggest-task', { method: 'POST', body: JSON.stringify({}) });
    setSuggestions(s || []);
    setLoadingSuggest(false);
  }

  async function addSuggested(s) {
    const t = await api('/tasks', { method: 'POST', body: JSON.stringify(s) });
    setTasks(prev => [t, ...prev]);
    setSuggestions(prev => prev.filter(x => x.title !== s.title));
  }

  const filtered = tasks.filter(t => {
    if (filter === 'all') return true;
    if (filter === 'pending') return !t.done;
    if (filter === 'done') return t.done;
    return t.priority === filter && !t.done;
  }).sort((a, b) => (a.done === b.done ? b.ai_score - a.ai_score : a.done ? 1 : -1));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontWeight: 700, fontSize: 18 }}>Tasks</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={getSuggestions} style={{ ...S.btnSm, borderColor: 'var(--accent-mid)', color: 'var(--accent)' }} disabled={loadingSuggest}>
            <i className="ti ti-sparkles" /> {loadingSuggest ? 'Thinking…' : 'AI suggest'}
          </button>
          <button onClick={() => setShowForm(!showForm)} style={S.btnPrimary}>
            <i className="ti ti-plus" /> Add task
          </button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div style={S.aiPanel}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 10 }}><i className="ti ti-sparkles" /> AI task suggestions</div>
          {suggestions.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--accent-mid)' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent-dark)' }}>{s.title}</span>
                <span style={{ marginLeft: 8 }}><Badge p={s.priority} /></span>
              </div>
              <button onClick={() => addSuggested(s)} style={{ ...S.btnSm, borderColor: 'var(--accent-mid)', color: 'var(--accent)', fontSize: 11 }}>Add ↗</button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ ...S.card, borderColor: 'var(--accent-mid)', background: 'var(--accent-light)' }}>
          <form onSubmit={addTask}>
            <input style={{ ...S.input, marginBottom: 10 }} placeholder="Task title…" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
              <select style={S.input} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                <option value="urgent">🔴 Urgent</option>
                <option value="high">🟠 High</option>
                <option value="medium">🔵 Medium</option>
                <option value="low">🟢 Low</option>
              </select>
              <input style={S.input} type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              <input style={S.input} placeholder="Category…" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            </div>
            <textarea style={{ ...S.input, resize: 'vertical', height: 56, marginBottom: 10 }} placeholder="Notes (optional)…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={S.btnPrimary}>Add task</button>
              <button type="button" onClick={() => setShowForm(false)} style={S.btnSm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['all','All'],['pending','Pending'],['urgent','🔴 Urgent'],['high','🟠 High'],['done','Done']].map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)} style={{ ...S.btnSm, background: filter === f ? 'var(--accent-light)' : 'transparent', color: filter === f ? 'var(--accent)' : 'var(--text-muted)', borderColor: filter === f ? 'var(--accent-mid)' : 'var(--border)' }}>{label}</button>
        ))}
      </div>

      <div style={S.card}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0', fontSize: 13 }}>No tasks here. Add one above!</div>
        ) : filtered.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div onClick={() => toggleDone(t)} style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${t.done ? 'var(--accent)' : 'var(--border-strong)'}`, background: t.done ? 'var(--accent)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
              {t.done && <i className="ti ti-check" style={{ color: '#fff', fontSize: 12 }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 13, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--text-faint)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center' }}>
                {!t.done && <Badge p={t.priority} />}
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t.category}</span>
                <DueDate date={t.due_date?.split?.('T')[0]} />
              </div>
              {t.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{t.notes}</div>}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', minWidth: 24, textAlign: 'right' }}>{t.ai_score}</span>
            <button onClick={() => deleteTask(t.id)} style={{ ...S.btnSm, padding: '4px 8px', borderColor: 'transparent', color: 'var(--text-faint)' }}>
              <i className="ti ti-trash" style={{ fontSize: 13 }} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Schedule Panel ───────────────────────────────────────────────────────────
function SchedulePanel() {
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/ai/schedule', { method: 'POST', body: JSON.stringify({}) }).then(s => {
      setSchedule(Array.isArray(s) ? s : []);
      setLoading(false);
    });
  }, []);

  const colors = { purple: ['#EEEDFE','#3C3489','#534AB7'], teal: ['#E1F5EE','#085041','#1D9E75'], coral: ['#FAECE7','#993C1D','#D85A30'], gray: ['#F4F3FA','#6b6b8a','#a0a0b8'], ai: ['#FEF3C7','#92400E','#D97706'] };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontWeight: 700, fontSize: 18 }}>AI-powered schedule</h2>
        <button onClick={() => { setLoading(true); api('/ai/schedule', { method: 'POST', body: JSON.stringify({}) }).then(s => { setSchedule(Array.isArray(s) ? s : []); setLoading(false); }); }} style={{ ...S.btnSm, color: 'var(--accent)', borderColor: 'var(--accent-mid)' }}>
          <i className="ti ti-refresh" /> Regenerate
        </button>
      </div>

      <div style={S.aiPanel}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 6 }}><i className="ti ti-sparkles" /> Schedule intelligence</div>
        <p style={{ fontSize: 13, color: 'var(--accent-dark)', lineHeight: 1.6 }}>Your schedule is AI-generated based on task priorities and cognitive load patterns. Deep work is front-loaded in the morning. A protected buffer block is reserved for overflow.</p>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>AI is building your optimal schedule…</div>
      ) : (
        <div style={S.card}>
          {schedule.map((s, i) => {
            const [bg, text, border] = colors[s.type] || colors.gray;
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 0, alignItems: 'start' }}>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '12px 12px 12px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none', textAlign: 'right', paddingTop: i === 0 ? 4 : 12 }}>{s.time}</div>
                <div style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', padding: '8px 0 8px 12px' }}>
                  <div style={{ background: bg, borderLeft: `3px solid ${border}`, borderRadius: 6, padding: '8px 12px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: text, opacity: 0.75, marginTop: 2 }}>{s.duration} {s.ai_note ? `· ${s.ai_note}` : ''}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Focus Panel ──────────────────────────────────────────────────────────────
function FocusPanel() {
  const [tasks, setTasks] = useState([]);
  const [taskIdx, setTaskIdx] = useState(0);
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState([]);
  const interval = useRef(null);

  useEffect(() => {
    api('/tasks').then(t => setTasks(t.filter(x => !x.done).sort((a,b) => b.ai_score - a.ai_score)));
    api('/focus/sessions').then(setSessions);
  }, []);

  useEffect(() => {
    if (running) {
      interval.current = setInterval(() => {
        setSeconds(s => {
          if (s <= 1) {
            clearInterval(interval.current);
            setRunning(false);
            completeSession();
            return 25 * 60;
          }
          return s - 1;
        });
      }, 1000);
    } else clearInterval(interval.current);
    return () => clearInterval(interval.current);
  }, [running]);

  async function completeSession() {
    const task = tasks[taskIdx];
    if (!task) return;
    const s = await api('/focus/sessions', { method: 'POST', body: JSON.stringify({ task_id: task.id, task_title: task.title, duration_minutes: 25, completed: true }) });
    setSessions(prev => [s, ...prev]);
  }

  function skip() { setTaskIdx(i => i + 1); setSeconds(25 * 60); setRunning(false); }

  const task = tasks[taskIdx];
  const m = Math.floor(seconds / 60);
  const s2 = seconds % 60;

  return (
    <div>
      <h2 style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>Focus mode</h2>
      <div style={S.focusBlock}>
        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 4 }}>Now working on</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{task?.title || 'No tasks — add some!'}</div>
        {task && <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 20 }}>{task.category} · {task.priority} priority · AI score {task.ai_score}</div>}
        <div style={{ fontSize: 52, fontWeight: 300, letterSpacing: 4, marginBottom: 20, fontVariantNumeric: 'tabular-nums' }}>{String(m).padStart(2,'0')}:{String(s2).padStart(2,'0')}</div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={() => setRunning(r => !r)} style={{ padding: '10px 24px', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, backdropFilter: 'blur(4px)' }}>
            <i className={`ti ti-player-${running ? 'pause' : 'play'}`} /> {running ? 'Pause' : 'Start session'}
          </button>
          {task && <button onClick={skip} style={{ padding: '10px 18px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13 }}>Skip task</button>}
        </div>
      </div>

      <div style={S.card}>
        <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Session history</div>
        {sessions.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>No sessions yet. Start your first one!</div>
        ) : sessions.slice(0, 10).map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <i className={`ti ti-${s.completed ? 'check-circle' : 'circle-dashed'}`} style={{ color: s.completed ? '#065F46' : 'var(--text-faint)', fontSize: 16 }} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{s.task_title} — {s.duration_minutes} min</span>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{new Date(s.created_at).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Goals Panel ──────────────────────────────────────────────────────────────
function GoalsPanel() {
  const [goals, setGoals] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', target_date: '' });

  useEffect(() => { api('/goals').then(setGoals); }, []);

  async function addGoal(e) {
    e.preventDefault();
    const g = await api('/goals', { method: 'POST', body: JSON.stringify(form) });
    setGoals(prev => [g, ...prev]);
    setForm({ title: '', description: '', target_date: '' });
    setShowForm(false);
  }

  async function updateProgress(g, delta) {
    const progress = Math.min(100, Math.max(0, g.progress + delta));
    const updated = await api(`/goals/${g.id}`, { method: 'PATCH', body: JSON.stringify({ progress }) });
    setGoals(prev => prev.map(x => x.id === g.id ? updated : x));
  }

  async function deleteGoal(id) {
    await api(`/goals/${id}`, { method: 'DELETE' });
    setGoals(prev => prev.filter(x => x.id !== id));
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontWeight: 700, fontSize: 18 }}>Goals</h2>
        <button onClick={() => setShowForm(!showForm)} style={S.btnPrimary}><i className="ti ti-plus" /> Add goal</button>
      </div>

      {showForm && (
        <div style={{ ...S.card, borderColor: 'var(--accent-mid)', background: 'var(--accent-light)' }}>
          <form onSubmit={addGoal}>
            <input style={{ ...S.input, marginBottom: 8 }} placeholder="Goal title…" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
            <input style={{ ...S.input, marginBottom: 8 }} placeholder="Description (optional)…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <input style={{ ...S.input, marginBottom: 10 }} type="date" value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={S.btnPrimary}>Add goal</button>
              <button type="button" onClick={() => setShowForm(false)} style={S.btnSm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {goals.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
          <i className="ti ti-target" style={{ fontSize: 32, marginBottom: 8, display: 'block' }} />
          No goals yet. Add your first one!
        </div>
      ) : goals.map(g => (
        <div key={g.id} style={S.card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{g.title}</div>
              {g.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{g.description}</div>}
              {g.target_date && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>Target: {new Date(g.target_date + 'T12:00:00').toLocaleDateString()}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{g.progress}%</span>
              <button onClick={() => deleteGoal(g.id)} style={{ ...S.btnSm, padding: '4px 8px', color: 'var(--text-faint)' }}><i className="ti ti-trash" style={{ fontSize: 13 }} /></button>
            </div>
          </div>
          <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ height: '100%', width: `${g.progress}%`, background: g.progress >= 70 ? '#1D9E75' : g.progress >= 40 ? 'var(--accent)' : '#D85A30', borderRadius: 4, transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => updateProgress(g, -10)} style={S.btnSm}>-10%</button>
            <button onClick={() => updateProgress(g, 5)} style={{ ...S.btnSm, color: 'var(--accent)', borderColor: 'var(--accent-mid)' }}>+5%</button>
            <button onClick={() => updateProgress(g, 10)} style={{ ...S.btnSm, color: 'var(--accent)', borderColor: 'var(--accent-mid)' }}>+10%</button>
            <button onClick={() => updateProgress(g, 100 - g.progress)} style={{ ...S.btnSm, color: '#065F46', borderColor: '#9FE1CB' }}>Complete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Habits Panel ─────────────────────────────────────────────────────────────
function HabitsPanel() {
  const [habits, setHabits] = useState([]);
  const [newHabit, setNewHabit] = useState('');

  useEffect(() => { api('/habits').then(setHabits); }, []);

  async function addHabit(e) {
    e.preventDefault();
    if (!newHabit.trim()) return;
    await api('/habits', { method: 'POST', body: JSON.stringify({ name: newHabit.trim() }) });
    setNewHabit('');
    api('/habits').then(setHabits);
  }

  async function toggleHabit(habit, dayIdx) {
    const date = habit.day_labels[dayIdx];
    const done = !habit.days[dayIdx];
    await api(`/habits/${habit.id}/log`, { method: 'POST', body: JSON.stringify({ date, done }) });
    api('/habits').then(setHabits);
  }

  async function deleteHabit(id) {
    await api(`/habits/${id}`, { method: 'DELETE' });
    setHabits(prev => prev.filter(h => h.id !== id));
  }

  const dayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  return (
    <div>
      <h2 style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>Habit tracker</h2>
      <div style={S.card}>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: 8, alignItems: 'center', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
          <div />
          <div style={{ display: 'flex', gap: 4 }}>
            {dayLabels.map(d => <span key={d} style={{ width: 28, textAlign: 'center', fontSize: 11, color: 'var(--text-faint)' }}>{d}</span>)}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', width: 44 }}>Streak</span>
        </div>

        {habits.map(h => (
          <div key={h.id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {(h.days || []).map((d, i) => (
                <div key={i} onClick={() => toggleHabit(h, i)} style={{ width: 28, height: 28, borderRadius: '50%', background: d ? 'var(--accent)' : 'var(--surface2)', border: i === 6 ? '2px solid var(--accent)' : '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                  {d ? <i className="ti ti-check" style={{ color: '#fff', fontSize: 12 }} /> : null}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', width: 36, textAlign: 'center' }}>🔥{h.streak}</span>
              <button onClick={() => deleteHabit(h.id)} style={{ ...S.btnSm, padding: '3px 6px', color: 'var(--text-faint)' }}><i className="ti ti-x" style={{ fontSize: 11 }} /></button>
            </div>
          </div>
        ))}

        <form onSubmit={addHabit} style={{ display: 'flex', gap: 8, marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <input style={{ ...S.input, flex: 1 }} placeholder="New habit name…" value={newHabit} onChange={e => setNewHabit(e.target.value)} />
          <button type="submit" style={S.btnPrimary}><i className="ti ti-plus" /> Add</button>
        </form>
      </div>
    </div>
  );
}

// ── AI Assistant Panel ───────────────────────────────────────────────────────
function AssistantPanel({ initialMessage }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I\'m your AI productivity companion. I can help you plan your day, prioritize tasks, break down goals, or think through what to tackle next. What\'s on your mind?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const sentRef = useRef(false);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (initialMessage && !sentRef.current) {
      sentRef.current = true;
      setInput(initialMessage);
      setTimeout(() => sendMsg(initialMessage), 100);
    }
  }, [initialMessage]);

  async function sendMsg(text) {
    const msg = text || input.trim();
    if (!msg) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    const res = await api('/ai/chat', { method: 'POST', body: JSON.stringify({ message: msg }) });
    setMessages(prev => [...prev, { role: 'assistant', content: res.reply || 'Something went wrong.' }]);
    setLoading(false);
  }

  const quickPrompts = [
    'What should I work on right now?',
    'Plan my ideal tomorrow',
    'What tasks are at deadline risk?',
    'Give me a focus tip for today',
    'How can I improve my productivity?',
  ];

  return (
    <div>
      <h2 style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>AI assistant</h2>
      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        <div style={{ height: 380, overflowY: 'auto', padding: '16px 16px 8px' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 14, flexDirection: m.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: m.role === 'assistant' ? 'var(--accent-light)' : 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className={`ti ti-${m.role === 'assistant' ? 'robot' : 'user'}`} style={{ fontSize: 14, color: m.role === 'assistant' ? 'var(--accent)' : 'var(--text-muted)' }} />
              </div>
              <div style={{ maxWidth: '82%', padding: '10px 14px', borderRadius: m.role === 'assistant' ? '4px 12px 12px 12px' : '12px 4px 12px 12px', background: m.role === 'assistant' ? 'var(--accent-light)' : 'var(--accent)', color: m.role === 'assistant' ? 'var(--accent-dark)' : '#fff', fontSize: 13, lineHeight: 1.65 }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-robot" style={{ fontSize: 14, color: 'var(--accent)' }} />
              </div>
              <div style={{ padding: '12px 16px', background: 'var(--accent-light)', borderRadius: '4px 12px 12px 12px' }}>
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  {[0,1,2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-mid)', animation: `bounce 1s ${i * 0.15}s infinite` }} />)}
                </span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', gap: 8 }}>
          <input style={{ ...S.input, flex: 1 }} placeholder="Ask me anything…" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMsg()} />
          <button onClick={() => sendMsg()} style={S.btnPrimary} disabled={loading}><i className="ti ti-send" /></button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {quickPrompts.map(p => (
          <button key={p} onClick={() => { setInput(p); setTimeout(() => sendMsg(p), 50); }} style={{ ...S.btnSm, fontSize: 12, borderColor: 'var(--accent-mid)', color: 'var(--accent)' }}>{p} ↗</button>
        ))}
      </div>
      <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-4px)}}`}</style>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [panel, setPanel] = useState('dashboard');
  const [aiMsg, setAiMsg] = useState('');
  const [voiceActive, setVoiceActive] = useState(false);

  useEffect(() => {
    if (token()) {
      api('/auth/me').then(u => { if (u?.id) setUser(u); }).catch(() => {});
    }
  }, []);

  function openAI(msg) { setAiMsg(msg); setPanel('assistant'); }

  function toggleVoice() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      openAI('What should I focus on right now?'); return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.start();
    setVoiceActive(true);
    rec.onresult = (e) => { openAI(e.results[0][0].transcript); setVoiceActive(false); };
    rec.onerror = () => { setVoiceActive(false); openAI('Help me plan my day'); };
    rec.onend = () => setVoiceActive(false);
  }

  function logout() { localStorage.removeItem('focusai_token'); setUser(null); }

  if (!user) return <AuthPage onAuth={setUser} />;

  const navItems = [
    { id: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard' },
    { id: 'tasks', icon: 'ti-checkbox', label: 'Tasks' },
    { id: 'schedule', icon: 'ti-calendar', label: 'Schedule' },
    { id: 'focus', icon: 'ti-bolt', label: 'Focus mode' },
    { id: 'goals', icon: 'ti-target', label: 'Goals' },
    { id: 'habits', icon: 'ti-repeat', label: 'Habits' },
    { id: 'assistant', icon: 'ti-robot', label: 'AI assistant' },
  ];

  return (
    <div style={S.app}>
      <div style={S.sidebar}>
        <div style={S.sideHead}>
          <div style={S.sideTitle}><span style={{ fontSize: 20 }}>🧠</span> FocusAI</div>
          <div style={S.sideUser}>{user.name}</div>
        </div>
        <nav style={S.nav}>
          <div style={S.navSection}>Workspace</div>
          {navItems.slice(0, 4).map(n => (
            <button key={n.id} onClick={() => { setPanel(n.id); setAiMsg(''); }} style={S.navItem(panel === n.id)}>
              <i className={`ti ${n.icon}`} style={{ fontSize: 16 }} /> {n.label}
            </button>
          ))}
          <div style={S.navSection}>Insights</div>
          {navItems.slice(4).map(n => (
            <button key={n.id} onClick={() => { setPanel(n.id); setAiMsg(''); }} style={S.navItem(panel === n.id)}>
              <i className={`ti ${n.icon}`} style={{ fontSize: 16 }} /> {n.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
          <button onClick={logout} style={{ ...S.navItem(false), color: 'var(--text-faint)', fontSize: 12 }}>
            <i className="ti ti-logout" style={{ fontSize: 14 }} /> Sign out
          </button>
        </div>
      </div>

      <div style={S.main}>
        <div style={S.topbar}>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
          <button onClick={toggleVoice} style={{ ...S.btnSm, borderColor: voiceActive ? 'var(--accent)' : 'var(--border)', color: voiceActive ? 'var(--accent)' : 'var(--text-muted)', background: voiceActive ? 'var(--accent-light)' : 'transparent', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className={`ti ti-microphone${voiceActive ? '-2' : ''}`} /> {voiceActive ? 'Listening…' : 'Voice'}
          </button>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
            {user.name?.charAt(0)?.toUpperCase()}
          </div>
        </div>

        <div style={S.content}>
          {panel === 'dashboard' && <Dashboard user={user} setPanel={(p, msg) => { setPanel(p); if (msg) setAiMsg(msg); }} />}
          {panel === 'tasks' && <TasksPanel />}
          {panel === 'schedule' && <SchedulePanel />}
          {panel === 'focus' && <FocusPanel />}
          {panel === 'goals' && <GoalsPanel />}
          {panel === 'habits' && <HabitsPanel />}
          {panel === 'assistant' && <AssistantPanel initialMessage={aiMsg} />}
        </div>
      </div>
    </div>
  );
}
