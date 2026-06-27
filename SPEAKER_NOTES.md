# AI Job Analyzer — Speaker Notes
*Read this before your presentation. Each section maps to one slide.*

---

## Slide 1 · Title

**What to say:**

"Good [morning/afternoon]. Today I'm going to walk you through a project I built called the AI Job Analyzer — a full-stack web application that uses Claude AI to help job seekers get more interviews and spend less time on the mechanical parts of job hunting."

"The core idea is simple: the job search process has a lot of repetitive, painful steps that are actually perfect for AI to handle — analyzing your resume against industry standards, scoring your fit for a specific role, writing a tailored cover letter — and I wanted to put all of those in one place with a clean, professional interface."

"It's built on Next.js on the frontend, FastAPI on the backend, and Claude claude-sonnet-4-6 as the AI engine. I'll go through each layer in detail."

**Talking points:**
- This is a portfolio project built to demonstrate full-stack AI integration
- Everything you'll see is live and functional — it's deployed on Vercel and Render
- The four features — Resume Analyzer, Job Tracker, Job Matcher, Cover Letter Generator — are designed to work together as a single workflow, not as isolated tools

---

## Slide 2 · The Problem

**What to say:**

"Before I get into the solution, I want to make sure we're aligned on why this problem is worth solving."

"First — ATS rejection. ATS stands for Applicant Tracking System. These are the automated filters that companies use to screen resumes before a human ever sees them. Studies consistently show that somewhere between 70 and 75 percent of resumes are rejected at this stage — not because the candidate is unqualified, but because the resume isn't formatted or worded in a way that the scanner likes. That's a frustrating, solvable problem."

"Second — visibility. When you apply to a job, you have no idea how well your background actually maps to what they're asking for. You might spend 20 minutes on an application for a role where you're missing 60 percent of the required skills. That's wasted time for everyone."

"Third — cover letter fatigue. A good, tailored cover letter takes 30 to 60 minutes to write. If you're applying to 30 jobs — which is not unusual in a competitive market — that's potentially 30 hours of writing. And a generic letter does almost nothing; recruiters can tell immediately."

"Fourth — tracking chaos. Most people track their applications in a spreadsheet. That works until you have 40 rows, some cells are outdated, and you've forgotten to follow up on three interviews. It becomes a cognitive burden on top of an already stressful process."

"AI Job Analyzer addresses all four of these in one tool."

**Talking points:**
- These aren't hypothetical problems — they're documented pain points backed by recruitment research
- The ATS statistic is from studies by companies like Jobscan and LinkedIn
- The goal is not to replace the human effort of job hunting — it's to eliminate the mechanical, repetitive parts so the candidate can focus on the high-value work like interview prep and networking

---

## Slide 3 · Tech Stack

**What to say:**

"Let me give you a quick overview of what this is built with before we go deeper."

"The frontend is Next.js 14 using the App Router — the newest routing paradigm from Vercel. Everything is written in TypeScript, styled with Tailwind CSS, and uses Lucide for icons. The App Router gives us server components, easy API routing, and clean code organization by feature."

"The backend is FastAPI — a modern Python web framework that's extremely fast, has automatic OpenAPI documentation, and plays very well with async Python. I'm using SQLAlchemy as the ORM and SQLite as the database. SQLite is a great choice here because the app is designed for individual users — there's no shared state, no multi-tenant concerns, and SQLite is zero-config."

"The AI layer is Claude claude-sonnet-4-6 from Anthropic. I chose Claude specifically for two reasons: it produces very clean, consistent structured output when you ask for JSON, and it has a large context window that handles long resumes and job descriptions without chunking."

"For deployment — the frontend goes to Vercel, which is the natural home for Next.js apps and deploys automatically on every git push. The backend goes to Render, which supports Python web services with a simple YAML config file. Both are free tiers, so the entire production deployment costs nothing."

**Talking points:**
- The free-tier deployment is a deliberate design choice — it makes the project accessible and easy to fork
- SQLite can be swapped to PostgreSQL by changing one line — the SQLAlchemy abstraction handles everything else
- Next.js App Router was chosen over Pages Router because it gives us a cleaner separation of server and client code, and the API proxy pattern works more elegantly with App Router catch-all routes

