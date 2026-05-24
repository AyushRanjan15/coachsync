import os
import boto3

_resource = None


def _ddb():
    global _resource
    if _resource is None:
        _resource = boto3.resource("dynamodb")
    return _resource


def videos_table():
    return _ddb().Table(os.environ["VIDEOS_TABLE"])


def comments_table():
    return _ddb().Table(os.environ["COMMENTS_TABLE"])
