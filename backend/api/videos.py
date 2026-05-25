import json
import os
import time
from datetime import datetime, timezone
from decimal import Decimal

from boto3.dynamodb.conditions import Attr, Key

from api.auth import current_user
from api.db import videos_table
from api.storage import presigned_put, signed_playback_url


def _video_id() -> str:
    ts = int(time.time() * 1000)
    rand = os.urandom(6).hex()
    return f"v_{ts:013x}{rand}"


def _serialize(item: dict) -> dict:
    """Convert DynamoDB Decimal values to int/float for JSON serialisation."""
    out = {}
    for k, v in item.items():
        if isinstance(v, Decimal):
            out[k] = int(v) if v == v.to_integral_value() else float(v)
        else:
            out[k] = v
    return out


def _add_playback_url(item: dict) -> dict:
    if item.get("uploaded") and item.get("s3Key"):
        item["playbackUrl"] = signed_playback_url(item["s3Key"])
    else:
        item["playbackUrl"] = None
    return item


def post_videos(event: dict, context) -> dict:
    user = current_user(event)
    body = json.loads(event.get("body") or "{}")

    exercise = body.get("exercise", "").strip()
    notes = body.get("notes", "").strip()
    session_date = body.get("sessionDate") or datetime.now(timezone.utc).date().isoformat()
    content_type = body.get("contentType", "video/quicktime")

    video_id = _video_id()
    s3_key = f"videos/{user.sub}/{video_id}.mov"
    uploaded_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    videos_table().put_item(Item={
        "userId": user.sub,
        "videoId": video_id,
        "gsiPk": "all",
        "exercise": exercise,
        "notes": notes,
        "sessionDate": session_date,
        "uploadedAt": uploaded_at,
        "uploaded": False,
        "s3Key": s3_key,
        "contentType": content_type,
    })

    upload_url = presigned_put(s3_key, content_type)

    return {
        "statusCode": 201,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({
            "videoId": video_id,
            "uploadUrl": upload_url,
            "expiresIn": 900,
        }),
    }


def get_videos(event: dict, context) -> dict:
    user = current_user(event)

    if user.is_coach():
        # All videos sorted by date descending via the byDate GSI.
        resp = videos_table().query(
            IndexName="byDate",
            KeyConditionExpression=Key("gsiPk").eq("all"),
            ScanIndexForward=False,
        )
    else:
        # Athlete's own videos, newest first.
        resp = videos_table().query(
            KeyConditionExpression=Key("userId").eq(user.sub),
            ScanIndexForward=False,
        )

    items = [_add_playback_url(_serialize(item)) for item in resp.get("Items", [])]

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"items": items}),
    }


def get_video(event: dict, context) -> dict:
    user = current_user(event)
    video_id = event["pathParameters"]["videoId"]

    if user.is_coach():
        # Look up by videoId across the GSI — fine at MVP scale (<100 videos).
        resp = videos_table().query(
            IndexName="byDate",
            KeyConditionExpression=Key("gsiPk").eq("all"),
            FilterExpression=Attr("videoId").eq(video_id),
        )
        items = resp.get("Items", [])
        if not items:
            return {"statusCode": 404, "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"error": "not found"})}
        item = items[0]
    else:
        resp = videos_table().get_item(Key={"userId": user.sub, "videoId": video_id})
        item = resp.get("Item")
        if not item:
            return {"statusCode": 404, "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({"error": "not found"})}

    item = _add_playback_url(_serialize(item))

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(item),
    }
