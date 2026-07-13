"""Profile completeness, ownership, and sensitive-answer defaults."""

from models import Profile, ResumeAnalysis, ApplicationAnswer
from auth import hash_password, create_access_token, COOKIE_NAME
from models import User


def _signup(client, email="prof@example.com", password="password123", name="Pat Seeker"):
    r = client.post("/api/auth/signup", json={"email": email, "password": password, "name": name})
    assert r.status_code == 201, r.text
    return r.json()


def test_profile_get_and_update_completeness(auth_client, auth_user, db_session):
    empty = auth_client.get("/api/profile/")
    assert empty.status_code == 200, empty.text
    body = empty.json()
    assert body["email"] == auth_user.email
    assert body["email_editable"] is False
    assert body["completeness"]["overall_percentage"] < 100

    updated = auth_client.put("/api/profile/", json={
        "full_name": "Pat Seeker",
        "phone": "555-0100",
        "city": "Austin",
        "country": "US",
        "current_location": "Austin, TX",
        "headline": "Engineer",
        "bio": "Builds systems.",
        "skills": ["Python", "SQL"],
        "experience": [{"title": "Engineer", "company": "Acme", "start": "2020"}],
        "education": [{"school": "State U", "degree": "BS"}],
        "professional_links": {"linkedin": "https://linkedin.com/in/pat"},
        "work_authorization": {
            "applying_country": "US",
            "current_authorization": "Citizen",
            "sponsorship_required_now": False,
            "user_confirmed": True,
        },
        "job_preferences": {
            "preferred_titles": ["Backend Engineer"],
            "work_arrangement": "remote",
            "employment_types": ["Full-time"],
        },
    })
    assert updated.status_code == 200, updated.text
    data = updated.json()
    assert data["completeness"]["overall_percentage"] >= 70
    assert "personal" in data["completeness"]["completed_sections"]

    # Removing phone decreases completeness
    down = auth_client.put("/api/profile/", json={"phone": ""})
    assert down.status_code == 200
    assert down.json()["completeness"]["overall_percentage"] < data["completeness"]["overall_percentage"]


def test_sensitive_answer_defaults_to_always_ask(auth_client):
    r = auth_client.post("/api/profile/answers", json={
        "normalized_question_key": "salary_expectation",
        "display_question": "Salary expectation",
        "answer": "150000",
        "reuse_policy": "reuse_automatically",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["is_sensitive"] is True
    assert body["reuse_policy"] == "always_ask"


def test_other_user_cannot_access_answers(client, db_session, auth_user):
    # Create answer as auth_user via direct DB, then try as other user
    db_session.add(ApplicationAnswer(
        user_id=auth_user.id,
        normalized_question_key="why_interested",
        display_question="Why?",
        answer="Growth",
        answer_type="text",
        is_sensitive=False,
        approval_status="approved",
        reuse_policy="reuse_after_review",
    ))
    other = User(email="other@example.com", password_hash=hash_password("password123"), name="Other")
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)

    client.cookies.set(COOKIE_NAME, create_access_token(other.id))
    answers = client.get("/api/profile/answers")
    assert answers.status_code == 200
    assert answers.json() == []


def test_invalid_professional_link_rejected(auth_client):
    r = auth_client.put("/api/profile/", json={
        "professional_links": {"linkedin": "not-a-url"},
    })
    assert r.status_code == 422


def test_profile_not_on_public_jobs(client, db_session, guest_headers, auth_user):
    from conftest import make_published_job
    job = make_published_job(db_session)
    db_session.add(Profile(
        user_id=auth_user.id,
        phone="555-9999",
        work_authorization_json='{"current_authorization":"H1B","user_confirmed":true}',
    ))
    db_session.commit()
    listing = client.get(f"/api/integrations/joblens/jobs/{job.id}", headers=guest_headers)
    assert listing.status_code == 200
    text = listing.text.lower()
    assert "555-9999" not in text
    assert "h1b" not in text
    assert "work_authorization" not in text
