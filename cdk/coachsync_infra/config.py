from dataclasses import dataclass
from aws_cdk import RemovalPolicy

PROJECT = "coachsync"

_VALID_ENVS = ("dev", "staging", "prod")


@dataclass(frozen=True)
class EnvConfig:
    region: str
    # Applied to S3 and DynamoDB — protects video/comment data in prod.
    data_removal_policy: RemovalPolicy
    # Cognito: DESTROY in both envs; re-adding 2 MVP users via console is trivial.
    cognito_removal_policy: RemovalPolicy


ENVIRONMENTS: dict[str, EnvConfig] = {
    "dev": EnvConfig(
        region="ap-southeast-2",
        data_removal_policy=RemovalPolicy.DESTROY,
        cognito_removal_policy=RemovalPolicy.DESTROY,
    ),
    "staging": EnvConfig(
        region="ap-southeast-2",
        data_removal_policy=RemovalPolicy.RETAIN,
        cognito_removal_policy=RemovalPolicy.DESTROY,
    ),
    "prod": EnvConfig(
        region="ap-southeast-2",
        data_removal_policy=RemovalPolicy.RETAIN,
        cognito_removal_policy=RemovalPolicy.DESTROY,
    ),
}


def get_env_name(node) -> str:
    """Read 'env' from CDK context (--context env=prod). Defaults to 'dev'."""
    env = node.try_get_context("env") or "dev"
    if env not in _VALID_ENVS:
        raise ValueError(f"Unknown env '{env}'. Valid options: {_VALID_ENVS}")
    return env


def resource_name(env: str, *parts: str) -> str:
    """Produce a consistent resource name: coachsync-{env}-{parts...}."""
    return "-".join([PROJECT, env, *parts])


def standard_tags(env: str) -> dict[str, str]:
    return {"Project": PROJECT, "Env": env, "ManagedBy": "cdk"}