---

## Slide 4 · System Architecture

**What to say:**

"Here's how all the pieces connect. I'll walk you through the request flow."

"A user opens the Next.js app in their browser. When they take an action — uploading a resume, running a job match — the frontend makes a fetch call to `/api/` followed by the route. That `/api/` prefix is handled by a Next.js App Router catch-all route, which proxies the request to the FastAPI backend running on Render."

"Why proxy through Next.js instead of calling FastAPI directly? Two reasons. First, CORS — if the frontend calls the backend directly, you have to configure Cross-Origin Resource Sharing on the backend and deal with preflight requests. By proxying through Next.js, from the browser's perspective it's talking to the same origin. Second, environment variables — the Render backend URL stays server-side in Next.js and never gets exposed in the browser bundle."

"On the FastAPI side, requests are routed to one of four router modules: resume, jobs, match, or cover_letter. All AI-related routes call into a single service file — claude_service.py — which is where every Anthropic API call lives."

"There's also a cross-feature data flow that runs entirely in the browser. When you analyze a resume, the extracted text is saved to localStorage under a specific key. When you navigate to the Job Matcher, it reads that key and pre-fills your resume. When you run a match and then go to Cover Letter, the job description you pasted is also in localStorage. This chain means the user never has to re-type or re-upload anything as they move between tools."

**Talking points:**
- The localStorage pattern is simple but powerful — it's what makes the four tools feel like one cohesive workflow rather than four separate pages
- The catch-all API proxy is `frontend/src/app/api/[[...path]]/route.ts` — it forwards all methods, headers, and bodies verbatim
- SQLite lives on Render's persistent disk — it survives deploys, unlike the ephemeral filesystem

---

## Slide 5 · Feature 1 — Dashboard

**What to say:**

"The Dashboard is the home screen and serves as a command center for the entire job search."

"At the top you have five stat cards — Total applications, Applied, Interviewing, Offers, and Rejected. These pull live from the API on every page load, and they also refresh automatically when the browser tab comes back into focus. So if you add a job in another tab and switch back, the counts update."

"Below that are Recent Applications — the five most recent entries from the tracker, showing company, role, and status badge. There's a link to view all."

"The AI Activity log is one of my favorite parts of the dashboard. Every time Claude does something — analyzes a resume, runs a match, generates a cover letter — that action gets logged to localStorage with a timestamp and a summary. The dashboard surfaces the last eight actions, showing what you did and roughly when. It's a session history that persists even if you close the browser."

"And then Quick Actions — four cards that link directly to each AI tool with a one-sentence description of what they do. The idea is that someone who opens the app for the first time immediately knows what they can do and how to start."

**Talking points:**
- The focus/blur listener pattern (`window.addEventListener("focus")`) is a small but useful UX detail — it means stats are always fresh without polling
- The activity log uses `localStorage` — it's not synced to the server because it's genuinely ephemeral session context, not application data
- The dashboard has a loading skeleton state — during the API fetch, cards show a shimmer animation rather than flashing with zeros

---

## Slide 6 · Feature 2 — Resume Analyzer

**What to say:**

"The Resume Analyzer is the entry point for most users. You upload a resume — PDF, DOCX, or plain text — and Claude gives you a structured critique."

"The upload zone supports drag-and-drop as well as click-to-browse. Once you select a file, you click Analyze and the backend extracts the text — using PyMuPDF for PDFs, python-docx for Word files — and sends it to Claude with a detailed prompt that asks for a structured JSON response."

"You get back three scores visualized as circular gauges: ATS Compatibility, Formatting, and Content Quality, each on a scale of 0 to 100. These aren't arbitrary numbers — the prompt instructs Claude to evaluate specific criteria. ATS score looks at things like whether the resume has a clear contact section, whether it uses standard section headings like 'Experience' and 'Education', and whether it avoids tables or columns that ATS systems can't parse. Formatting looks at whitespace, consistency, and length. Content looks at whether achievements are quantified, whether there's a strong summary, and so on."

