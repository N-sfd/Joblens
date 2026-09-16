# JobLens AI Career Intelligence — completion report

**Branch:** `seeker/ai-career-intelligence`  
**Scope:** Seeker-facing product only — **no CRM/ATS module changes.**

## Product

**JobLens — AI Career Intelligence**  
Evidence-based résumé ↔ job matching with structured parsing, semantic/synonym matching, deterministic weighted scoring, evidence mapping, gap analysis, and honest recommendations.

## Files created

| File | Purpose |
|------|---------|
| `backend/services/joblens_skill_normalize.py` | Deterministic skill synonym normalization |
| `backend/services/joblens_scoring.py` | Weighted category + overall scoring |
| `backend/services/joblens_matching.py` | Match levels + résumé evidence excerpts |
| `backend/services/joblens_parsers.py` | Resume/JD parsers (AI + deterministic fallback) |
| `backend/services/joblens_analyze.py` | End-to-end orchestration |
| `backend/routers/joblens.py` | `/api/joblens/*` routes |
| `backend/migrations/versions/n4c5d6e7f8a9_add_joblens_analyses.py` | `joblens_analyses` table |
| `backend/tests/test_joblens_career_intelligence.py` | Backend tests |
| `docs/JOBLENS_CAREER_INTELLIGENCE.md` | This report |

## Files modified

| File | Change |
|------|--------|
| `backend/models.py` | Added `JoblensAnalysis` |
| `backend/main.py` | Mount seeker router `/api/joblens` |
| `backend/services/rate_limit.py` | JobLens 429 message |
| `backend/.env.example` | JobLens AI env vars |
| `frontend/src/app/(app)/match/page.tsx` | Career Intelligence analyzer UI |
| `frontend/src/lib/api.ts` | JobLens API client + owned prefix |
| `frontend/src/types/index.ts` | Career Intelligence types |
| `frontend/src/components/Sidebar.tsx` | Nav label → Career Intelligence |

## API routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/joblens/analyze` | Full analysis (JSON or multipart résumé) |
| GET | `/api/joblens/analyses` | History + repeated-gap insights |
| GET | `/api/joblens/analyses/{id}` | Saved analysis detail |
| DELETE | `/api/joblens/analyses/{id}` | Delete saved analysis |
| POST | `/api/joblens/parse-resume` | Internal/optional resume parse |
| POST | `/api/joblens/parse-job` | Internal/optional JD parse |
| POST | `/api/joblens/compare` | Text-only alias of analyze |

## Database migration

- Revision `n4c5d6e7f8a9` → table `joblens_analyses`
- Run: `cd backend && python -m alembic upgrade head`

## Behavior summary

### Resume parser
Structured fields (name, contact, skills buckets, experience, education, projects, domains, years). AI when keys present; otherwise deterministic keyword/tech extraction. No demographic / visa inference.

### JD parser
Title, company, required vs preferred skills, experience years, education, seniority, classified requirements list.

### Skill normalization
JS→JavaScript, React.js→React, K8s→Kubernetes, AWS aliases, Oracle EBS/Fusion, CI/CD, etc. Related ≠ identical (Docker ≠ Kubernetes).

### Matching
Per-requirement levels: Strong / Partial / Related Evidence / Not Demonstrated / Missing. Evidence excerpts taken only from résumé text.

### Weighted scoring (deterministic)

```
overall = required*0.35 + experience*0.25 + preferred*0.15
        + education*0.10 + domain*0.10 + evidence*0.05
```

Rounded to nearest integer. AI cannot override.

### Evidence / gaps / recommendations
Strong vs weak/missing vs not-demonstrated; honest improvement tips (never invent skills); ATS keywords only when truthful; interview + learning priorities.

### Saved analyses & history
Deduped by content hash; optional new version; history panel with repeated-gap insight.

### Fallback
Without AI keys / `JOBLENS_AI_ENABLED=false`: deterministic path + warning banner. No crash.

### Rate limit
JobLens analyze bucket → HTTP **429**  
`You have reached the analysis limit. Please wait and try again.`

### Privacy
No logging of full résumé, JD, prompts, tokens, or keys. Safe logs: request id, user/guest id, file type/size, analysis id, duration/error code.

## Tests

`backend/tests/test_joblens_career_intelligence.py` — **17 passed**

Coverage includes normalization, parsers, scoring, match levels, evidence integrity, AI non-override, save/duplicate, invalid/oversized file, rate limit, history.

## Production build

- `npx tsc --noEmit` — passed  
- `npm run build` — passed

## Known limitations

- Semantic matching is synonym/related-cluster based (not embedding vectors yet; `JOBLENS_EMBEDDINGS_ENABLED` reserved).
- Deterministic JD split for preferred skills uses section markers (“Preferred”, “Nice to have”).
- Per-process rate limits (not Redis) — fine for single-instance.
- Legacy `/api/match` still exists for older clients; `/match` UI now uses `/api/joblens`.
