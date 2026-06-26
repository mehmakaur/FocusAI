-- Run this once after creating your Cloud SQL Postgres instance
-- The app auto-creates tables on first boot, but this seeds the demo user

-- Demo user: demo@focusai.app / demo1234
-- (bcrypt hash of "demo1234")
INSERT INTO users (id, email, name, password_hash, productivity_score, streak)
VALUES (
  gen_random_uuid(),
  'demo@focusai.app',
  'Demo User',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  87,
  5
) ON CONFLICT (email) DO NOTHING;
