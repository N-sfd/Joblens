"""Deterministic ATS mechanics: keyword scanning and formatting compliance.

Real ATS platforms (Workday, Taleo, iCIMS, Greenhouse) score resumes with exact
keyword/phrase matching against the job description and structural parsing
rules — not subjective judgment. This module reproduces that mechanical layer
so the AI's semantic read can be blended with a transparent, explainable score.
"""
import re
from collections import Counter

STOPWORDS = set("""
a an the and or but if while is are was were be been being to of in on at for with as by from up
about into through during before after above below between under again further then once here
there when where why how all any both each few more most other some such no nor not only own
same so than too very can will just don should now this that these those i you he she it we they
them his her its our your their what which who whom we're they're i've you've we've they've i'd
you'd he'd she'd we'd they'd i'll you'll he'll she'll we'll they'll isn't aren't wasn't weren't
hasn't haven't hadn't doesn't don't didn't won't wouldn't shouldn't can't cannot couldn't mustn't
let's that's who's what's here's there's experience years strong excellent ability skills work
team role job position company looking seeking required preferred including etc using used use
year new well also able plus must have within across part time full has ideal candidate requires
require related field building build apply applicants applicant join joining help helping make
made get getting take taking like ensure ensuring provide providing including include
""".split())

WORD_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9+#./-]{1,}")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(\+?\d[\d\-.\s()]{8,}\d)")
BULLET_RE = re.compile(r"(?m)^\s*[•\-\*•]\s+")
SEGMENT_SPLIT_RE = re.compile(r"[,;()\n/]+")
SECTION_HINTS = ["experience", "education", "skills", "summary", "projects", "certifications"]


def _tokenize(text: str) -> list[str]:
    return [w.lower().strip(".,()") for w in WORD_RE.findall(text)]


def _phrase_counts(text: str) -> Counter:
    """Count significant single words and adjacent two-word phrases, skipping stopwords/noise.

    Bigrams are only formed within a comma/newline-delimited segment so that
    list-style JD text ("Docker, AWS, PostgreSQL") doesn't produce phantom
    cross-boundary phrases like "docker aws".
    """
    counts: Counter = Counter()
    for segment in SEGMENT_SPLIT_RE.split(text):
        words = _tokenize(segment)
        for w in words:
            if w not in STOPWORDS and len(w) > 2 and not w.isdigit():
                counts[w] += 1
        for i in range(len(words) - 1):
            a, b = words[i], words[i + 1]
            if a not in STOPWORDS and b not in STOPWORDS and len(a) > 2 and len(b) > 2:
                counts[f"{a} {b}"] += 1
    return counts


def keyword_match(resume_text: str, job_description: str, top_n: int = 15) -> dict:
    """Scan the JD for its most frequent meaningful keywords/phrases and check resume coverage."""
    jd_counts = _phrase_counts(job_description)
    resume_counts = _phrase_counts(resume_text)

    ranked = [kw for kw, _ in jd_counts.most_common(top_n * 3)]

    matched, missing, used_words = [], [], set()
    for kw in ranked:
        if len(matched) + len(missing) >= top_n * 2:
            break
        # Skip a single word already covered by a bigram we picked (avoids redundant entries)
        if " " in kw:
            used_words.update(kw.split(" "))
        elif kw in used_words:
            continue

        resume_count = resume_counts.get(kw, 0)
        if resume_count > 0:
            matched.append({"keyword": kw, "jd_count": jd_counts[kw], "resume_count": resume_count})
        else:
            missing.append({"keyword": kw, "jd_count": jd_counts[kw]})

    total = len(matched) + len(missing)
    coverage_pct = round((len(matched) / total) * 100) if total else 0

    return {
        "matched": matched[:top_n],
        "missing": missing[:top_n],
        "coverage_pct": coverage_pct,
    }


def formatting_compliance(resume_text: str) -> dict:
    """Structural/parsability checks that mirror what real ATS parsers require."""
    issues: list[str] = []
    score = 100
    lower = resume_text.lower()

    if not EMAIL_RE.search(resume_text):
        issues.append("No email address detected — ATS systems often reject resumes without parsable contact info.")
        score -= 20
    if not PHONE_RE.search(resume_text):
        issues.append("No phone number detected.")
        score -= 10

    found_sections = [s for s in SECTION_HINTS if s in lower]
    if len(found_sections) < 2:
        issues.append("Missing standard section headers (Experience, Education, Skills) — ATS parsers rely on these to extract content.")
        score -= 25

    word_count = len(resume_text.split())
    if word_count < 150:
        issues.append("Resume content looks too short for reliable ATS parsing.")
        score -= 20
    elif word_count > 1200:
        issues.append("Resume is unusually long — consider trimming to 1-2 pages.")
        score -= 10

    if len(BULLET_RE.findall(resume_text)) < 3:
        issues.append("Few bullet points detected — ATS-friendly resumes use scannable bullet achievements.")
        score -= 10

    return {"score": max(0, min(100, score)), "issues": issues}
