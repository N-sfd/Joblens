"""Zoho OAuth + Mail API client."""

from __future__ import annotations

import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from models import ZohoConnection
from services.token_crypto import decrypt_token, encrypt_token

ZOHO_SCOPES = "ZohoMail.messages.READ,ZohoMail.accounts.READ,ZohoMail.folders.READ"


class ZohoConfigError(Exception):
    pass


class ZohoApiError(Exception):
    pass


def _zoho_env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _accounts_base_url() -> str:
    return _zoho_env("ZOHO_ACCOUNTS_BASE_URL", "https://accounts.zoho.com").rstrip("/")


def _mail_base_url() -> str:
    return _zoho_env("ZOHO_MAIL_API_BASE_URL", "https://mail.zoho.com").rstrip("/")


def _require_config() -> None:
    missing = []
    if not _zoho_env("ZOHO_CLIENT_ID"):
        missing.append("ZOHO_CLIENT_ID")
    if not _zoho_env("ZOHO_CLIENT_SECRET"):
        missing.append("ZOHO_CLIENT_SECRET")
    if not _zoho_env("ZOHO_REDIRECT_URI"):
        missing.append("ZOHO_REDIRECT_URI")
    if missing:
        raise ZohoConfigError(f"Missing Zoho configuration: {', '.join(missing)}")


def build_authorize_url(state: str) -> str:
    _require_config()
    params = urllib.parse.urlencode({
        "response_type": "code",
        "client_id": _zoho_env("ZOHO_CLIENT_ID"),
        "scope": ZOHO_SCOPES,
        "redirect_uri": _zoho_env("ZOHO_REDIRECT_URI"),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    })
    return f"{_accounts_base_url()}/oauth/v2/auth?{params}"


def _post_form(url: str, data: dict[str, str]) -> dict[str, Any]:
    body = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/x-www-form-urlencoded",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise ZohoApiError(f"Zoho token request failed ({e.code}): {detail}") from e


def exchange_code_for_tokens(code: str) -> dict[str, Any]:
    _require_config()
    payload = _post_form(f"{_accounts_base_url()}/oauth/v2/token", {
        "grant_type": "authorization_code",
        "client_id": _zoho_env("ZOHO_CLIENT_ID"),
        "client_secret": _zoho_env("ZOHO_CLIENT_SECRET"),
        "redirect_uri": _zoho_env("ZOHO_REDIRECT_URI"),
        "code": code,
    })
    if "error" in payload:
        raise ZohoApiError(payload.get("error_description") or payload["error"])
    return payload


def refresh_access_token(refresh_token: str, accounts_base: Optional[str] = None) -> dict[str, Any]:
    _require_config()
    base = (accounts_base or _accounts_base_url()).rstrip("/")
    payload = _post_form(f"{base}/oauth/v2/token", {
        "grant_type": "refresh_token",
        "client_id": _zoho_env("ZOHO_CLIENT_ID"),
        "client_secret": _zoho_env("ZOHO_CLIENT_SECRET"),
        "refresh_token": refresh_token,
    })
    if "error" in payload:
        raise ZohoApiError(payload.get("error_description") or payload["error"])
    return payload


def _mail_base(conn: ZohoConnection) -> str:
    # OAuth `api_domain` (e.g. www.zohoapis.com) is for CRM/Desk APIs — not Zoho Mail.
    return _mail_base_url()


def _accounts_base(conn: ZohoConnection) -> str:
    return _accounts_base_url()


def _api_get(conn: ZohoConnection, path: str, access_token: str) -> dict[str, Any]:
    base = _mail_base(conn)
    url = f"{base}{path}"
    req = urllib.request.Request(url, method="GET", headers={
        "Accept": "application/json",
        "Authorization": f"Zoho-oauthtoken {access_token}",
    })
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise ZohoApiError(f"Zoho Mail API failed ({e.code}): {detail}") from e


def ensure_access_token(db: Session, conn: ZohoConnection) -> str:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if conn.access_token and conn.token_expires_at and conn.token_expires_at > now + timedelta(seconds=60):
        return conn.access_token

    if not conn.encrypted_refresh_token:
        raise ZohoApiError("No refresh token stored for this connection.")

    refresh = decrypt_token(conn.encrypted_refresh_token)
    payload = refresh_access_token(refresh, _accounts_base(conn))
    conn.access_token = payload["access_token"]
    expires_in = int(payload.get("expires_in", 3600))
    conn.token_expires_at = now + timedelta(seconds=expires_in)
    if payload.get("api_domain"):
        conn.api_domain = payload["api_domain"]
    conn.status = "Active"
    conn.last_error = None
    db.commit()
    db.refresh(conn)
    return conn.access_token


def fetch_primary_account(conn: ZohoConnection, access_token: str) -> dict[str, Any]:
    data = _api_get(conn, "/api/accounts", access_token)
    accounts = data.get("data") or []
    if not accounts:
        raise ZohoApiError("No Zoho Mail accounts found for this user.")
    # Prefer ZOHO_ACCOUNT type with primary email
    for acct in accounts:
        if acct.get("type") == "ZOHO_ACCOUNT":
            return acct
    return accounts[0]


def fetch_inbox_folder_id(conn: ZohoConnection, access_token: str, account_id: str) -> str:
    data = _api_get(conn, f"/api/accounts/{account_id}/folders", access_token)
    folders = data.get("data") or []
    for folder in folders:
        if folder.get("folderType") == "Inbox" or folder.get("folderName") == "Inbox":
            return str(folder["folderId"])
    raise ZohoApiError("Inbox folder not found in Zoho Mail.")


def list_inbox_messages(
    conn: ZohoConnection,
    access_token: str,
    account_id: str,
    folder_id: str,
    *,
    start: int = 1,
    limit: int = 50,
) -> list[dict[str, Any]]:
    qs = urllib.parse.urlencode({"folderId": folder_id, "start": start, "limit": limit, "status": "all"})
    data = _api_get(conn, f"/api/accounts/{account_id}/messages/view?{qs}", access_token)
    return data.get("data") or []


def fetch_message_content(
    conn: ZohoConnection,
    access_token: str,
    account_id: str,
    message_id: str,
) -> dict[str, Any]:
    data = _api_get(conn, f"/api/accounts/{account_id}/messages/{message_id}/content", access_token)
    items = data.get("data") or {}
    if isinstance(items, list):
        return items[0] if items else {}
    return items


def new_oauth_state() -> str:
    return secrets.token_urlsafe(32)