"Beyond the scores you get: a plain-English overall summary, a list of strengths and weaknesses, extracted skills broken into technical and soft categories, prioritized recommendations tagged high, medium, or low, and a list of keywords that are commonly expected in your field but missing from the resume."

"Critically — after analysis, the extracted resume text is saved to localStorage. That means when you navigate to the Job Matcher or Cover Letter pages, your resume is already there."

**Talking points:**
- The AgentActivity component — that animated step-by-step panel you see during processing — is reusable. It takes a steps array and a boolean for whether it's running or done. It shows checked steps as they complete. I'll cover this in more detail on slide 10.
- The JSON structure returned by Claude is typed in TypeScript on the frontend — so if Claude returns a malformed response, the error surfaces clearly rather than silently breaking the UI
- The priority tagging on recommendations (high/medium/low) was one of the more interesting prompt engineering challenges — you need to give Claude explicit criteria for what makes something high priority, otherwise it tags everything the same way

---

## Slide 7 · Feature 3 — Job Tracker

**What to say:**

"The Job Tracker is the CRUD backbone of the application — it's where all your job applications live."

"You can add an application with a full form: company, role, status, location, job URL, salary range, date applied, follow-up date, and notes. All optional except company and role."

"Status management is one of the most polished parts of the tracker. At the top there are filter tabs — All, Applied, Interviewing, Offer, Rejected, Saved — each showing a live count. You can click any tab to filter the list. And the status badge on each row is actually a dropdown — you can change the status inline without opening any modal. It updates immediately via a PATCH request to the API."

"For power users, there's bulk selection — checkboxes on every row, a select-all checkbox in the header, and a 'Delete Selected (N)' button that calls a bulk delete endpoint. This is much faster than deleting one by one when you're clearing out rejected applications."

"There's also a demo data loader — one click seeds the database with realistic sample applications across all statuses, which is useful for demoing the app or just exploring the interface."

"Finally — and this is the integration point I'm most proud of — every row has quick-action icons. One launches the Job Matcher pre-loaded with that company and role as context. Another launches the Cover Letter Generator with the company name pre-filled. The whole system is designed so you can take an application all the way from 'saved' to 'interview-ready' without copy-pasting anything."

**Talking points:**
- The table is fully responsive — on mobile it switches from a table layout to a card-based list layout using Tailwind's `md:hidden` / `hidden md:block` classes
- The inline status update uses optimistic UI — the dropdown value changes immediately in React state, then confirms via API. If the API fails, the error is shown
- The bulk delete endpoint is `POST /jobs/bulk-delete` with an array of IDs — this avoids making N individual DELETE requests

---

## Slide 8 · Feature 4 — Job Matcher

**What to say:**

"The Job Matcher is the most feature-rich part of the application. You paste your resume text and a job description, and Claude does a deep comparison."

"The primary output is a match score — a percentage — with a likelihood badge: Low, Medium, or High. Below that is a plain-English summary explaining the score. Then you get: matching skills in green, missing skills in red, matching experience, experience gaps, tailoring suggestions organized by resume section, keywords to add, and quick interview tips. That's all from a single Claude call."

"But the Matcher page also has three secondary AI actions that you can trigger after seeing the initial results."

"'Better Bullets' takes your resume and the job description and rewrites your experience bullet points to match the JD's keywords and language. These are ATS-optimized, impact-focused bullets you can copy directly into your resume."

"'Interview Prep' generates a set of behavioral, technical, and situational interview questions for this specific role, with a suggested answer for each. They're shown in an accordion — click a question to expand the suggested answer."

"'Save to Tracker' opens a small modal where you fill in the company and role, and the job gets added to the tracker with the match score embedded in the notes field — so when you come back to that application later, you can see your AI score."

"And there's a direct link to the Cover Letter Generator, which carries the job description over via localStorage."

**Talking points:**
- All four AI operations on the Matcher page are independent requests — they don't chain automatically, the user decides which ones they want
- The match score prompt is one of the most carefully engineered in the project. It instructs Claude to be calibrated — a 78% score should mean something specific, not just "pretty good"
- The "Save to Tracker" modal is deliberately minimal — just company, role, and status — because you've already done the research on the Matcher page and don't want to fill a full form

