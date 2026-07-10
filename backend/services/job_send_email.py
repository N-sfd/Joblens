"""Build email drafts for sending job opportunities to employees."""

from __future__ import annotations

from models import Employee, JobRequirement


def _employee_display_name(employee: Employee) -> str:
    if employee.first_name or employee.last_name:
        return " ".join(p for p in [employee.first_name, employee.last_name] if p).strip()
    return employee.name or "there"


def _rate_display(job: JobRequirement) -> str | None:
    if job.rate:
        return job.rate
    if job.rate_min and job.rate_max:
        return f"{job.rate_min}–{job.rate_max}"
    return job.rate_min or job.rate_max


def build_job_send_email(
    job: JobRequirement,
    employee: Employee,
    *,
    match_score: int | None = None,
    match_reason: str | None = None,
) -> tuple[str, str]:
    """Return (subject, body) for manual review before sending."""
    name = _employee_display_name(employee)
    subject = f"New Opportunity: {job.job_title}"

    lines = [
        f"Hi {name},",
        "",
        "We identified a new job opportunity that may be a good fit for your background.",
        "",
        f"Position: {job.job_title}",
    ]
    if job.client or job.end_client:
        lines.append(f"Client: {job.client or job.end_client}")
    if job.location or job.work_type:
        loc = ", ".join(p for p in [job.location, job.work_type] if p)
        lines.append(f"Location: {loc}")
    rate = _rate_display(job)
    if rate:
        lines.append(f"Rate: {rate}")
    if job.duration:
        lines.append(f"Duration: {job.duration}")
    if job.visa_requirement:
        lines.append(f"Work authorization: {job.visa_requirement}")

    if match_score is not None:
        lines.extend(["", f"Internal match score: {match_score}%"])
        if match_reason:
            lines.append(f"Match notes: {match_reason}")

    if job.job_description:
        lines.extend(["", "Job summary:", job.job_description[:1500]])

    lines.extend([
        "",
        "Please reply and let us know if you are interested, need more details, or are not available.",
        "",
        "Thank you,",
        "Consult America Recruiting Team",
    ])

    return subject, "\n".join(lines)
