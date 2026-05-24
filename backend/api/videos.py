import json
import os
import time
from datetime import datetime, timezone

from api.auth import current_user
from api.db import videos_table
from api.storage import presigned_put


def _video_id() -> str:
    ts = int(time.time() * 1000)
    rand = os.urandom(6).hex()
    return f"v_{ts:013x}{rand}"


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