---

## Slide 9 · Feature 5 — Cover Letter Generator

**What to say:**

"The Cover Letter Generator is where everything comes together. Claude writes a personalized cover letter using your resume and the job description, and you can control the tone."

"There are five tone options: Professional, Enthusiastic, Concise, Creative, and Storytelling. Each produces a genuinely different letter. Professional is what you'd use for a corporate or financial services role — formal, structured, no embellishment. Concise targets around 200 words — useful for companies that explicitly ask for short cover letters. Creative is distinctive and memorable — good for startups or design-oriented companies. Storytelling builds a narrative arc, which works well for senior roles where your journey matters."

"The page is tightly integrated with the rest of the app. If you just came from the Resume Analyzer, your resume text is already in the textarea. If you came from the Job Matcher, the job description is also pre-filled. If you navigated here from the Job Tracker by clicking the cover letter icon on a row, the company name is already filled and the job description textarea is pre-populated with a template."

"Once Claude generates the letter, you can copy it to clipboard, download it as a .txt file, or save a snippet of it to the job application's notes in the tracker. There are also one-click 'Try [tone]' shortcuts that regenerate the letter in a different tone without going back to the form."

**Talking points:**
- The five tones are not just system prompt variations — each has a specific structural instruction. The Concise tone, for example, explicitly tells Claude to target 200 words and to cut any filler phrases
- The word count is displayed under the letter — useful because some job postings specify a maximum length
- The save-to-application feature appends a truncated snippet (first 300 characters) to the job's notes, not the full letter — this keeps the tracker notes readable while still giving you a record

---

## Slide 10 · AI Agent UX Pattern

**What to say:**

"I want to spend a moment on something that isn't a feature per se but significantly affects how the app feels — the AI Agent UX pattern."

"Every time Claude is processing, instead of just showing a spinner, the app shows a step-by-step progress panel. For the Resume Analyzer, the steps are: Parsing resume document → Extracting work experience and education → Identifying technical skills → Evaluating ATS compatibility → Calculating scores → Generating recommendations. As each step completes, it gets a checkmark."

"Why does this matter? Two reasons. The first is trust. When users see a blank spinner for 10 seconds, they don't know if anything is happening — they wonder if the page is broken. When they see specific steps completing, they understand the AI is genuinely working through a process. The result feels earned rather than arbitrary."

"The second reason is perceived speed. Even though the total wait time is the same, watching meaningful progress makes it feel faster. This is well-documented in UX research — the famous example is putting mirrors in elevator lobbies to reduce complaints about wait times without changing the actual wait."

"The AgentActivity component is fully reusable. It accepts three props: a steps array of strings, isRunning, and isDone. Each of the four AI flows passes in a different steps list. The animation — dots pulsing on the current step, checkmarks appearing — is handled entirely in CSS and React state."

**Talking points:**
- The steps are sequential but the timing is approximate — the frontend doesn't actually know which step Claude is on. The animation runs on a timer that completes all steps over the expected API duration
- This pattern is inspired by tools like Devin and Claude Code, which surface agent reasoning as a live feed
- After the analysis completes, the component stays visible with all steps checked — it gives the user a moment to appreciate the scope of what was analyzed before the results appear

---

## Slide 11 · Key Engineering Decisions

**What to say:**

"Let me walk through the six decisions that had the biggest impact on how the project turned out."

**localStorage for context passing.** "The decision to persist resume text and job descriptions in localStorage is the single biggest quality-of-life improvement in the app. Without it, users would have to re-paste their resume on every page. With it, you analyze your resume once and every other tool just works. The tradeoff is that it's browser-local — if you switch devices, the context doesn't follow. For a personal productivity tool, that's an acceptable limitation."

**Structured JSON from Claude.** "Every prompt that goes to Claude asks for a specific JSON structure and describes each field. This was the hardest part of the project to get right. Early versions would return fields in slightly different formats, or occasionally include markdown formatting inside JSON strings. The solution was to be extremely explicit in the prompt — not just 'return JSON' but 'return JSON with this exact schema, no markdown, no explanation outside the JSON block.'"

