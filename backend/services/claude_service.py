from openai import OpenAI
import json
import os
from typing import Optional
from services.ats_engine import keyword_match, formatting_compliance

_client: Optional[OpenAI] = None
MODEL = "llama-3.3-70b-versatile"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"


def get_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = (os.getenv("GROQ_API_KEY") or "").strip()
        if not api_key:
            raise ValueError(
                "GROQ_API_KEY is not configured. Add it to backend/.env for resume and job parsing."
            )
        _client = OpenAI(
            api_key=api_key,
            base_url=GROQ_BASE_URL,
        )
    return _client


RESUME_ANALYSIS_PROMPT = """\
You are an expert ATS specialist and career coach. Analyze the resume below and return ONLY a JSON object — no markdown, no explanation.

Resume:
{resume_text}

Return this exact JSON structure:
{{
  "ats_score": <integer 0-100>,
  "formatting_score": <integer 0-100>,
  "content_score": <integer 0-100>,
  "overall_summary": "<2-3 sentence summary>",
  "strengths": ["<strength>", "<strength>", "<strength>"],
  "weaknesses": ["<weakness>", "<weakness>", "<weakness>"],
  "skills_identified": {{
    "technical": ["<skill>", "<skill>"],
    "soft": ["<skill>", "<skill>"]
  }},
  "experience_summary": "<paragraph summarizing work experience>",
  "education_summary": "<education details>",
  "recommendations": [
    {{"priority": "high", "suggestion": "<specific actionable suggestion>"}},
    {{"priority": "medium", "suggestion": "<specific actionable suggestion>"}},
    {{"priority": "low", "suggestion": "<specific actionable suggestion>"}}
  ],
  "keywords_missing": ["<keyword>", "<keyword>", "<keyword>"],
  "formatting_suggestions": ["<specific formatting/layout fix, e.g. 'Use bullet points instead of dense paragraphs in Experience'>", "<formatting fix>", "<formatting fix>"]
}}"""

JOB_MATCH_PROMPT = """\
You are an expert career consultant and ATS specialist. Evaluate how well this resume matches the job description. Return ONLY a JSON object — no markdown, no explanation.

Resume:
{resume_text}

Job Description:
{job_description}

Return this exact JSON structure:
{{
  "skills_match_score": <integer 0-100, how well the candidate's hard/soft skills align with the role's required and preferred skills>,
  "experience_match_score": <integer 0-100, how well the candidate's years and type of experience align with the role>,
  "education_match_score": <integer 0-100, how well education/certifications align with stated requirements (100 if none specified)>,
  "summary": "<2-3 sentence summary of fit>",
  "matching_skills": ["<skill>", "<skill>"],
  "missing_skills": ["<skill>", "<skill>"],
  "matching_experience": ["<point>", "<point>"],
  "gaps": ["<gap>", "<gap>"],
  "tailoring_suggestions": [
    {{"section": "<resume section>", "suggestion": "<specific change to make>"}},
    {{"section": "<resume section>", "suggestion": "<specific change to make>"}}
  ],
  "keywords_to_add": ["<keyword>", "<keyword>"],
  "interview_preparation": ["<tip>", "<tip>", "<tip>"],
  "learning_resources": [
    {{"skill": "<one of the missing skills>", "suggestion": "<specific, generic guidance for closing this gap, e.g. 'Take a hands-on course covering X and build a small project with it' — do not invent specific course names or URLs>"}}
  ]
}}"""

TONE_GUIDE = {
    "professional": "Formal and polished. Confident but not boastful. Clear, precise language. No slang.",
    "enthusiastic": "Energetic and passionate. Show genuine excitement about the company and role. Upbeat but still professional.",
    "concise": "Short and punchy. 2-3 tight paragraphs max (~200 words). Every sentence earns its place. No filler.",
    "creative": "Distinctive voice. Open with an unexpected hook or story. Memorable and fresh — avoid clichés like 'I am writing to apply'.",
    "storytelling": "Narrative-driven. Open with a brief personal story or moment that connects to the role. Warm and human.",
}

