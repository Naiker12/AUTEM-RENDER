import io
import shutil
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Annotated

import trimesh
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

from autem_api.deps import get_asset_store
from autem_api.domain.enums import AssetKind
from autem_api.storage.local import AssetRecord, LocalAssetStore

router = APIRouter(prefix="/assets", tags=["assets"])
AssetStoreDep = Annotated[LocalAssetStore, Depends(get_asset_store)]

ALLOWED_IMAGE_MIMES = {"image/png", "image/jpeg", "image/webp"}
ALLOWED_MESH_EXTS = {".glb", ".gltf", ".obj", ".stl", ".zip", ".skp"}
MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB (supports 3D meshes and OBJ+MTL+textures ZIPs)


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


def _convert_mesh_File_to_glb(raw_path: Path) -> bytes:
    loaded = trimesh.load(str(raw_path), force="scene")
    scene = loaded if isinstance(loaded, trimesh.Scene) else trimesh.Scene(loaded)
    glb_bytes = scene.export(file_type="glb")
    return glb_bytes if isinstance(glb_bytes, bytes) else bytes(glb_bytes)


@router.get("", response_model=list[AssetOut])
def list_assets(
    store: AssetStoreDep,
    kind: Annotated[str | None, Query()] = None,
) -> list[AssetOut]:
    records = store.list_all()
    if kind:
        records = [r for r in records if r.kind.value == kind]
    return [AssetOut.from_record(rec) for rec in records]


@router.post("", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
async def upload_asset(
    store: AssetStoreDep,
    file: Annotated[UploadFile, File(...)],
) -> AssetOut:
    filename = Path(file.filename or "upload.bin").name
    ext = Path(filename).suffix.lower()
    content_type = file.content_type or "application/octet-stream"

    is_image = content_type in ALLOWED_IMAGE_MIMES or ext in {".png", ".jpg", ".jpeg", ".webp"}
    is_mesh = ext in ALLOWED_MESH_EXTS

    if not is_image and not is_mesh:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Formato no soportado ({filename}). "
                "Usa PNG, JPEG, WebP o modelos 3D GLB, GLTF, OBJ, STL o ZIP (OBJ+MTL)."
            ),
        )

    # Read in bounded chunks to avoid loading oversized uploads into RAM
    chunks: list[bytes] = []
    total_size = 0
    while True:
        chunk = await file.read(65536)
        if not chunk:
            break
        total_size += len(chunk)
        if total_size > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="El archivo supera el límite de 100 MB.",
            )
        chunks.append(chunk)
    data = b"".join(chunks)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archivo vacío.")

    if is_mesh:
        if ext == ".skp":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Para archivos SketchUp (.skp), en SketchUp ve a Archivo → Exportar → "
                    "Modelo 3D y elige formato .GLB o .OBJ para cargarlo con todas sus texturas."
                ),
            )

        if ext == ".glb" and data[:4] != b"glTF":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El archivo .glb no tiene una cabecera binaria glTF válida.",
            )

        if ext == ".zip":
            tmp_dir = Path(tempfile.mkdtemp(prefix="autem_zip_mesh_"))
            try:
                zip_path = tmp_dir / filename
                zip_path.write_bytes(data)
                try:
                    with zipfile.ZipFile(zip_path, "r") as zf:
                        zf.extractall(tmp_dir)
                except zipfile.BadZipFile as exc:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="El archivo ZIP está dañado o no es válido.",
                    ) from exc

                candidates = (
                    list(tmp_dir.rglob("*.glb"))
                    + list(tmp_dir.rglob("*.gltf"))
                    + list(tmp_dir.rglob("*.obj"))
                    + list(tmp_dir.rglob("*.stl"))
                )
                if not candidates:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            "El archivo ZIP no contiene ningún modelo .OBJ, .GLB, .GLTF ni .STL."
                        ),
                    )
                primary_mesh = candidates[0]
                data = _convert_mesh_File_to_glb(primary_mesh)
                filename = f"{Path(filename).stem}.glb"
            finally:
                shutil.rmtree(tmp_dir, ignore_errors=True)

        elif ext in {".obj", ".stl", ".gltf"}:
            tmp_dir = Path(tempfile.mkdtemp(prefix="autem_mesh_conv_"))
            try:
                raw_path = tmp_dir / filename
                raw_path.write_bytes(data)
                data = _convert_mesh_File_to_glb(raw_path)
                filename = f"{Path(filename).stem}.glb"
            finally:
                shutil.rmtree(tmp_dir, ignore_errors=True)

        record = store.save_bytes(
            data=data,
            filename=filename,
            mime="model/gltf-binary",
            kind=AssetKind.MESH,
        )
        return AssetOut.from_record(record)

    # Validate actual image binary content using Pillow (rejects spoofed extensions)
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.verify()
            detected_format = (img.format or "").upper()
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo no es una imagen válida (PNG, JPEG o WebP).",
        ) from exc

    mime_by_format = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}
    if detected_format not in mime_by_format:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Formato de imagen no soportado ({detected_format or 'desconocido'}).",
        )
    mime = mime_by_format[detected_format]
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


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(asset_id: str, store: AssetStoreDep) -> None:
    deleted = store.delete(asset_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")