**Single claude_service.py.** "All Anthropic API calls live in one file. This sounds obvious, but the alternative — putting Claude calls inside each router module — would make it much harder to swap models, add prompt caching, or change API parameters consistently. Having one file as the AI boundary makes the system easy to reason about."

**Next.js API proxy.** "The catch-all route at `/api/[[...path]]/route.ts` proxies every request to FastAPI. This solves CORS permanently and keeps the backend URL out of the browser. It's three dozen lines of code that saves hours of configuration and security headaches."

**SQLite to PostgreSQL in one line.** "SQLAlchemy abstracts the database engine. The connection string is the only thing that changes. This means the app runs with zero database setup locally but can be upgraded to a managed Postgres instance if needed."

**Composable AI flows.** "The Job Matcher page is designed so that each AI action — match analysis, better bullets, interview prep — is independently triggered. The user sees the primary result and decides what else they need. This avoids overwhelming people with output they didn't ask for, and it keeps API costs proportional to actual usage."

---

## Slide 12 · Live Demo Walk-through

**What to say:**

"Here's the flow I'll walk through if we're doing a live demo — or the flow I'd recommend if you're exploring the app yourself."

"Start at the Dashboard. The empty state immediately communicates what the app does — you can see the four Quick Action cards. Click 'Analyze Resume.'"

"On the Resume Analyzer, upload any PDF resume — yours, a sample, it doesn't matter. Click Analyze. Watch the agent steps animate. Within 10 to 15 seconds you'll have a full ATS report. Note the three score circles and the recommendations."

"Now navigate to Job Matcher. Your resume is already in the left textarea — you didn't have to paste anything. Find any job posting online, copy the description, paste it on the right. Click Analyze Match. Wait for the score. Then click 'Better Bullets' — this is usually the most impressive moment in a demo, because the improvement in bullet quality is immediately visible."

"Click 'Save to Tracker.' Fill in the company and role. Save. Navigate to Job Tracker. You'll see the new entry. Change the status to Interviewing by clicking the status badge inline. Note the count on the filter tab updates immediately."

"Click the cover letter icon on that row. You land on the Cover Letter Generator with the company name filled in. Add the job description text if it's not there. Select Creative tone. Generate. Copy."

"That's the complete workflow — resume analyzed, job matched, bullets improved, application tracked, cover letter written — without copying or pasting anything more than once."

**Talking points:**
- If demoing live, have a real PDF resume and a real job posting ready beforehand — ad-libbing those takes too long
- The demo intentionally goes through all five pages — show that the context (resume, JD) carries through automatically, because that's the thing most people don't expect
- Time the demo if you can — the full flow usually takes about 5-6 minutes including the API calls

---

## Slide 13 · Deployment

**What to say:**

"The deployment setup is designed to be as close to zero-friction as possible."

"The frontend deploys to Vercel. If you've used Next.js before, you know that Vercel is essentially the first-party host — it's built by the same team. You connect a GitHub repo, set one environment variable — NEXT_PUBLIC_API_URL pointing to your Render backend — and every push to main auto-deploys. No Dockerfile, no build scripts, no CI configuration needed."

"The backend deploys to Render using a render.yaml file that's checked into the repo. That file specifies the service name, the build command, the start command, and the environment variables. Render picks it up automatically. The SQLite database lives on a persistent disk mount — so application data survives redeployments, unlike Render's default ephemeral filesystem."

"The only sensitive piece is the ANTHROPIC_API_KEY — it lives as a secret environment variable in the Render dashboard, never in the repo. The frontend never sees it."

"Total monthly cost at current usage: zero dollars. Both free tiers are generous enough for a portfolio project or small personal tool. If this were a production product with real traffic, the migration path is: upgrade Render to a paid plan for always-on (free tier spins down after inactivity), and swap SQLite for a managed Postgres instance."

**Talking points:**
- The spin-down behavior on Render's free tier is worth mentioning — the first request after a period of inactivity takes 30 to 60 seconds because the service has to boot up. For a demo, it's worth hitting the backend URL a minute before you present so it's warm.
- render.yaml is a nice pattern to know about — it's Infrastructure as Code for a simple web service, without the complexity of Kubernetes or Terraform
- The environment variable separation is intentional security hygiene: secrets on the server side, public config on the client side