COVER_LETTER_PROMPT = """\
You are a top-tier career coach and ghostwriter. Write a compelling, highly personalized cover letter.

Resume:
{resume_text}

Job Description:
{job_description}

Company: {company_name}
Requested tone: {tone}
Tone guidance: {tone_guide}

Instructions:
- Start with "Dear Hiring Manager," (or a specific name if found in the JD)
- Opening paragraph: hook that directly references the specific role and company — never start with "I am writing to apply"
- Middle paragraph(s): highlight 2-3 quantifiable achievements from the resume that directly match the JD requirements; weave in specific keywords and technologies from the job description naturally
- Closing paragraph: confident call to action, express genuine interest, include availability for interview
- End with: "Sincerely," followed by a blank line for signature
- Length: match the tone — concise ~200 words, others ~320-380 words
- Strictly match the requested tone throughout
- Do NOT include a date line or address block — just the letter body starting from the salutation

Return ONLY the cover letter text with proper paragraph breaks. No markdown, no explanations."""


async def analyze_resume(resume_text: str) -> dict:
    client = get_client()
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=2048,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": RESUME_ANALYSIS_PROMPT.format(resume_text=resume_text)}],
    )
    data = json.loads(response.choices[0].message.content)
    data.setdefault("formatting_suggestions", [])
    return data


async def match_job(resume_text: str, job_description: str) -> dict:
    client = get_client()
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=2048,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "user",
                "content": JOB_MATCH_PROMPT.format(
                    resume_text=resume_text,
                    job_description=job_description,
                ),
            }
        ],
    )
    llm = json.loads(response.choices[0].message.content)

    skills_score = int(llm.get("skills_match_score", 0))
    experience_score = int(llm.get("experience_match_score", 0))
    education_score = int(llm.get("education_match_score", 0))
    semantic_score = round(skills_score * 0.5 + experience_score * 0.35 + education_score * 0.15)

    keywords = keyword_match(resume_text, job_description)
    formatting = formatting_compliance(resume_text)

    # Weighted like real ATS scanners: exact keyword coverage carries the most
    # weight, semantic fit (LLM judgment) and structural parsability fill the rest.
    overall = round(keywords["coverage_pct"] * 0.45 + semantic_score * 0.35 + formatting["score"] * 0.20)
    overall = max(0, min(100, overall))

    if overall >= 75:
        likelihood, verdict = "high", "Likely to Pass ATS Screen"
    elif overall >= 50:
        likelihood, verdict = "medium", "Borderline — Needs Optimization"
    else:
        likelihood, verdict = "low", "Likely Filtered Out by ATS"

    if overall >= 80:
        recommendation = "Strong Match"
    elif overall >= 60:
        recommendation = "Good Match"
    elif overall >= 40:
        recommendation = "Weak Match"
    else:
        recommendation = "Not Recommended"

    return {
        "match_score": overall,
        "likelihood": likelihood,
        "ats_verdict": verdict,
        "recommendation": recommendation,
        "skills_match_score": skills_score,
        "experience_match_score": experience_score,
        "education_match_score": education_score,
        "keyword_match_score": keywords["coverage_pct"],
        "formatting_score": formatting["score"],
        "formatting_issues": formatting["issues"],
        "keyword_report": {"matched": keywords["matched"], "missing": keywords["missing"]},
        "summary": llm.get("summary", ""),
        "matching_skills": llm.get("matching_skills", []),
        "missing_skills": llm.get("missing_skills", []),
        "matching_experience": llm.get("matching_experience", []),
        "gaps": llm.get("gaps", []),
        "tailoring_suggestions": llm.get("tailoring_suggestions", []),
        "keywords_to_add": llm.get("keywords_to_add", []),
        "interview_preparation": llm.get("interview_preparation", []),
        "learning_resources": llm.get("learning_resources", []),
    }


RESUME_BULLETS_PROMPT = """\
You are a professional resume writer. Based on the resume and job description, generate 6 improved, ATS-optimized bullet points for the most relevant experience section.

Resume:
{resume_text}

Job Description:
{job_description}

Rules for each bullet:
- Start with a strong action verb (Engineered, Led, Reduced, Implemented...)
- Include specific metrics or numbers where possible
- Naturally use keywords from the job description
- Be concise (under 20 words each)

Return ONLY a JSON array — no markdown, no explanation:
["<bullet 1>", "<bullet 2>", "<bullet 3>", "<bullet 4>", "<bullet 5>", "<bullet 6>"]"""

