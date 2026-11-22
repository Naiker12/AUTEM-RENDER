import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from autem_api.deps import get_state_store
from autem_api.storage.sqlite_store import SqliteStateStore

router = APIRouter(prefix="/projects", tags=["projects"])
StateStoreDep = Annotated[SqliteStateStore, Depends(get_state_store)]


class CreateProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ProjectOut(BaseModel):
    id: str
    name: str
    created_at: str


@router.get("", response_model=list[ProjectOut])
def list_projects(db: StateStoreDep) -> list[ProjectOut]:
    rows = db.fetchall("SELECT id, name, created_at FROM projects ORDER BY created_at DESC")
    return [
        ProjectOut(id=str(r["id"]), name=str(r["name"]), created_at=str(r["created_at"]))
        for r in rows
    ]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(payload: CreateProjectRequest, db: StateStoreDep) -> ProjectOut:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nombre vacío.")
    project_id = str(uuid.uuid4())
    created_at = datetime.now(UTC).isoformat()
    db.execute(
        "INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)",
        (project_id, name, created_at),
    )
    return ProjectOut(id=project_id, name=name, created_at=created_at)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, db: StateStoreDep) -> None:
    row = db.fetchone("SELECT id FROM projects WHERE id = ?", (project_id,))
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Proyecto no encontrado."
        )
    db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
