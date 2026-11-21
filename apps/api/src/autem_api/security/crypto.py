import base64
import hashlib
import hmac
import os
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from cryptography.fernet import Fernet


def hash_password(password: str) -> str:
    """Hash a password with scrypt (Python stdlib, strong memory-hard KDF)."""
    salt = os.urandom(16)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    salt_b64 = base64.b64encode(salt).decode("ascii")
    derived_b64 = base64.b64encode(derived).decode("ascii")
    return f"scrypt${salt_b64}${derived_b64}"


def verify_password(password: str, stored_hash: str) -> bool:
    parts = stored_hash.split("$")
    if len(parts) != 3 or parts[0] != "scrypt":
        return False
    salt = base64.b64decode(parts[1])
    expected = base64.b64decode(parts[2])
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return hmac.compare_digest(derived, expected)


def create_access_token(
    user_id: str,
    email: str,
    secret: str,
    expire_minutes: int = 60 * 24 * 7,
) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": user_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expire_minutes)).timestamp()),
    }
    return str(jwt.encode(payload, secret, algorithm="HS256"))


def decode_access_token(token: str, secret: str) -> dict[str, Any]:
    decoded: dict[str, Any] = jwt.decode(token, secret, algorithms=["HS256"])
    return decoded


def _fernet_from_secret(secret: str) -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_provider_key(plain_key: str, secret: str) -> str:
    return _fernet_from_secret(secret).encrypt(plain_key.encode("utf-8")).decode("ascii")


def decrypt_provider_key(token: str, secret: str) -> str:
    return _fernet_from_secret(secret).decrypt(token.encode("ascii")).decode("utf-8")
