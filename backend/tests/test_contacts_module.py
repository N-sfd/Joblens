"""Unified Contacts / Companies module — CRMContact & CRMOrganization reuse."""

from datetime import datetime, timedelta

import pytest

from ats_auth import AtsPrincipal, get_current_ats_user
from main import app
from models import (
    CRMActivity,
    CRMContact,
    CRMOrganization,
    JobRequirement,
    Submission,
)


def _principal(role: str, user_id: str = "user-1") -> AtsPrincipal:
    p = AtsPrincipal(user_id=user_id, claims={})
    p._resolved_role = role
    return p


@pytest.fixture()
def as_role(client, monkeypatch):
    def _set(role: str, user_id: str = "user-1"):
        principal = _principal(role, user_id)
        import ats_auth
        monkeypatch.setattr(ats_auth, "get_current_ats_user", lambda request=None: principal)
        app.dependency_overrides[get_current_ats_user] = lambda: principal
    yield _set
    app.dependency_overrides.pop(get_current_ats_user, None)


_contact_seq = [0]


def make_org(db, **overrides):
    defaults = dict(
        organization_name="Acme Staffing",
        organization_type="Staffing Vendor",
        status="Active",
        created_by="user-1",
    )
    defaults.update(overrides)
    org = CRMOrganization(**defaults)
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def make_contact(db, **overrides):
    _contact_seq[0] += 1
    n = _contact_seq[0]
    defaults = dict(
        first_name="Pat",
        last_name=f"Recruiter{n}",
        email=f"pat{n}@example.com",
        normalized_email=f"pat{n}@example.com",
        contact_type="Recruiter",
        status="Active",
        created_by="user-1",
    )
    defaults.update(overrides)
    if "email" in overrides and "normalized_email" not in overrides:
        em = overrides["email"]
        defaults["normalized_email"] = em.strip().lower() if em else None
    c = CRMContact(**defaults)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def make_job(db, **overrides):
    defaults = dict(job_title="Backend Engineer", status="Open", source="Manual", created_by="user-1")
    defaults.update(overrides)
    job = JobRequirement(**defaults)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def contact_payload(**overrides):
    n = _contact_seq[0] + 5000
    payload = {
        "first_name": "New",
        "last_name": f"Contact{n}",
        "email": f"newcontact{n}@example.com",
        "phone": "5551002000",
        "contact_type": "Recruiter",
        "status": "Active",
    }
    payload.update(overrides)
    return payload


def company_payload(**overrides):
    n = _contact_seq[0] + 9000
    payload = {
        "organization_name": f"Unique Corp {n}",
        "organization_type": "Client",
        "status": "Active",
        "email_domain": f"uniquecorp{n}.com",
    }
    payload.update(overrides)
    return payload


# --- Admin list / pagination / search ---

def test_admin_lists_contacts(client, db_session, as_role):
    as_role("admin")
    make_contact(db_session, created_by="a")
    make_contact(db_session, created_by="b")
    body = client.get("/api/contacts/").json()
    assert body["total"] == 2
    assert "items" in body
    assert "notes" not in body["items"][0]
    assert body["items"][0]["display_name"]
    assert body["items"][0]["contact_type_display"]


def test_alias_and_crm_paths(client, db_session, as_role):
    as_role("admin")
    make_contact(db_session)
    assert client.get("/api/contacts/").json()["total"] == 1
    assert client.get("/api/crm/contacts/").json()["total"] == 1


def test_pagination_and_search(client, db_session, as_role):
    as_role("admin")
    make_contact(db_session, first_name="Alice", last_name="Wonder", email="alice@ex.com", normalized_email="alice@ex.com")
    make_contact(db_session, first_name="Bob", last_name="Builder", email="bob@ex.com", normalized_email="bob@ex.com")
    make_contact(db_session, first_name="Carol", last_name="Clark", email="carol@ex.com", normalized_email="carol@ex.com")
    page = client.get("/api/contacts/", params={"page": 1, "page_size": 2, "sort": "name"}).json()
    assert page["page_size"] == 2
    assert page["total"] == 3
    assert page["total_pages"] == 2
    search = client.get("/api/contacts/", params={"q": "Alice"}).json()
    assert search["total"] == 1
    assert "Alice" in search["items"][0]["display_name"]


