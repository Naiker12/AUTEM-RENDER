import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from autem_api.config import get_api_settings
from autem_api.deps import get_state_store
from autem_api.security.crypto import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from autem_api.storage.sqlite_store import SqliteStateStore

router = APIRouter(prefix="/auth", tags=["auth"])
bearer_scheme = HTTPBearer(auto_error=False)
StateStoreDep = Annotated[SqliteStateStore, Depends(get_state_store)]


class RegisterRequest(BaseModel):
    email: str = Field(min_length=4, max_length=200)
    name: str = Field(default="Arquitecto", min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    created_at: str


class AuthTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


@router.post("/register", response_model=AuthTokenOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: StateStoreDep) -> AuthTokenOut:
    email = payload.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email inválido.")

    existing = db.fetchone("SELECT id FROM users WHERE email = ?", (email,))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una cuenta registrada con ese correo.",
        )

    user_id = str(uuid.uuid4())
    created_at = datetime.now(UTC).isoformat()
    db.execute(
        "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, email, payload.name.strip(), hash_password(payload.password), created_at),
    )

    settings = get_api_settings()
    token = create_access_token(
        user_id=user_id,
        email=email,
        secret=settings.jwt_secret,
        expire_minutes=settings.jwt_expire_minutes,
    )
    return AuthTokenOut(
        access_token=token,
        user=UserOut(id=user_id, email=email, name=payload.name.strip(), created_at=created_at),
    )


@router.post("/login", response_model=AuthTokenOut)
def login(payload: LoginRequest, db: StateStoreDep) -> AuthTokenOut:
    email = payload.email.strip().lower()
    row = db.fetchone("SELECT * FROM users WHERE email = ?", (email,))
    if not row or not verify_password(payload.password, str(row["password_hash"])):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas.",
        )

    settings = get_api_settings()
    token = create_access_token(
        user_id=str(row["id"]),
        email=email,
        secret=settings.jwt_secret,
        expire_minutes=settings.jwt_expire_minutes,
    )
    return AuthTokenOut(
        access_token=token,
        user=UserOut(
            id=str(row["id"]),
            email=str(row["email"]),
            name=str(row["name"]),
            created_at=str(row["created_at"]),
        ),
    )


@router.get("/me", response_model=UserOut)
def me(
    db: StateStoreDep,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
) -> UserOut:
    if not creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token Bearer requerido.",
        )
    settings = get_api_settings()
    try:
        claims = decode_access_token(creds.credentials, settings.jwt_secret)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado.",
        ) from exc

    row = db.fetchone("SELECT * FROM users WHERE id = ?", (str(claims["sub"]),))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado.")
    return UserOut(
        id=str(row["id"]),
        email=str(row["email"]),
        name=str(row["name"]),
        created_at=str(row["created_at"]),
    )
