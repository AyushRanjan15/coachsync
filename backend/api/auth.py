from __future__ import annotations
import json
from dataclasses import dataclass


@dataclass(frozen=True)
class User:
    sub: str
    email: str
    groups: list[str]

    @property
    def role(self) -> str:
        return "coach" if "coaches" in self.groups else "athlete"

    def is_coach(self) -> bool:
        return "coaches" in self.groups


def _parse_groups(raw) -> list[str]:
    """Cognito groups arrive as a comma-string or JSON array depending on API GW version."""
    if not raw:
        return []
    if isinstance(raw, list):
        return [str(g) for g in raw]
    raw = str(raw).strip()
    if raw.startswith("["):
        try:
            return json.loads(raw)
        except Exception:
            pass
    return [g.strip() for g in raw.split(",") if g.strip()]


def current_user(event: dict) -> User:
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    return User(
        sub=claims["sub"],
        email=claims.get("email", ""),
        groups=_parse_groups(claims.get("cognito:groups")),
    )


def require_coach(user: User) -> None:
    if not user.is_coach():
        raise PermissionError("coach role required")
