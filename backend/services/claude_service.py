from openai import OpenAI
import json
import os
from typing import Optional

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
  "match_score": <integer 0-100>,
  "likelihood": "low|medium|high",
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

COVER_LETTER_PROMPT = """\
You are an expert career coach and professional writer. Create a compelling, tailored cover letter.

Resume:
{resume_text}

Job Description:
{job_description}

Company: {company_name}
Tone: {tone}

Write a cover letter that:
- Opens with a strong hook mentioning the specific role
- Highlights 2-3 quantifiable achievements from the resume that match the role
- Addresses key requirements from the job description
- Closes with a confident call to action
- Is 3-4 paragraphs (~300-400 words)
- Matches the requested tone: {tone}

Return ONLY the cover letter text, properly formatted with paragraph breaks."""


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
    return json.loads(response.choices[0].message.content)


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
                ),
            }
        ],
    )
    return response.choices[0].message.content.strip()
