import json
from api.auth import current_user


def handle(event: dict, context) -> dict:
    user = current_user(event)
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({
            "sub": user.sub,
            "email": user.email,
            "groups": user.groups,
            "role": user.role,
        }),
    }