INTERVIEW_QUESTIONS_PROMPT = """\
You are a career coach preparing a candidate for a job interview. Based on the job description and resume, generate 8 likely interview questions with strong suggested answers.

Resume:
{resume_text}

Job Description:
{job_description}

Return ONLY a JSON array — no markdown, no explanation:
[
  {{
    "question": "<interview question>",
    "type": "behavioral|technical|situational",
    "suggested_answer": "<concise 2-4 sentence answer using STAR method or direct expertise>"
  }}
]"""


RESUME_ONLY_BULLETS_PROMPT = """\
You are a professional resume writer. Based on the resume below, rewrite 6 of its weakest or vaguest bullet points into strong, ATS-optimized achievements — without reference to any specific job posting.

Resume:
{resume_text}

Rules for each bullet:
- Start with a strong action verb (Engineered, Led, Reduced, Implemented...)
- Include specific metrics or numbers where possible (estimate plausibly if the original lacks them, framed generally)
- Be concise (under 20 words each)
- Focus on impact and outcomes, not just duties

Return ONLY a JSON array — no markdown, no explanation:
["<bullet 1>", "<bullet 2>", "<bullet 3>", "<bullet 4>", "<bullet 5>", "<bullet 6>"]"""

RESUME_ONLY_INTERVIEW_PROMPT = """\
You are a career coach preparing a candidate for interviews based solely on their resume (no specific job posting yet). Generate 8 likely interview questions a candidate with this background would face, with strong suggested answers.

Resume:
{resume_text}

Return ONLY a JSON array — no markdown, no explanation:
[
  {{
    "question": "<interview question>",
    "type": "behavioral|technical|situational",
    "suggested_answer": "<concise 2-4 sentence answer using STAR method or direct expertise>"
  }}
]"""


async def generate_resume_bullets_generic(resume_text: str) -> list:
    client = get_client()
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=1024,
        response_format={"type": "json_object"},
        messages=[
            {"role": "user", "content": RESUME_ONLY_BULLETS_PROMPT.format(resume_text=resume_text)}
        ],
    )
    data = json.loads(response.choices[0].message.content)
    if isinstance(data, list):
        return data
    return list(data.values())[0] if data else []


async def create_interview_questions_generic(resume_text: str) -> list:
    client = get_client()
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=2048,
        response_format={"type": "json_object"},
        messages=[
            {"role": "user", "content": RESUME_ONLY_INTERVIEW_PROMPT.format(resume_text=resume_text)}
        ],
    )
    data = json.loads(response.choices[0].message.content)
    if isinstance(data, list):
        return data
    return list(data.values())[0] if data else []


async def generate_resume_bullets(resume_text: str, job_description: str) -> list:
    client = get_client()
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=1024,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "user",
                "content": RESUME_BULLETS_PROMPT.format(
                    resume_text=resume_text,
                    job_description=job_description,
                ),
            }
        ],
    )
    data = json.loads(response.choices[0].message.content)
    # Handle both {"bullets": [...]} and [...] response shapes
    if isinstance(data, list):
        return data
    return list(data.values())[0] if data else []


async def create_interview_questions(resume_text: str, job_description: str) -> list:
    client = get_client()
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=2048,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "user",
                "content": INTERVIEW_QUESTIONS_PROMPT.format(
                    resume_text=resume_text,
                    job_description=job_description,
                ),
            }
        ],
    )
    data = json.loads(response.choices[0].message.content)
    if isinstance(data, list):
        return data
    return list(data.values())[0] if data else []


FOLLOW_UP_EMAIL_PROMPT = """\
You are a job-search coach writing a brief, professional follow-up email about a job application. Return ONLY a JSON object — no markdown, no explanation.

Company: {company}
Role: {role}
Recruiter/contact: {recruiter_contact}
Notes about the application: {notes}

Write a polite, concise follow-up email (under 150 words) checking on the status of the application. Reference the role and company naturally. Confident but not pushy. Sign off with "[Your Name]" as a placeholder.

Return this exact JSON structure:
{{
  "subject": "<short email subject line>",
  "body": "<email body with proper paragraph breaks, starting with a greeting>"
}}"""


