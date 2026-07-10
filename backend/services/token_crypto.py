"""Encrypt/decrypt sensitive tokens at rest (Zoho refresh tokens)."""

import os

from cryptography.fernet import Fernet, InvalidToken


def _fernet() -> Fernet:
    key = (os.getenv("TOKEN_ENCRYPTION_KEY") or "").strip()
    if not key:
        raise ValueError(
            "TOKEN_ENCRYPTION_KEY is not configured. Generate one with: "
            'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_token(plain: str) -> str:
    return _fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_token(cipher: str) -> str:
    try:
        return _fernet().decrypt(cipher.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        raise ValueError("Failed to decrypt stored token. Check TOKEN_ENCRYPTION_KEY.")