def test_contact_type_display_filter(client, db_session, as_role):
    as_role("admin")
    make_contact(db_session, contact_type="Client Manager")
    make_contact(db_session, contact_type="Recruiter")
    res = client.get("/api/contacts/", params={"contact_type": "Client Contact"}).json()
    assert res["total"] == 1
    assert res["items"][0]["contact_type"] == "Client Manager"
    assert res["items"][0]["contact_type_display"] == "Client Contact"


# --- Role scoping ---

def test_recruiter_sees_created_or_job_linked(client, db_session, as_role):
    mine = make_contact(db_session, created_by="recruiter-a", first_name="Mine")
    other = make_contact(db_session, created_by="other", first_name="Other")
    linked = make_contact(db_session, created_by="vendor-side", first_name="Linked")
    make_job(db_session, created_by="recruiter-a", recruiter_contact_id=linked.id, status="Open")
    as_role("recruiter", "recruiter-a")
    body = client.get("/api/contacts/").json()
    ids = {i["id"] for i in body["items"]}
    assert mine.id in ids
    assert linked.id in ids
    assert other.id not in ids


def test_read_only_cannot_mutate(client, db_session, as_role, monkeypatch):
    import ats_auth
    monkeypatch.setattr(ats_auth, "ENFORCE", True)
    as_role("read_only")
    res = client.post("/api/contacts/", json=contact_payload())
    assert res.status_code in (401, 403)


# --- Duplicates ---

def test_email_duplicate_409(client, db_session, as_role):
    as_role("admin")
    make_contact(db_session, email="dup@example.com", normalized_email="dup@example.com")
    res = client.post("/api/contacts/", json=contact_payload(email="dup@example.com"))
    assert res.status_code == 409
    detail = res.json()["detail"]
    assert detail["message"] == "A possible existing contact was found."
    assert detail["matches"][0]["match_reason"] == "email"


def test_check_duplicates_endpoint(client, db_session, as_role):
    as_role("admin")
    make_contact(db_session, email="dup@example.com", normalized_email="dup@example.com")
    res = client.post("/api/contacts/check-duplicates", json={"email": "dup@example.com"})
    assert res.status_code == 200
    assert res.json()["blocked"] is True


def test_admin_force_new_bypasses_duplicate(client, db_session, as_role):
    as_role("admin")
    make_contact(db_session, email="force@example.com", normalized_email="force@example.com")
    # Unique constraint on normalized_email — force_new still cannot insert same normalized_email
    # unless we use a different casing path; force_new only skips app-level 409.
    # Use phone-only duplicate to verify force_new for phone matches.
    existing = make_contact(db_session, email="phoneowner@example.com", phone="5551112222", normalized_email="phoneowner@example.com")
    res = client.post(
        "/api/contacts/?force_new=true",
        json=contact_payload(email="brandnewforce@example.com", phone="(555) 111-2222"),
    )
    assert res.status_code == 201
    assert res.json()["id"] != existing.id


# --- Mark contacted / counts ---

def test_mark_contacted_creates_activity(client, db_session, as_role):
    as_role("admin")
    c = make_contact(db_session)
    res = client.post(f"/api/contacts/{c.id}/mark-contacted", json={
        "method": "email",
        "subject": "Intro email",
        "notes": "Said hello",
    })
    assert res.status_code == 200
    assert res.json()["last_contacted_at"] is not None
    acts = client.get(f"/api/contacts/{c.id}/activities").json()
    assert len(acts) == 1
    assert acts[0]["activity_type"] == "Email Sent"

    # Duplicate within same minute is suppressed
    client.post(f"/api/contacts/{c.id}/mark-contacted", json={
        "method": "email",
        "subject": "Intro email",
    })
    acts2 = client.get(f"/api/contacts/{c.id}/activities").json()
    assert len(acts2) == 1


