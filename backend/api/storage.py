import datetime
import os

import boto3
from botocore.config import Config
from botocore.signers import CloudFrontSigner
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

_s3 = None
_ssm = None
_cf_private_key = None  # cached after first SSM fetch


def _s3_client():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3", config=Config(signature_version="s3v4"))
    return _s3


def _ssm_client():
    global _ssm
    if _ssm is None:
        _ssm = boto3.client("ssm")
    return _ssm


def _get_private_key():
    global _cf_private_key
    if _cf_private_key is None:
        resp = _ssm_client().get_parameter(
            Name=os.environ["CF_PRIVATE_KEY_PARAM"],
            WithDecryption=True,
        )
        pem = resp["Parameter"]["Value"].encode()
        _cf_private_key = serialization.load_pem_private_key(pem, password=None)
    return _cf_private_key


def presigned_put(key: str, content_type: str, expires: int = 900) -> str:
    return _s3_client().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": os.environ["VIDEOS_BUCKET"],
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=expires,
    )


def signed_playback_url(s3_key: str, expires_in: int = 3600) -> str:
    key_id = os.environ["CF_KEY_PAIR_ID"]
    domain = os.environ["CLOUDFRONT_DOMAIN"]

    def rsa_signer(message):
        return _get_private_key().sign(message, padding.PKCS1v15(), hashes.SHA1())

    signer = CloudFrontSigner(key_id, rsa_signer)
    url = f"https://{domain}/{s3_key}"
    expire_date = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=expires_in)
    return signer.generate_presigned_url(url, date_less_than=expire_date)
