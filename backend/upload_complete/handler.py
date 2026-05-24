import os
from decimal import Decimal
import boto3

_ddb = boto3.resource("dynamodb")


def handler(event, context):
    for record in event.get("Records", []):
        key: str = record["s3"]["object"]["key"]
        size: int = record["s3"]["object"]["size"]

        # key format: videos/{userId}/{videoId}.mov
        parts = key.split("/")
        if len(parts) != 3 or not parts[2]:
            print(f"Skipping unexpected key: {key}")
            continue

        user_id = parts[1]
        video_id = parts[2].rsplit(".", 1)[0]

        _ddb.Table(os.environ["VIDEOS_TABLE"]).update_item(
            Key={"userId": user_id, "videoId": video_id},
            UpdateExpression="SET uploaded = :t, sizeBytes = :sz",
            ExpressionAttributeValues={":t": True, ":sz": Decimal(size)},
        )
        print(f"Marked uploaded: userId={user_id} videoId={video_id} size={size}")
