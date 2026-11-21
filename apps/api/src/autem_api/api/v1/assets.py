import tempfile
from datetime import datetime
from pathlib import Path
from typing import Annotated

import trimesh
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from autem_api.deps import get_asset_store
from autem_api.domain.enums import AssetKind
from autem_api.storage.local import AssetRecord, LocalAssetStore

router = APIRouter(prefix="/assets", tags=["assets"])
AssetStoreDep = Annotated[LocalAssetStore, Depends(get_asset_store)]

ALLOWED_IMAGE_MIMES = {"image/png", "image/jpeg", "image/webp"}
ALLOWED_MESH_EXTS = {".glb", ".gltf", ".obj", ".stl"}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB (supports 3D meshes)


class AssetOut(BaseModel):
    id: str
    kind: str
    filename: str
    mime: str
    size: int
    url: str
    created_at: datetime

    @classmethod
    def from_record(cls, rec: AssetRecord) -> "AssetOut":
        return cls(
            id=rec.id,
            kind=rec.kind.value,
            filename=rec.filename,
            mime=rec.mime,
            size=rec.size,
            url=f"/api/v1/assets/{rec.id}/file",
            created_at=rec.created_at,
        )


@router.get("", response_model=list[AssetOut])
def list_assets(
    store: AssetStoreDep,
    kind: Annotated[str | None, Query()] = None,
) -> list[AssetOut]:
    records = store.list_all()
    if kind:
        records = [rec for rec in records if rec.kind.value == kind]
    return [AssetOut.from_record(rec) for rec in records]


@router.post("", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
async def upload_asset(
    store: AssetStoreDep,
    file: Annotated[UploadFile, File(...)],
) -> AssetOut:
    filename = file.filename or "upload.bin"
    ext = Path(filename).suffix.lower()
    content_type = file.content_type or "application/octet-stream"

    is_image = content_type in ALLOWED_IMAGE_MIMES or ext in {".png", ".jpg", ".jpeg", ".webp"}
    is_mesh = ext in ALLOWED_MESH_EXTS

    if not is_image and not is_mesh:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Formato no soportado ({filename}). "
                "Usa PNG, JPEG, WebP o modelos 3D GLB, GLTF, OBJ, STL."
            ),
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archivo vacío.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El archivo supera el límite de 50 MB.",
        )

    if is_mesh:
        # Convert OBJ/STL to GLB on upload so Three.js loads every format uniformly
        if ext in {".obj", ".stl"}:
            tmp_dir = Path(tempfile.mkdtemp(prefix="autem_mesh_conv_"))
            raw_path = tmp_dir / filename
            raw_path.write_bytes(data)
            loaded = trimesh.load(str(raw_path), force="scene")
            scene = loaded if isinstance(loaded, trimesh.Scene) else trimesh.Scene(loaded)
            glb_bytes = scene.export(file_type="glb")
            data = glb_bytes if isinstance(glb_bytes, bytes) else bytes(glb_bytes)
            filename = f"{Path(filename).stem}.glb"
        record = store.save_bytes(
            data=data,
            filename=filename,
            mime="model/gltf-binary",
            kind=AssetKind.MESH,
        )
        return AssetOut.from_record(record)

    mime = content_type if content_type in ALLOWED_IMAGE_MIMES else "image/png"
    record = store.save_bytes(
        data=data,
        filename=filename,
        mime=mime,
        kind=AssetKind.IMAGE,
    )
    return AssetOut.from_record(record)


@router.get("/{asset_id}/file")
def download_asset_file(asset_id: str, store: AssetStoreDep) -> FileResponse:
    record = store.get(asset_id)
    if not record or not record.path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset no encontrado")
    return FileResponse(
        path=record.path,
        media_type=record.mime,
        filename=record.filename,
    )