def test_open_job_and_pipeline_counts(client, db_session, as_role):
    as_role("admin")
    from models import Employee
    emp = Employee(name="Cand", email="cand-counts@ex.com", status="Active")
    db_session.add(emp)
    db_session.commit()
    db_session.refresh(emp)

    c = make_contact(db_session)
    job = make_job(db_session, recruiter_contact_id=c.id, status="Open")
    db_session.add(Submission(
        job_requirement_id=job.id,
        employee_id=emp.id,
        recruiter_contact_id=c.id,
        status="Submitted",
        created_by="user-1",
    ))
    db_session.commit()

    item = client.get("/api/contacts/").json()["items"][0]
    assert item["open_job_count"] >= 1
    assert item["active_pipeline_count"] >= 1


# --- Companies link/unlink ---

def test_company_link_unlink(client, db_session, as_role):
    as_role("admin")
    org = make_org(db_session)
    c = make_contact(db_session, organization_id=None)
    link = client.post(f"/api/companies/{org.id}/contacts", json={"contact_id": c.id})
    assert link.status_code == 200
    assert link.json()["organization_id"] == org.id
    contacts = client.get(f"/api/companies/{org.id}/contacts").json()
    assert len(contacts) == 1
    unlink = client.delete(f"/api/companies/{org.id}/contacts/{c.id}")
    assert unlink.status_code == 200
    db_session.refresh(c)
    assert c.organization_id is None
    # contact still exists
    assert client.get(f"/api/contacts/{c.id}").status_code == 200


def test_company_duplicate_409(client, db_session, as_role):
    as_role("admin")
    make_org(db_session, organization_name="Dup Co", email_domain="dupco.com")
    res = client.post("/api/companies/", json=company_payload(
        organization_name="Other Name",
        email_domain="dupco.com",
    ))
    assert res.status_code == 409
    assert "possible existing company" in res.json()["detail"]["message"].lower()


def test_company_list_counts(client, db_session, as_role):
    as_role("admin")
    org = make_org(db_session)
    make_contact(db_session, organization_id=org.id)
    make_job(db_session, vendor_id=org.id, status="Open")
    body = client.get("/api/companies/").json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["contact_count"] == 1
    assert item["open_job_count"] == 1
    assert "notes" not in item
    assert item["organization_type_display"] == "Vendor"


# --- Archive / delete guards ---

def test_delete_with_history_archives(client, db_session, as_role):
    as_role("admin")
    c = make_contact(db_session)
    make_job(db_session, recruiter_contact_id=c.id, status="Open")
    res = client.delete(f"/api/contacts/{c.id}")
    assert res.status_code == 200
    assert res.json().get("archived") is True
    db_session.refresh(c)
    assert c.status == "Archived"


def test_hard_delete_requires_confirm_no_history(client, db_session, as_role):
    as_role("admin")
    c = make_contact(db_session)
    # without confirm → archive
    res = client.delete(f"/api/contacts/{c.id}")
    assert res.json().get("archived") is True
    db_session.refresh(c)
    assert c.status == "Archived"

    c2 = make_contact(db_session)
    res2 = client.delete(f"/api/contacts/{c2.id}?confirm=true")
    assert res2.status_code == 200
    assert res2.json().get("deleted") is True
    assert client.get(f"/api/contacts/{c2.id}").status_code == 404


def test_status_patch(client, db_session, as_role):
    as_role("admin")
    c = make_contact(db_session)
    res = client.patch(f"/api/contacts/{c.id}/status", json={"status": "Inactive"})
    assert res.status_code == 200
    assert res.json()["status"] == "Inactive"
    assert res.json()["status_display"] == "Inactive"


def test_overdue_follow_up_filter(client, db_session, as_role):
    as_role("admin")
    c = make_contact(db_session)
    db_session.add(CRMActivity(
        activity_type="Follow-Up",
        contact_id=c.id,
        due_date=datetime.utcnow() - timedelta(days=2),
        status="Open",
        created_by="user-1",
    ))
    db_session.commit()
    overdue = client.get("/api/contacts/", params={"overdue_follow_up": True}).json()
    assert overdue["total"] == 1
    assert overdue["items"][0]["follow_up_overdue"] is True
