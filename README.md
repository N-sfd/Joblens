# ApplyPilot AI

**ApplyPilot AI** is an AI-powered resume analyzer and job tracking platform. Users can analyze resumes, compare them against job descriptions, receive ATS-style feedback, identify missing keywords, generate tailored suggestions, and track applications through a dashboard.

The app includes a resume analyzer, job matcher, job tracker, cover letter assistant, and AI-generated recommendations — powered by a live agent activity feed that shows every step the AI takes in real time.

## Features

| Feature | Description |
|---|---|
| **Resume Analyzer** | Upload PDF/DOCX and get ATS score, skill analysis, and recommendations |
| **Job Tracker** | Kanban-style tracker for all your applications |
| **Job Matcher** | Paste a job description and get a match score + tailoring suggestions |
| **Cover Letter Generator** | AI-generates a tailored cover letter in your chosen tone |

## Public access (no login)

This app is **fully public** — there is no user authentication, no `middleware.ts`, and no NextAuth (or similar). Anyone with the link can use every feature immediately.

| Area | Behavior |
|---|---|
| Resume / Match / Cover letter | No account; calls go straight to the API |
| Job tracker | Each browser gets a random **`guestId`** in `localStorage`; sent as **`X-Guest-Id`** so your jobs stay private to that device |
| Resume text & match context | Stored in `localStorage` only (not synced to a server) |

### If Vercel shows a login screen

That is usually **Vercel Deployment Protection**, not this app’s code. To allow public visitors:

1. Vercel project → **Settings** → **Deployment Protection**
2. Turn off **Vercel Authentication** / password protection for **Production** (or add your share link as an exception)
3. Redeploy

There is no Sign In / Sign Up in the UI and no route guards in the codebase.

---

- **Frontend**: Next.js 14 (App Router), Tailwind CSS, TypeScript
- **Backend**: FastAPI, SQLAlchemy, SQLite
- **AI**: Claude (claude-sonnet-4-6) via Anthropic SDK
- **Deploy**: Vercel (frontend) + Render (backend)

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 18+
- Anthropic API key → [console.anthropic.com](https://console.anthropic.com)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # add your ANTHROPIC_API_KEY
uvicorn main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local  # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

App: http://localhost:3000

---

## Deploy for Free

See **[PRODUCTION.md](./PRODUCTION.md)** for the current Postgres + Clerk + Zoho production checklist.

### Backend → Render (summary)

1. Push this repo to GitHub.
2. Render → **Blueprint** using `render.yaml` (creates Postgres + web service), **or** New Web Service with Root Directory `backend`.
3. Start command: `python -m alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Set secrets: `GROQ_API_KEY`, `ALLOWED_ORIGINS`, Clerk, Zoho, `TOKEN_ENCRYPTION_KEY`. Keep `ATS_AUTH_ENFORCE=true`.
5. Confirm `https://<service>.onrender.com/health`.

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import repo.
2. Set **Root Directory** to `frontend`.
3. Add **one** of these (required — otherwise the UI calls `localhost` and shows “Failed to fetch”):
   - **Recommended:** `BACKEND_URL` = your Render **service root only**, e.g. `https://joblens-api.onrender.com` — **do not** add `/api` (that would produce `/api/api/...` and **Not Found**). The app proxies `/api/*` to FastAPI via `app/api/[[...path]]` at **request time** (set `BACKEND_URL` on Vercel and redeploy).
   - **Alternative:** `NEXT_PUBLIC_API_URL` = the same backend URL. The browser calls the API directly; use **https** and set `ALLOWED_ORIGINS` on the backend to your Vercel site.
4. Add Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`).
5. Redeploy after changing env vars so serverless picks up `BACKEND_URL`.
6. Deploy — Vercel auto-detects Next.js.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `DATABASE_URL` | SQLite path (default: `sqlite:///./aijob.db`) |
| `ALLOWED_ORIGINS` | Comma-separated browser origins allowed for CORS. Use full URLs (`https://your-app.vercel.app`) or hostnames without scheme (`your-app.vercel.app` → `https://…`). Include `http://localhost:3000` for local dev if needed. |

### Frontend (`frontend/.env.local` or Vercel env)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend URL for **local** dev (default in browser on `localhost` is `http://localhost:8000` if unset). On Vercel you can use this **or** `BACKEND_URL`. |
| `BACKEND_URL` | **Vercel (recommended):** backend origin only, e.g. `https://joblens-api.onrender.com` — **not** `.../api` or `.../docs`. Read at runtime by the `/api/*` proxy route (`app/api/[[...path]]`). The browser calls same-origin `/api/...`; the server forwards to FastAPI. |

---

## Project Structure

```
AIJob-Analyzer/
├── backend/
│   ├── main.py              # FastAPI app + CORS
│   ├── database.py          # SQLAlchemy engine + session
│   ├── models.py            # ORM + Pydantic schemas
│   ├── services/
│   │   └── claude_service.py  # All Claude API calls
│   ├── routers/
│   │   ├── resume.py        # File upload + analysis
│   │   ├── jobs.py          # CRUD for job applications
│   │   ├── match.py         # Resume vs JD matching
│   │   └── cover_letter.py  # Cover letter generation
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js App Router pages
│   │   ├── components/      # Sidebar, ScoreCircle, StatusBadge
│   │   ├── lib/api.ts       # Typed API client
│   │   └── types/index.ts   # Shared TypeScript types
│   ├── package.json
│   └── tailwind.config.ts
├── render.yaml              # Render one-click deploy
└── .gitignore
```
