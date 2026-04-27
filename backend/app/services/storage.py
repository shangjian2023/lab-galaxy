"""MinIO object storage service."""

import io
import uuid

from minio import Minio
from minio.error import S3Error

from app.core.config import settings


def _get_client() -> Minio:
    return Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=False,
    )


def ensure_bucket() -> None:
    client = _get_client()
    if not client.bucket_exists(settings.MINIO_BUCKET):
        client.make_bucket(settings.MINIO_BUCKET)


def upload_file(file_data: bytes, filename: str, content_type: str) -> str:
    """Upload a file to MinIO and return the object key."""
    client = _get_client()
    ensure_bucket()

    ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
    object_key = f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex

    client.put_object(
        settings.MINIO_BUCKET,
        object_key,
        io.BytesIO(file_data),
        length=len(file_data),
        content_type=content_type,
    )
    return object_key


def get_file_url(object_key: str) -> str:
    """Generate a presigned URL for downloading."""
    from datetime import timedelta

    client = _get_client()
    return client.presigned_get_object(settings.MINIO_BUCKET, object_key, expires=timedelta(hours=1))
