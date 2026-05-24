from aws_cdk import (
    Stack,
    CfnOutput,
    aws_cognito as cognito,
    aws_s3 as s3,
    aws_dynamodb as dynamodb,
    aws_lambda as lambda_,
    aws_apigatewayv2 as apigwv2,
    aws_iam as iam,
)
from constructs import Construct

from coachsync_infra.config import ENVIRONMENTS, get_env_name, resource_name


class CoachsyncInfraStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        env_name = get_env_name(self.node)
        env_cfg = ENVIRONMENTS[env_name]

        # ── Cognito ────────────────────────────────────────────────────────

        user_pool = cognito.UserPool(
            self, "UserPool",
            user_pool_name=resource_name(env_name, "users"),
            self_sign_up_enabled=False,
            sign_in_aliases=cognito.SignInAliases(email=True),
            password_policy=cognito.PasswordPolicy(
                min_length=8,
                require_lowercase=True,
                require_uppercase=True,
                require_digits=True,
                require_symbols=False,
            ),
            removal_policy=env_cfg.cognito_removal_policy,
        )

        user_pool_client = cognito.UserPoolClient(
            self, "UserPoolClient",
            user_pool=user_pool,
            auth_flows=cognito.AuthFlow(user_password=True, user_srp=True),
            generate_secret=False,
        )

        cognito.CfnUserPoolGroup(
            self, "AthleteGroup",
            user_pool_id=user_pool.user_pool_id,
            group_name="athletes",
        )

        cognito.CfnUserPoolGroup(
            self, "CoachGroup",
            user_pool_id=user_pool.user_pool_id,
            group_name="coaches",
        )

        # ── S3 Videos Bucket ───────────────────────────────────────────────

        videos_bucket = s3.Bucket(
            self, "VideosBucket",
            versioned=True,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=env_cfg.data_removal_policy,
            cors=[
                s3.CorsRule(
                    # Presigned PUT URLs are the security boundary; S3 CORS
                    # allows any origin so the mobile app can upload directly.
                    allowed_methods=[s3.HttpMethods.PUT],
                    allowed_origins=["*"],
                    allowed_headers=["*"],
                    max_age=3000,
                )
            ],
        )

        # ── DynamoDB Tables ────────────────────────────────────────────────

        videos_table = dynamodb.Table(
            self, "VideosTable",
            table_name=resource_name(env_name, "videos"),
            partition_key=dynamodb.Attribute(name="userId", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="videoId", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True,
            ),
            removal_policy=env_cfg.data_removal_policy,
        )

        # GSI for coach "all videos" feed.  Every video row sets gsiPk="all".
        # Static partition key is fine at <100 videos/year.
        videos_table.add_global_secondary_index(
            index_name="byDate",
            partition_key=dynamodb.Attribute(name="gsiPk", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="uploadedAt", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        comments_table = dynamodb.Table(
            self, "CommentsTable",
            table_name=resource_name(env_name, "comments"),
            partition_key=dynamodb.Attribute(name="videoId", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="commentId", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True,
            ),
            removal_policy=env_cfg.data_removal_policy,
        )

        # ── Hello-World Lambda ─────────────────────────────────────────────
        # Placeholder until real handlers are wired up in Phase 2.

        hello_fn = lambda_.Function(
            self, "HelloFunction",
            function_name=resource_name(env_name, "hello"),
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="index.handler",
            code=lambda_.Code.from_inline(
                "def handler(event, context):\n"
                "    return {'statusCode': 200, 'body': 'CoachSync API up'}\n"
            ),
        )

        # ── HTTP API ───────────────────────────────────────────────────────
        # Using L1 (Cfn*) constructs to avoid pinning alpha packages.

        http_api = apigwv2.CfnApi(
            self, "HttpApi",
            name=resource_name(env_name, "api"),
            protocol_type="HTTP",
            cors_configuration=apigwv2.CfnApi.CorsProperty(
                allow_origins=["*"],
                allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                allow_headers=["Authorization", "Content-Type"],
                max_age=300,
            ),
        )

        # JWT authorizer — validates Cognito-issued tokens on every real route.
        issuer = (
            f"https://cognito-idp.{self.region}.amazonaws.com/{user_pool.user_pool_id}"
        )
        jwt_authorizer = apigwv2.CfnAuthorizer(
            self, "JwtAuthorizer",
            api_id=http_api.ref,
            authorizer_type="JWT",
            name="cognito-jwt",
            identity_source=["$request.header.Authorization"],
            jwt_configuration=apigwv2.CfnAuthorizer.JWTConfigurationProperty(
                audience=[user_pool_client.user_pool_client_id],
                issuer=issuer,
            ),
        )

        hello_integration = apigwv2.CfnIntegration(
            self, "HelloIntegration",
            api_id=http_api.ref,
            integration_type="AWS_PROXY",
            integration_uri=hello_fn.function_arn,
            payload_format_version="2.0",
        )

        # Unauthenticated health-check route — useful for smoke-testing the
        # deployment without needing a Cognito token.
        apigwv2.CfnRoute(
            self, "HealthRoute",
            api_id=http_api.ref,
            route_key="GET /",
            authorization_type="NONE",
            target=f"integrations/{hello_integration.ref}",
        )

        apigwv2.CfnStage(
            self, "DefaultStage",
            api_id=http_api.ref,
            stage_name="$default",
            auto_deploy=True,
        )

        hello_fn.add_permission(
            "ApiGwInvoke",
            principal=iam.ServicePrincipal("apigateway.amazonaws.com"),
            source_arn=f"arn:aws:execute-api:{self.region}:{self.account}:{http_api.ref}/*/*",
        )

        # ── Stack Outputs ──────────────────────────────────────────────────

        CfnOutput(self, "UserPoolId", value=user_pool.user_pool_id)
        CfnOutput(self, "UserPoolClientId", value=user_pool_client.user_pool_client_id)
        CfnOutput(self, "Region", value=self.region)
        CfnOutput(self, "ApiBaseUrl", value=http_api.attr_api_endpoint)
        CfnOutput(self, "VideosBucketName", value=videos_bucket.bucket_name)

        # Suppress unused-variable warnings — tables are referenced in later phases.
        _ = videos_table, comments_table, jwt_authorizer
