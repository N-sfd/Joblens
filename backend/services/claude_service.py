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
        _client = OpenAI(
            api_key=os.getenv("GROQ_API_KEY"),
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
  "keywords_missing": ["<keyword>", "<keyword>", "<keyword>"]
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
  "interview_preparation": ["<tip>", "<tip>", "<tip>"]
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
    return json.loads(response.choices[0].message.content)


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

    return {
        "match_score": overall,
        "likelihood": likelihood,
        "ats_verdict": verdict,
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