async def generate_follow_up_email(
    company: str,
    role: str,
    recruiter_contact: str = "",
    notes: str = "",
) -> dict:
    client = get_client()
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=512,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "user",
                "content": FOLLOW_UP_EMAIL_PROMPT.format(
                    company=company,
                    role=role,
                    recruiter_contact=recruiter_contact or "Unknown",
                    notes=notes or "None",
                ),
            }
        ],
    )
    return json.loads(response.choices[0].message.content)


JOB_POSTING_PARSE_PROMPT = """\
You are a job-search assistant helping a candidate quickly log a job they found. Parse the pasted job posting/description below into structured fields for a personal job tracker. Return ONLY a JSON object — no markdown, no explanation.

Raw text:
{raw_text}

Rules:
- Do NOT invent missing information. Return an empty string when a value is not present in the text.
- work_type must be one of "Remote", "Hybrid", "Onsite", or "" if not stated.
- notes should be a concise 2-3 sentence summary of the role's core responsibilities and requirements, useful as a personal reminder.

Return this exact JSON structure (never omit a key):
{{
  "company": "<company/employer name, or ''>",
  "role": "<job title, or ''>",
  "location": "<city/state, 'Remote', or ''>",
  "work_type": "<Remote | Hybrid | Onsite | ''>",
  "salary_range": "<salary/comp range as stated, e.g. '$120k - $150k', or ''>",
  "notes": "<2-3 sentence summary, or ''>"
}}"""


async def parse_job_posting(raw_text: str) -> dict:
    """Parses a pasted job posting/description into JobApplication fields for the job tracker."""
    client = get_client()
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=768,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": JOB_POSTING_PARSE_PROMPT.format(raw_text=raw_text)}],
    )
    data = json.loads(response.choices[0].message.content)
    defaults = {"company": "", "role": "", "location": "", "work_type": "", "salary_range": "", "notes": ""}
    defaults.update(data)
    return defaults


NEGOTIATION_ADVICE_PROMPT = """\
You are an expert salary negotiation coach helping a candidate who just received a job offer. Return ONLY a JSON object — no markdown, no explanation.

Company: {company}
Role: {role}
Offered salary/range: {salary_range}
Notes about the offer/role: {notes}

Give the candidate concrete, actionable negotiation guidance. Return this exact JSON structure:
{{
  "market_context": "<1-2 sentence framing of how to think about this offer and negotiation leverage, generic and realistic — do not invent specific market salary figures>",
  "talking_points": ["<specific, actionable negotiation talking point>", "<talking point>", "<talking point>", "<talking point>", "<talking point>"],
  "counter_offer_email": {{
    "subject": "<short email subject line>",
    "body": "<polite, confident counter-offer or clarifying-questions email body, under 180 words, with proper paragraph breaks, starting with a greeting and signing off with '[Your Name]'>"
  }}
}}"""


async def generate_negotiation_advice(
    company: str,
    role: str,
    salary_range: str = "",
    notes: str = "",
) -> dict:
    client = get_client()
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=1024,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "user",
                "content": NEGOTIATION_ADVICE_PROMPT.format(
                    company=company,
                    role=role,
                    salary_range=salary_range or "Not specified",
                    notes=notes or "None",
                ),
            }
        ],
    )
    return json.loads(response.choices[0].message.content)


