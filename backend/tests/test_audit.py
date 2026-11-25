"""The audit trail (FR 7.1, 7.2, NFR 15): who did what, and when. Only a Manager reads it; nobody edits it."""

from app.models import AuditEntry


def _log(world, **params):
    return world.manager.get("/api/audit", params=params).json()


def test_every_change_writes_an_entry_with_who_and_when(world):
    d = world.deliver(kg=100).json()
    p = world.pay(amount=1000).json()
    world.manager.post(f"/api/deliveries/{d['id']}/correct", json={"weight_kg": 90, "reason": "Scale misread"})
    world.manager.post(f"/api/payments/{p['id']}/void", json={"reason": "Wrong amount entered"})
    world.manager.post(f"/api/deliveries/{d['id']}/void", json={"reason": "Duplicate entry"})
    world.manager.post(f"/api/produce/{world.maize}/prices", json={"grade": "A", "price_per_kg": 310})

    entries = _log(world)
    by_action = {e["action"]: e for e in entries}
    for action in ("delivery.recorded", "payment.recorded", "delivery.corrected", "payment.voided",
                   "delivery.voided", "price.set", "farmer.proposed", "farmer.approved", "user.created", "produce.created"):
        assert action in by_action, action
        assert by_action[action]["created_at"]
    assert by_action["delivery.recorded"]["user_name"] == "Patrick Habineza"
    assert by_action["payment.recorded"]["user_name"] == "Claudine Uwase"
    assert by_action["delivery.corrected"]["user_name"] == "Aline Uwase"
    assert "Scale misread" in by_action["delivery.corrected"]["summary"]
    assert "100 kg" in by_action["delivery.corrected"]["summary"] and "90 kg" in by_action["delivery.corrected"]["summary"]
    assert "Wrong amount entered" in by_action["payment.voided"]["summary"]


def test_log_is_newest_first_and_filterable(world):
    world.deliver(kg=10)
    world.pay(amount=100)
    ids = [e["id"] for e in _log(world)]
    assert ids == sorted(ids, reverse=True)
    assert {e["action"] for e in _log(world, action="payment")} == {"payment.recorded"}
    assert all(e["entity_type"] == "delivery" for e in _log(world, entity_type="delivery"))
    clerk_id = world.manager.get("/api/users").json()
    clerk_id = next(u["id"] for u in clerk_id if u["role"] == "clerk")
    assert {e["user_name"] for e in _log(world, user_id=clerk_id)} == {"Patrick Habineza"}
    assert _log(world, date_from="2999-01-01") == []
    assert len(_log(world, date_from="2020-01-01", date_to="2999-01-01")) == len(_log(world))
    assert len(_log(world, limit=2)) == 2


def test_failed_changes_leave_no_entry(world):
    before = len(_log(world))
    world.pay(amount=999)  # nothing owed, rejected
    world.deliver(kg=-1)
    assert len(_log(world)) == before


def test_only_the_manager_can_read_the_log(world):
    assert world.clerk.get("/api/audit").status_code == 403
    assert world.officer.get("/api/audit").status_code == 403


def test_the_log_cannot_be_edited_or_deleted_through_the_api(world):
    world.deliver(kg=10)
    entry = _log(world)[0]
    for client in (world.manager, world.clerk, world.officer):
        for path in ("/api/audit", f"/api/audit/{entry['id']}"):
            assert client.delete(path).status_code in (404, 405)
            assert client.put(path, json={}).status_code in (404, 405)
            assert client.patch(path, json={"summary": "x"}).status_code in (404, 405)
            assert client.post(path, json={}).status_code in (404, 405)
    with world.make_client.session() as db:
        assert db.query(AuditEntry).count() == len(_log(world))


def test_entries_stay_in_their_own_cooperative(make_client, world):
    other = make_client()
    other.post("/api/auth/register", json={
        "full_name": "Other Manager", "phone": "0788111111", "cooperative_name": "Other Coop", "password": "harvest2026"})
    other.post("/api/auth/login", json={"username": "0788111111", "password": "harvest2026"})
    world.deliver(kg=10)
    assert all("Other" in e["summary"] or "Other" in e["user_name"] for e in other.get("/api/audit").json())


def test_chain_verifies_and_detects_tampering(world):
    from sqlalchemy import select
    world.deliver(kg=100)
    world.pay(amount=1000)
    ok = world.manager.get("/api/audit/verify").json()
    assert ok["ok"] is True and ok["checked"] >= 5

    with world.manager.test_session() as db:  # someone edits a stored row directly in the database
        row = db.scalars(select(AuditEntry).where(AuditEntry.action == "payment.recorded")).first()
        row.summary = row.summary.replace("1,000", "1")
        db.commit()
        bad_id = row.id
    bad = world.manager.get("/api/audit/verify").json()
    assert bad["ok"] is False and bad["first_bad_id"] == bad_id


def test_chain_detects_a_deleted_entry(world):
    from sqlalchemy import select
    world.deliver(kg=100)
    world.pay(amount=1000)
    with world.manager.test_session() as db:
        row = db.scalars(select(AuditEntry).where(AuditEntry.action == "delivery.recorded")).first()
        db.delete(row)
        db.commit()
    assert world.manager.get("/api/audit/verify").json()["ok"] is False


def test_only_a_manager_can_verify(world):
    assert world.clerk.get("/api/audit/verify").status_code == 403
    assert world.officer.get("/api/audit/verify").status_code == 403
