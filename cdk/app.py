#!/usr/bin/env python3
import os
import aws_cdk as cdk

from coachsync_infra.coachsync_infra_stack import CoachsyncInfraStack
from coachsync_infra.config import ENVIRONMENTS, get_env_name, standard_tags

app = cdk.App()

env_name = get_env_name(app.node)
env_cfg = ENVIRONMENTS[env_name]

stack = CoachsyncInfraStack(
    app,
    f"CoachsyncInfra-{env_name.capitalize()}",
    env=cdk.Environment(
        account=os.getenv("CDK_DEFAULT_ACCOUNT"),
        region=env_cfg.region,
    ),
)

for key, value in standard_tags(env_name).items():
    cdk.Tags.of(stack).add(key, value)

app.synth()