EMPLOYEE_RESUME_PARSE_PROMPT = """\
You are an ATS/staffing resume parser. Extract structured details from the resume below for an internal staffing database. Return ONLY a JSON object — no markdown, no explanation.

Resume:
{resume_text}

Rules:
- Do NOT invent or guess missing information.
- Return empty strings, empty arrays, or null when a value is not present in the resume.
- Preserve exact technology names, Oracle modules, software versions, certifications, and client names as written.
- Extract only information actually found in the resume.

Return this exact JSON structure (never omit a key):
{{
  "first_name": "<given name, or ''>",
  "middle_name": "<middle name/initial, or ''>",
  "last_name": "<family name, or ''>",
  "full_name": "<full name as written, or ''>",
  "email": "<candidate email, or ''>",
  "phone": "<candidate phone number, or ''>",
  "current_location": "<current city/state or location, or ''>",
  "current_job_title": "<most recent/current job title, or ''>",
  "primary_skill": "<single strongest/most prominent technical skill, or ''>",
  "secondary_skills": ["<skill>", "<skill>", "..."],
  "total_experience_years": <number of total years of experience as a number, or null>,
  "relevant_experience_years": <number of relevant years for the primary skill as a number, or null>,
  "job_titles": ["<notable job titles held>"],
  "clients": ["<client or employer names mentioned>"],
  "industries": ["<industries worked in, e.g. Healthcare, Banking>"],
  "certifications": ["<certification>", "..."],
  "education": ["<degree, school>", "..."],
  "linkedin_url": "<LinkedIn profile URL if present, or ''>",
  "professional_summary": "<2-3 sentence staffing-focused summary: seniority, core expertise, and the kind of role they're best suited for>"
}}"""


def _coerce_years(value) -> Optional[str]:
    """Normalize an experience-years value to a display string, or None."""
    if value is None or value == "":
        return None
    return str(value)


async def parse_employee_resume(resume_text: str) -> dict:
    """Parses a resume into structured staffing fields (see spec section 5).

    Returns the full structured shape plus legacy aliases (name/skills/
    total_experience/summary) so older callers keep working."""
    client = get_client()
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=1536,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": EMPLOYEE_RESUME_PARSE_PROMPT.format(resume_text=resume_text)}],
    )
    data = json.loads(response.choices[0].message.content)
    defaults = {
        "first_name": "", "middle_name": "", "last_name": "", "full_name": "",
        "email": "", "phone": "", "current_location": "", "current_job_title": "",
        "primary_skill": "", "secondary_skills": [], "total_experience_years": None,
        "relevant_experience_years": None, "job_titles": [], "clients": [],
        "industries": [], "certifications": [], "education": [], "linkedin_url": "",
        "professional_summary": "",
    }
    defaults.update(data)

    # Normalize experience numbers to strings for the (string) employee columns.
    defaults["total_experience_years"] = _coerce_years(defaults.get("total_experience_years"))
    defaults["relevant_experience_years"] = _coerce_years(defaults.get("relevant_experience_years"))

    # Legacy aliases used by existing resume-record columns.
    defaults["name"] = defaults.get("full_name") or " ".join(
        p for p in [defaults.get("first_name"), defaults.get("last_name")] if p
    ).strip()
    defaults["skills"] = defaults.get("secondary_skills") or []
    defaults["total_experience"] = defaults.get("total_experience_years") or ""
    defaults["summary"] = defaults.get("professional_summary") or ""
    return defaults


JOB_REQUIREMENT_PARSE_PROMPT = """\
You are an ATS/staffing assistant parsing a recruiter email or job posting into structured fields. Return ONLY a JSON object — no markdown, no explanation.

Raw text:
{raw_text}

Rules:
- Do NOT invent missing information.
- Return empty strings, empty arrays, or null when a value is not present.
- Do NOT guess client or end_client names unless clearly stated in the text.

Return this exact JSON structure (never omit a key):
{{
  "job_title": "<job title/role>",
  "job_reference_number": "<reference or requisition number if stated>",
  "vendor": "<staffing vendor/agency name that sent this, if any>",
  "recruiter_name": "<recruiter's name>",
  "recruiter_email": "<recruiter's email>",
  "recruiter_phone": "<recruiter's phone number>",
  "client": "<client company name ONLY if explicitly stated>",
  "end_client": "<end client name ONLY if explicitly stated and different from client>",
  "location": "<job location, e.g. city/state or 'Remote'>",
  "work_type": "<Remote | Hybrid | Onsite, or ''>",
  "employment_type": "<W2 | C2C | 1099 | Contract, or ''>",
  "contract_type": "<contract type if stated, or ''>",
  "rate_min": "<minimum rate as number string, or null>",
  "rate_max": "<maximum rate as number string, or null>",
  "rate_currency": "USD",
  "rate_type": "<hourly | annual | daily, or ''>",
  "duration": "<contract duration, e.g. '6 months'>",
  "visa_requirement": "<visa/work authorization requirement as stated>",
  "clearance_requirement": "<security clearance if stated>",
  "required_skills": ["<must-have skill>", "..."],
  "preferred_skills": ["<nice-to-have skill>", "..."],
  "minimum_experience": "<minimum years or experience level>",
  "education_requirement": "<degree or education requirement>",
  "certification_requirement": "<certifications required>",
  "submission_deadline": "<deadline as stated>",
  "number_of_openings": <integer count or null>,
  "submission_instructions": "<how to submit candidates>",
  "application_url": "<direct employer/job-posting application URL (http/https), ONLY if an actual link is present in the text — prefer Greenhouse/Lever/Workday/Ashby apply links over generic careers landing pages>",
  "application_platform": "<leave empty; server classifies>",
  "summary": "<2-3 sentence summary useful for matching against employee profiles>"
}}"""


