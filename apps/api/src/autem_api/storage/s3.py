from pathlib import Path
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from autem_api.config import ApiSettings


class S3Storage:
    """S3-compatible storage adapter for MinIO (local), AWS S3, and Cloudflare R2."""

    def __init__(self, settings: ApiSettings) -> None:
        self.bucket = settings.s3_bucket
        self._client: Any = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
            config=Config(signature_version="s3v4"),
        )

    def ensure_bucket(self) -> None:
        try:
            self._client.head_bucket(Bucket=self.bucket)
        except ClientError:
            self._client.create_bucket(Bucket=self.bucket)

    def upload_bytes(self, key: str, data: bytes, content_type: str) -> str:
        self._client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return key

    def upload_file(self, key: str, path: Path, content_type: str) -> str:
        self._client.upload_file(
            Filename=str(path),
            Bucket=self.bucket,
            Key=key,
            ExtraArgs={"ContentType": content_type},
        )
        return key

    def presign_get(self, key: str, expires_in: int = 3600) -> str:
        url: str = self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_in,
        )
        return url

    def presign_put(self, key: str, content_type: str, expires_in: int = 900) -> str:
        url: str = self._client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self.bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=expires_in,
        )
        return url
