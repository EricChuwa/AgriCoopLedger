"""The retention logic of the B2 backup job (NFR 5). The upload itself needs B2 and pg_dump and is not tested here."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import backup_to_b2 as b  # noqa: E402

NOW = datetime(2026, 11, 25, 1, 0, tzinfo=timezone.utc)


class FakeS3:
    def __init__(self, items):
        self.items, self.deleted = items, []

    def list_objects_v2(self, **kw):
        assert kw["Bucket"] == "bkt" and kw["Prefix"] == "backups/"
        return {"Contents": self.items}

    def delete_object(self, Bucket, Key):
        self.deleted.append(Key)


def entry(name, days_old):
    return {"Key": "backups/" + name, "LastModified": NOW - timedelta(days=days_old)}


def test_dump_name_is_sortable():
    assert b.dump_name(NOW) == "agricoop-20261125-010000.dump"


def test_only_dumps_older_than_the_window_are_removed():
    s3 = FakeS3([entry("agricoop-a.dump", 20), entry("agricoop-b.dump", 15), entry("agricoop-c.dump", 14),
                 entry("agricoop-d.dump", 1), entry("notes.txt", 90)])
    assert b.prune(s3, "bkt", "backups/", NOW, 14) == 2
    assert s3.deleted == ["backups/agricoop-a.dump", "backups/agricoop-b.dump"]


def test_nothing_is_removed_when_everything_is_recent():
    s3 = FakeS3([entry("agricoop-a.dump", 1), entry("agricoop-b.dump", 0)])
    assert b.prune(s3, "bkt", "backups/", NOW, 14) == 0 and s3.deleted == []
