from enum import StrEnum


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELED = "canceled"


class JobKind(StrEnum):
    RENDER = "render"
    IMAGE_TO_3D = "image_to_3d"
    VIDEO = "video"
    UPSCALE = "upscale"


class AssetKind(StrEnum):
    IMAGE = "image"
    MESH = "mesh"
    VIDEO = "video"
