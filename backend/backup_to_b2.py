"""Daily database backup to Backblaze B2 (NFR 5). Runs as a Render cron job.

It dumps the PostgreSQL database with pg_dump, uploads the dump to a private B2 bucket through B2's
S3-compatible API, checks the upload, and only then deletes dumps older than RETAIN_DAYS. If any step fails
the script exits with an error and deletes nothing, so a failed run can never remove the last good backup.

Environment: DATABASE_URL, B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET, B2_ENDPOINT
(for example https://s3.us-west-004.backblazeb2.com), optional B2_PREFIX (default "backups/"), RETAIN_DAYS (default 14).
"""

import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone

MIN_DUMP_BYTES = 1024  # a real dump of this schema is never smaller; guards against an empty file


def dump_name(now: datetime) -> str:
    return f"agricoop-{now:%Y%m%d-%H%M%S}.dump"


def old_keys(objects: list[dict], now: datetime, days: int) -> list[str]:
    """Keys of dumps older than `days`. `objects` are S3 listing entries with Key and LastModified."""
    cutoff = now - timedelta(days=days)
    return [o["Key"] for o in objects if o["Key"].endswith(".dump") and o["LastModified"] < cutoff]


def prune(client, bucket: str, prefix: str, now: datetime, days: int) -> int:
    objects, token = [], None
    while True:
        args = {"Bucket": bucket, "Prefix": prefix}
        if token:
            args["ContinuationToken"] = token
        page = client.list_objects_v2(**args)
        objects += page.get("Contents", [])
        token = page.get("NextContinuationToken")
        if not token:
            break
    doomed = old_keys(objects, now, days)
    for key in doomed:
        client.delete_object(Bucket=bucket, Key=key)
    return len(doomed)


def main() -> int:
    import boto3  # imported here so the helpers above can be tested without it

    url = os.environ["DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://", 1)
    bucket = os.environ["B2_BUCKET"]
    prefix = os.getenv("B2_PREFIX", "backups/")
    days = int(os.getenv("RETAIN_DAYS", "14"))
    now = datetime.now(timezone.utc)
    client = boto3.client(
        "s3", endpoint_url=os.environ["B2_ENDPOINT"],
        aws_access_key_id=os.environ["B2_KEY_ID"], aws_secret_access_key=os.environ["B2_APPLICATION_KEY"])

    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, dump_name(now))
        subprocess.run(["pg_dump", "--format=custom", "--no-owner", "--file", path, url], check=True)
        size = os.path.getsize(path)
        if size < MIN_DUMP_BYTES:
            print(f"Dump is only {size} bytes. Not uploading.", file=sys.stderr)
            return 1
        key = prefix + os.path.basename(path)
        client.upload_file(path, bucket, key)
        stored = client.head_object(Bucket=bucket, Key=key)["ContentLength"]
        if stored != size:
            print(f"Upload check failed: {stored} bytes stored, {size} expected.", file=sys.stderr)
            return 1
    print(f"Backed up {size} bytes to {bucket}/{key}.")
    print(f"Removed {prune(client, bucket, prefix, now, days)} dump(s) older than {days} days.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
