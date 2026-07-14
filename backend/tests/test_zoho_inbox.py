"""Zoho Inbox Phase 2: find-or-create CRM linking, link-job, ignore/archive."""

from datetime import datetime

from models import CRMContact, CRMOrganization, ImportedEmail, ZohoConnection


def make_connection(db):
    conn = ZohoConnection(
        user_id="local-dev-user",
        zoho_account_id="acct1",
        mailbox_email="inbox@example.com",
        encrypted_refresh_token="x",
        status="Active",
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return conn


def make_email(db, conn, **overrides):
    defaults = dict(
        zoho_connection_id=conn.id,
        zoho_message_id="msg-1",
        from_address="pat@staffingco.example",
        from_name="Pat Recruiter",
        subject="Senior Backend Engineer opening",
        body_text="We have a Senior Backend Engineer role in Austin, TX. Contact Pat Recruiter.",
        received_at=datetime.utcnow(),
        classification="job_req",
        needs_review=True,
    )
    defaults.update(overrides)
    email = ImportedEmail(**defaults)
    db.add(email)
    db.commit()
    db.refresh(email)
    return email


def make_job_payload(**overrides):
    payload = {
        "job_title": "Senior Backend Engineer",
        "vendor": "Staffing Co",
        "recruiter_name": "Pat Recruiter",
        "recruiter_email": "pat@staffingco.example",
        "recruiter_phone": "555-1234",
        "client": None,
        "job_description": "Build backend services for enterprise clients.",
        "status": "Open",
        "source": "Zoho Mail",
    }
    payload.update(overrides)
    return payload


def test_create_job_from_email_creates_recruiter_and_company(client, db_session):
    conn = make_connection(db_session)
    email = make_email(db_session, conn)

    res = client.post(f"/api/zoho/emails/{email.id}/create-job", json=make_job_payload())
    assert res.status_code == 201
    body = res.json()
    job = body["job"]
    assert job["vendor_id"] is not None
    assert job["recruiter_contact_id"] is not None

    org = db_session.query(CRMOrganization).filter(CRMOrganization.id == job["vendor_id"]).first()
    assert org is not None
    assert org.organization_name == "Staffing Co"
    assert org.source == "Zoho Mail"
    assert org.needs_review is True

    contact = db_session.query(CRMContact).filter(CRMContact.id == job["recruiter_contact_id"]).first()
    assert contact is not None
    assert contact.normalized_email == "pat@staffingco.example"
    assert contact.organization_id == org.id

    db_session.refresh(email)
    assert email.import_status == "imported"
    assert email.job_requirement_id == job["id"]


def test_create_job_from_email_reuses_existing_org_and_contact(client, db_session):
    org = CRMOrganization(organization_name="Staffing Co", organization_type="Staffing Vendor")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    contact = CRMContact(
        organization_id=org.id, first_name="Pat", last_name="Recruiter",
        email="pat@staffingco.example", normalized_email="pat@staffingco.example",
        contact_type="Recruiter",
    )
    db_session.add(contact)
    db_session.commit()
    db_session.refresh(contact)

    conn = make_connection(db_session)
    email = make_email(db_session, conn)
    res = client.post(f"/api/zoho/emails/{email.id}/create-job", json=make_job_payload())
    assert res.status_code == 201
    job = res.json()["job"]
    assert job["vendor_id"] == org.id
    assert job["recruiter_contact_id"] == contact.id

    assert db_session.query(CRMOrganization).count() == 1
    assert db_session.query(CRMContact).count() == 1


def test_create_job_from_email_twice_returns_409(client, db_session):
    conn = make_connection(db_session)
    email = make_email(db_session, conn)
    first = client.post(f"/api/zoho/emails/{email.id}/create-job", json=make_job_payload())
    assert first.status_code == 201
    second = client.post(f"/api/zoho/emails/{email.id}/create-job", json=make_job_payload())
    assert second.status_code == 409


def test_link_email_to_existing_job(client, db_session):
    conn = make_connection(db_session)
    source_email = make_email(db_session, conn, zoho_message_id="msg-source")
    create_res = client.post(f"/api/zoho/emails/{source_email.id}/create-job", json=make_job_payload())
    job_id = create_res.json()["job"]["id"]

    other_email = make_email(db_session, conn, zoho_message_id="msg-other", subject="Re: same role")
    link_res = client.post(f"/api/zoho/emails/{other_email.id}/link-job", json={"job_requirement_id": job_id})
    assert link_res.status_code == 200
    body = link_res.json()
    assert body["email"]["job_requirement_id"] == job_id
    assert body["email"]["import_status"] == "linked"

    # Re-linking to a *different* job is rejected.
    another_email = make_email(db_session, conn, zoho_message_id="msg-third")
    other_job_res = client.post(
        f"/api/zoho/emails/{another_email.id}/create-job",
        json=make_job_payload(job_title="Different Role", recruiter_email="other@vendor.example"),
    )
    other_job_id = other_job_res.json()["job"]["id"]
    conflict = client.post(f"/api/zoho/emails/{other_email.id}/link-job", json={"job_requirement_id": other_job_id})
    assert conflict.status_code == 409


def test_link_email_to_missing_job_404(client, db_session):
    conn = make_connection(db_session)
    email = make_email(db_session, conn)
    res = client.post(f"/api/zoho/emails/{email.id}/link-job", json={"job_requirement_id": 999999})
    assert res.status_code == 404


def test_ignore_and_archive_set_import_status(client, db_session):
    conn = make_connection(db_session)
    email1 = make_email(db_session, conn, zoho_message_id="msg-ignore")
    email2 = make_email(db_session, conn, zoho_message_id="msg-archive")

    ignore_res = client.post(f"/api/zoho/emails/{email1.id}/ignore")
    assert ignore_res.status_code == 200
    assert ignore_res.json()["import_status"] == "ignored"
    assert ignore_res.json()["needs_review"] is False

    archive_res = client.post(f"/api/zoho/emails/{email2.id}/archive")
    assert archive_res.status_code == 200
    assert archive_res.json()["import_status"] == "archived"


def test_list_emails_include_preview_and_import_status(client, db_session):
    conn = make_connection(db_session)
    make_email(db_session, conn, zoho_message_id="msg-list", body_text="A" * 300)
    res = client.get("/api/zoho/emails")
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["import_status"] == "pending"
    assert rows[0]["preview"] is not None
    assert len(rows[0]["preview"]) <= 161  # 160 chars + ellipsis


def test_list_emails_filter_by_import_status(client, db_session):
    conn = make_connection(db_session)
    email = make_email(db_session, conn, zoho_message_id="msg-filter")
    client.post(f"/api/zoho/emails/{email.id}/archive")

    archived = client.get("/api/zoho/emails", params={"import_status": "archived"})
    assert archived.status_code == 200
    assert len(archived.json()) == 1

    pending = client.get("/api/zoho/emails", params={"import_status": "pending"})
    assert pending.status_code == 200
    assert len(pending.json()) == 0
