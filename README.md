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

## Tech Stack

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

### Backend → Render

1. Push this repo to GitHub.
2. Go to [render.com](https://render.com) → **New Web Service** → connect repo.
3. Set **Root Directory** to `backend`.
4. Set **Build Command**: `pip install -r requirements.txt`
5. Set **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Add environment variables in Render dashboard:
   - `ANTHROPIC_API_KEY` = your key
   - `ALLOWED_ORIGINS` = your Vercel URL (added after frontend deploy)
7. Add a **Disk** (1 GB) mounted at `/opt/render/project/src/backend` for SQLite persistence.

Alternatively, use the `render.yaml` in the repo root for one-click deploy.

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import repo.
2. Set **Root Directory** to `frontend`.
3. Add **one** of these (required — otherwise the UI calls `localhost` and shows “Failed to fetch”):
   - **Recommended:** `BACKEND_URL` = your Render backend URL, e.g. `https://joblens-api.onrender.com` (no trailing slash). The Next.js config rewrites `/api/*` to that host so the browser uses same-origin requests (no mixed content, no public API URL in the bundle). Rewrites use `beforeFiles` so `/api` is proxied before the App Router can return a 404 page for those paths.
   - **Alternative:** `NEXT_PUBLIC_API_URL` = the same backend URL. The browser calls the API directly; use **https** and set `ALLOWED_ORIGINS` on the backend to your Vercel site.
4. Redeploy after changing env vars (rewrites are applied at build time).
5. Deploy — Vercel auto-detects Next.js.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `DATABASE_URL` | SQLite path (default: `sqlite:///./aijob.db`) |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |

### Frontend (`frontend/.env.local` or Vercel env)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend URL for **local** dev (default in browser on `localhost` is `http://localhost:8000` if unset). On Vercel you can use this **or** `BACKEND_URL`. |
| `BACKEND_URL` | **Vercel (recommended):** backend origin, e.g. `https://joblens-api.onrender.com` (no trailing slash). Used at **build** time for Next.js rewrites so `/api/*` is proxied — browser stays same-origin and avoids “Failed to fetch” from calling `localhost`. |

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
