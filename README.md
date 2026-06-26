# FocusAI — AI Productivity Companion

An AI-powered productivity app built with React, Node.js, PostgreSQL, and Claude AI. Deployable on Google Cloud Run.

## Features
- Intelligent task prioritization with AI scoring
- AI-powered daily schedule generation
- Pomodoro focus mode
- Goal tracking with progress visualization
- Habit tracker with streaks
- AI chat assistant (powered by Claude)
- Voice input support
- JWT authentication

## Tech Stack
- **Frontend:** React 18 + Vite
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (Google Cloud SQL)
- **AI:** Anthropic Claude (claude-sonnet-4-6)
- **Hosting:** Google Cloud Run

## Environment Variables (set in Cloud Run)
| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `JWT_SECRET` | Random secret string for JWT signing |
| `NODE_ENV` | Set to `production` |

## Local Development
```bash
# Backend
cd backend && npm install
DATABASE_URL=postgresql://... ANTHROPIC_API_KEY=sk-... JWT_SECRET=dev node server.js

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

## Demo credentials
- Email: demo@focusai.app
- Password: demo1234
