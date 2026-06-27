# AI Job Analyzer — Project Presentation

---

## 1. What Is It?

**AI Job Analyzer** is a full-stack, AI-powered career tool that helps job seekers stand out. It combines smart document analysis, job tracking, and personalized writing assistance — all driven by Claude AI — into one cohesive web application.

Built from scratch as a portfolio project (May 2026).

---

## 2. The Problem It Solves

Job hunting is time-consuming and opaque:

- Resumes get rejected by ATS scanners before a human ever reads them
- Applicants apply to dozens of roles without knowing how well they actually fit
- Writing a tailored cover letter for every application takes hours
- Tracking applications across spreadsheets is fragile and error-prone

AI Job Analyzer addresses all four problems in a single tool.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | FastAPI (Python), SQLAlchemy ORM, SQLite |
| AI | Anthropic Claude claude-sonnet-4-6 |
| Deploy | Vercel (frontend) + Render (backend) |
| File Parsing | PyMuPDF (PDF), python-docx (DOCX), lxml |

---

## 4. Architecture Overview

```
┌─────────────────────────────────────┐
│           Next.js Frontend           │
│  App Router · TypeScript · Tailwind  │
│                                      │
│  /         Dashboard + Stats         │
│  /resume   Resume Analyzer           │
│  /jobs     Job Tracker               │
│  /match    Job Matcher               │
│  /cover-letter  Cover Letter Gen     │
└──────────────┬──────────────────────┘
               │ REST API (/api proxy)
┌──────────────▼──────────────────────┐
│           FastAPI Backend            │
│                                      │
│  routers/resume.py                  │
│  routers/jobs.py                    │
│  routers/match.py                   │
│  routers/cover_letter.py            │
│                                      │
│  services/claude_service.py  ──────► Claude API
│  models/  + SQLite DB               │
└─────────────────────────────────────┘
```

**Cross-feature data flow:** Resume text extracted by the Analyzer is saved to `localStorage` and automatically pre-fills the Job Matcher and Cover Letter Generator — no re-uploading needed.

---

## 5. Core Features

### 5.1 Dashboard
The home screen gives an instant snapshot of the job search:

- **Stats cards**: Total applications, Applied, Interviewing, Offers, Rejected
- **Recent Applications**: last 5 entries with status badges, links to full tracker
- **AI Activity log**: timestamped history of every Claude action (resume analyzed, match run, cover letter generated, etc.) — persisted in `localStorage`, clearable
- **Quick Actions**: one-click shortcuts to each AI tool

### 5.2 Resume Analyzer
Upload a resume (PDF, DOCX, or TXT) and get a full AI critique in seconds.

**How it works:**
1. Drag-and-drop or click to upload
2. An animated "Agent Activity" panel shows each processing step live:
   - Parsing document → Extracting experience → Identifying skills → Evaluating ATS compatibility → Calculating scores → Generating recommendations
3. Claude returns a structured analysis

**Output:**
- **Three scores**: ATS Compatibility, Formatting, Content Quality (0–100, visualized as animated circles)
- **Overall Summary** — plain-English assessment
- **Strengths** and **Areas to Improve**
- **Skills Identified** — Technical (indigo tags) and Soft Skills (slate tags)
- **Prioritized Recommendations** — High / Medium / Low priority badges
- **Missing Keywords** — words common in job descriptions that are absent from the resume

### 5.3 Job Tracker
A full CRUD application for managing every job application.

**Features:**
- Add/edit/delete applications with: Company, Role, Status, Location, Job URL, Salary Range, Date Applied, Follow-up Date, Notes
- **Status filter tabs**: All · Applied · Interviewing · Offer · Rejected · Saved (with live counts)
- **Inline status update**: click the status pill directly in the table row
- **Bulk selection and delete**: checkboxes + "Delete Selected (N)" button
- **Demo data loader**: seed realistic sample applications with one click
- **Deep links per row**: jump directly to Job Matcher or Cover Letter Generator pre-loaded with that company/role

Responsive design: card list on mobile, full table on desktop.

### 5.4 Job Matcher
The most feature-rich tool. Paste a resume and a job description — Claude does a deep comparison.

**Primary output:**
- **Match Score** (0–100%) with animated score circle
- **Likelihood badge**: Low / Medium / High
- **Summary** — plain-English explanation of the fit
- **Matching Skills** (green) and **Missing Skills** (red)
- **Matching Experience** and **Gaps**
- **Tailoring Suggestions** — section-by-section advice (e.g., "Skills section: add Docker and Kubernetes")
- **Keywords to Add** — high-value terms missing from the resume
- **Quick Interview Tips**

**Secondary AI actions (from the same result page):**
- **Better Bullets** — generates ATS-optimized resume bullet points targeted at this specific JD
- **Interview Prep** — generates behavioral, technical, and situational Q&A pairs in an accordion UI
- **Save to Tracker** — modal to record this job with the match score embedded in notes
- **Cover Letter** — navigates to Cover Letter Generator with context pre-filled