def _format_rate(parsed: dict) -> str:
    """Build a display rate string from parsed rate fields."""
    if parsed.get("rate"):
        return str(parsed["rate"])
    lo, hi = parsed.get("rate_min"), parsed.get("rate_max")
    currency = parsed.get("rate_currency") or "USD"
    rtype = parsed.get("rate_type") or ""
    suffix = {"hourly": "/hr", "annual": "/yr", "daily": "/day"}.get(rtype.lower(), "")
    sym = "$" if currency == "USD" else f"{currency} "
    if lo and hi and lo != hi:
        return f"{sym}{lo}{suffix} – {sym}{hi}{suffix}"
    if lo:
        return f"{sym}{lo}{suffix}"
    if hi:
        return f"{sym}{hi}{suffix}"
    return ""


async def parse_job_requirement(raw_text: str) -> dict:
    """Parses a pasted recruiter email/job description into structured fields."""
    client = get_client()
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=1536,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": JOB_REQUIREMENT_PARSE_PROMPT.format(raw_text=raw_text)}],
    )
    data = json.loads(response.choices[0].message.content)
    defaults = {
        "job_title": "", "job_reference_number": "", "vendor": "",
        "recruiter_name": "", "recruiter_email": "", "recruiter_phone": "",
        "client": "", "end_client": "", "location": "", "work_type": "",
        "employment_type": "", "contract_type": "",
        "rate_min": None, "rate_max": None, "rate_currency": "USD", "rate_type": "",
        "duration": "", "visa_requirement": "", "clearance_requirement": "",
        "required_skills": [], "preferred_skills": [],
        "minimum_experience": "", "education_requirement": "",
        "certification_requirement": "", "submission_deadline": "",
        "number_of_openings": None, "submission_instructions": "",
        "application_url": "", "summary": "",
    }
    defaults.update(data)
    # Legacy alias for callers expecting a single rate string.
    defaults["rate"] = _format_rate(defaults)
    if defaults.get("rate_min") is not None:
        defaults["rate_min"] = str(defaults["rate_min"])
    if defaults.get("rate_max") is not None:
        defaults["rate_max"] = str(defaults["rate_max"])

    # Phase 5 M0 — normalize / recover application_url and classify platform.
    from services.application_url import prefer_application_url_from_parse
    classified = prefer_application_url_from_parse(
        defaults.get("application_url") or None,
        raw_text,
    )
    if classified.normalized_url:
        defaults["application_url"] = classified.normalized_url
    elif classified.error and not (defaults.get("application_url") or "").strip():
        defaults["application_url"] = ""
    defaults["application_platform"] = classified.platform

    return defaults


async def generate_cover_letter(
    resume_text: str,
    job_description: str,
    company_name: str = "the company",
    tone: str = "professional",
) -> str:
    client = get_client()
    tone_guide = TONE_GUIDE.get(tone, TONE_GUIDE["professional"])
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": COVER_LETTER_PROMPT.format(
                    resume_text=resume_text,
                    job_description=job_description,
                    company_name=company_name,
                    tone=tone,
                    tone_guide=tone_guide,
                ),
            }
        ],
    )
    return response.choices[0].message.content.strip()
