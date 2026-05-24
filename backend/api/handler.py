import json
from api import me as me_mod
from api import videos as videos_mod

_ROUTES = {
    "GET /me": me_mod.handle,
    "POST /videos": videos_mod.post_videos,
}

_JSON = {"Content-Type": "application/json"}


def _respond(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": _JSON, "body": json.dumps(body)}


def handler(event: dict, context) -> dict:
    route_key = event.get("routeKey", "")

    if route_key == "GET /":
        return _respond(200, {"status": "ok"})

    fn = _ROUTES.get(route_key)
    if fn is None:
        return _respond(404, {"error": "not found"})

    try:
        return fn(event, context)
    except PermissionError as exc:
        return _respond(403, {"error": str(exc)})
    except Exception as exc:
        print(f"unhandled error on {route_key}: {exc}")
        return _respond(500, {"error": "internal server error"})