---

## Slide 14 · Thank You / Q&A

**What to say:**

"To recap — AI Job Analyzer is a full-stack project that puts four AI-powered tools in one workflow: resume analysis, application tracking, job matching, and cover letter generation. Everything talks to each other through a shared localStorage context pattern, which makes the user experience feel seamless."

"The interesting technical challenges were around prompt engineering for consistent structured output, the cross-feature context flow, and the agent UX pattern that makes AI processing feel transparent."

"The entire stack — Next.js, FastAPI, Claude, SQLite, Vercel, Render — is something a single developer can build, deploy, and maintain. And the free-tier deployment means the barrier to actually shipping it is essentially zero."

"I'm happy to go deeper on any of the features, the architecture, the AI prompting strategy, or anything else."

---

## Anticipated Questions

**Q: Why FastAPI instead of Express or another Node backend?**
"I wanted the AI service layer in Python because the Anthropic Python SDK is the most complete, and Python has the best ecosystem for document parsing — PyMuPDF, python-docx. FastAPI is the cleanest Python web framework for building APIs — it has automatic validation via Pydantic, async support, and excellent performance."

**Q: Why not use the Vercel AI SDK or a managed AI layer?**
"The Vercel AI SDK is great for streaming responses and built-in React hooks. I chose to make direct Anthropic API calls because I wanted full control over the prompt structure and the response parsing. The JSON-mode prompting I'm doing is quite specific, and I didn't want an abstraction layer between my prompt and Claude's response."

**Q: How do you handle prompt injection — what if someone pastes malicious content in a job description?**
"The resume and job description text is passed to Claude as user content, not as system instructions. Claude is reasonably robust against prompt injection in user content, especially when the system prompt is explicit about the task. That said, this is a personal tool, not a multi-tenant SaaS — the attack surface is very limited. For a public product you'd add rate limiting and input length caps."

**Q: What's the cost per analysis?**
"A resume analysis costs roughly $0.005 to $0.01 per run using claude-sonnet-4-6, depending on resume length. A full job match with bullets and interview prep might run $0.03. For a personal tool this is negligible — a few dollars a month for heavy usage."

**Q: Could you add user authentication and make this multi-user?**
"Yes. The main changes would be: add an auth layer (NextAuth or Clerk for the frontend, JWT verification middleware for FastAPI), add a user_id foreign key to the jobs table, and swap SQLite for PostgreSQL. The application logic doesn't need to change — it's already structured with clean separation between routes, services, and database models."

**Q: Why localStorage instead of server-side session storage?**
"For this use case, localStorage is actually the right call. The resume text and job description are temporary working context — they're not application data that needs to be backed up or shared. Saving them server-side would require authentication, a sessions table, and cleanup logic. localStorage is zero-infrastructure and works perfectly for a single-user tool."

**Q: What would you change if you were building this for production?**
"A few things. First, I'd add prompt caching — Anthropic supports it natively and it would cut costs significantly for repeated analyses. Second, I'd add background job processing for long analyses — FastAPI with Celery and Redis — so the HTTP request doesn't have to stay open for 15 seconds. Third, streaming responses — Claude can stream tokens as they're generated, which would make the UX even more responsive. Fourth, proper authentication and PostgreSQL as I mentioned."

---

## Timing Guide

| Section | Slides | Suggested Time |
|---|---|---|
| Intro + Problem | 1–2 | 3–4 min |
| Stack + Architecture | 3–4 | 4–5 min |
| Features (all five) | 5–9 | 12–15 min |
| UX + Engineering | 10–11 | 4–5 min |
| Demo | 12 | 5–6 min (live) or 2 min (described) |
| Deployment + Close | 13–14 | 3–4 min |
| **Total** | | **~30–35 min** |

For a 15-minute slot: cut slides 10 and 11, combine features into a 3-minute summary, and focus on the demo.

For a 10-minute slot: Title → Problem (1 min) → Stack (1 min) → 60-second summary of each feature (4 min) → Demo (3 min) → Close (1 min).