### 5.5 Cover Letter Generator
Generates a personalized, publication-ready cover letter in seconds.

**Inputs:**
- Resume text (auto-loaded from last analysis)
- Job description (auto-loaded from last match)
- Company name
- **Tone selector**: Professional · Enthusiastic · Concise · Creative · Storytelling

**Features:**
- **Job selector**: pick any saved application from the tracker to pre-fill context
- Animated agent activity during generation
- **Copy to clipboard** / **Download as .txt**
- **Regenerate** with a different tone in one click (shortcuts for two alternate tones appear inline)
- **Save to Application**: appends the letter snippet to the job's notes in the tracker
- Word count display

---

## 6. AI Agent UX Pattern

Every AI operation surfaces its work visually through the `AgentActivity` component:

```
● Parsing resume document          ✓
● Extracting work experience       ✓
● Identifying technical skills     ✓ (animating…)
  Evaluating ATS compatibility
  Calculating scores
  Generating recommendations
```

Steps complete in sequence with checkmarks. The component accepts a `steps` array, `isRunning`, and `isDone` flags — reusable across all four AI flows with different step lists.

This makes the AI feel transparent and responsive rather than like a black box.

---

## 7. API Design (FastAPI Backend)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/resume/analyze` | Upload file → returns `ResumeAnalysis` |
| GET | `/jobs/` | List all applications |
| POST | `/jobs/` | Create application |
| PATCH | `/jobs/{id}` | Update application |
| DELETE | `/jobs/{id}` | Delete application |
| POST | `/jobs/bulk-delete` | Delete multiple by IDs |
| GET | `/jobs/stats` | Return counts by status |
| POST | `/jobs/demo` | Seed demo data |
| POST | `/match/` | Resume + JD → `MatchResult` |
| POST | `/match/bullets` | Resume + JD → bullet points |
| POST | `/match/interview-questions` | Resume + JD → Q&A list |
| POST | `/cover-letter/` | Resume + JD + tone → cover letter text |

The frontend proxies all `/api/*` requests through a Next.js App Router catch-all route to avoid CORS issues in production.

---

## 8. Key Engineering Decisions

**localStorage for context passing** — Resume text and job description are cached in the browser so navigating between tools (Analyzer → Matcher → Cover Letter) feels seamless without re-uploading or re-pasting.

**Structured AI output** — All Claude responses are requested as JSON with explicit schemas. This lets the frontend render individual sections (scores, skill tags, recommendations) rather than displaying raw text.

**Single `claude_service.py`** — All Anthropic API calls live in one service file, making it easy to swap models, adjust prompts, or add caching in one place.

**SQLite + SQLAlchemy** — Appropriate for a portfolio/single-user tool. Swappable to PostgreSQL via one connection string change.

**Render + Vercel free tier** — Zero-cost production deployment with `render.yaml` checked into the repo for one-command backend deploys.

---

## 9. What I Learned / What Makes It Stand Out

1. **Prompt engineering for structured data** — Getting Claude to return consistent, typed JSON across diverse resume styles required iterative prompt refinement with explicit field descriptions and examples.

2. **Composable AI flows** — The Job Matcher page chains four distinct AI calls (match analysis → bullets → interview questions → cover letter navigation) from a single result, demonstrating how to build multi-step AI workflows without overwhelming the user.

3. **Resume text persistence pattern** — A simple `localStorage` key bridges four separate pages. It removes the biggest friction point in multi-tool AI applications: having to re-provide the same input repeatedly.

4. **Agent Activity UX** — Making AI processing visible (not just a spinner) significantly improves perceived responsiveness and user trust in the output.

---

## 10. Demo Flow (Live Walk-through)

1. Open **Dashboard** — shows empty state with quick action cards
2. Go to **Resume Analyzer** → upload a PDF → watch agent steps animate → see ATS score and recommendations
3. Go to **Job Matcher** → resume is pre-filled → paste a JD → analyze → generate bullets and interview prep
4. Click **Save to Tracker** → fill company/role → saved
5. Go to **Job Tracker** → see the new entry → update status inline
6. Click the Cover Letter icon on the row → navigate to **Cover Letter Generator** with context pre-filled → choose "Creative" tone → generate → copy

---

## 11. Deployment

```
Frontend  →  Vercel (auto-deploy on push to main)
Backend   →  Render (render.yaml defines the web service)
Database  →  SQLite on Render's persistent disk
```

Environment variables:
- `ANTHROPIC_API_KEY` — backend only
- `NEXT_PUBLIC_API_URL` — frontend (points to Render URL)

---

*Built with Next.js 14 · FastAPI · Claude claude-sonnet-4-6 · Tailwind CSS*
