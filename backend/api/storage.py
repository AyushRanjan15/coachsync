import os
import boto3
from botocore.config import Config

_s3 = None


def _client():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3", config=Config(signature_version="s3v4"))
    return _s3


def presigned_put(key: str, content_type: str, expires: int = 900) -> str:
    return _client().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": os.environ["VIDEOS_BUCKET"],
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=expires,
    )
