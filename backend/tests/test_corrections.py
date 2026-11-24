"""Correcting a delivery (FR 4.4, BR 1, BR 5): a Manager corrects directly, or a Collection Clerk requests and a
Manager decides. The old value is always kept."""

from app.models import Correction


def _correct(world, delivery_id, **body):
    return world.manager.post(f"/api/deliveries/{delivery_id}/correct", json={"reason": "Scale was misread", **body})


def test_manager_corrects_weight_and_value_is_recalculated(world):
    d = world.deliver(kg=100, grade="A").json()  # 30,000
    res = _correct(world, d["id"], weight_kg=80)
    assert res.status_code == 200
    body = res.json()
    assert body["weight_kg"] == 80 and body["value"] == 24_000 and body["corrected"] is True
    assert world.balance() == 24_000


def test_correcting_the_grade_uses_that_grades_price(world):
    d = world.deliver(kg=100, grade="A").json()
    res = _correct(world, d["id"], grade="B")
    assert res.json()["value"] == 25_000 and res.json()["price_per_kg"] == 250


def test_old_values_are_kept_on_the_correction_record(world):
    d = world.deliver(kg=100, grade="A").json()
    _correct(world, d["id"], weight_kg=80, grade="B")
    with world.make_client.session() as db:
        c = db.query(Correction).one()
        assert (c.old_weight_grams, c.old_grade, c.old_value) == (100_000, "A", 30_000)
        assert (c.applied_weight_grams, c.applied_grade, c.applied_value) == (80_000, "B", 20_000)
        assert c.reason == "Scale was misread" and c.status == "direct"


def test_correction_needs_a_reason_and_a_change(world):
    d = world.deliver(kg=100).json()
    m = world.manager
    assert m.post(f"/api/deliveries/{d['id']}/correct", json={"weight_kg": 90}).status_code == 422
    assert m.post(f"/api/deliveries/{d['id']}/correct", json={"weight_kg": 90, "reason": "  "}).status_code == 422
    assert m.post(f"/api/deliveries/{d['id']}/correct", json={"reason": "No change given"}).status_code == 422
    assert _correct(world, d["id"], weight_kg=100).status_code == 409  # same as now
    assert _correct(world, d["id"], weight_kg=-5).status_code == 422
    assert world.balance() == 30_000


def test_correction_that_would_leave_the_farmer_overpaid_is_refused(world):
    d = world.deliver(kg=100).json()  # 30,000
    world.pay(amount=30_000)
    res = _correct(world, d["id"], weight_kg=50)
    assert res.status_code == 409 and "overpaid" in res.json()["detail"]
    assert world.balance() == 0
    assert _correct(world, d["id"], weight_kg=150).status_code == 200  # more is fine
    assert world.balance() == 15_000


def test_a_voided_delivery_cannot_be_corrected(world):
    d = world.deliver(kg=100).json()
    world.manager.post(f"/api/deliveries/{d['id']}/void", json={"reason": "Chosen wrong farmer"})
    assert _correct(world, d["id"], weight_kg=50).status_code == 409


# ---------- the Clerk's request ----------

def _request(world, delivery_id, **body):
    return world.clerk.post("/api/corrections", json={
        "delivery_id": delivery_id, "reason": "I typed 100 but the slip says 80", **body})


def test_clerk_requests_and_manager_approves(world):
    d = world.deliver(kg=100).json()
    req = _request(world, d["id"], weight_kg=80)
    assert req.status_code == 201
    c = req.json()
    assert c["status"] == "pending" and c["old_weight_kg"] == 100 and c["new_weight_kg"] == 80
    assert c["old_value"] == 30_000 and c["new_value"] == 24_000
    # Nothing changes until a Manager decides.
    assert world.balance() == 30_000
    assert world.manager.get(f"/api/deliveries/{d['id']}").json()["pending_correction"] is True

    res = world.manager.post(f"/api/corrections/{c['id']}/approve", json={"note": "Checked the slip"})
    assert res.status_code == 200 and res.json()["status"] == "approved"
    assert res.json()["decided_by"] == "Aline Uwase" and res.json()["new_value"] == 24_000
    after = world.manager.get(f"/api/deliveries/{d['id']}").json()
    assert after["weight_kg"] == 80 and after["value"] == 24_000
    assert after["corrected"] is True and after["pending_correction"] is False
    assert world.balance() == 24_000


def test_manager_rejects_and_the_current_value_stays(world):
    d = world.deliver(kg=100).json()
    c = _request(world, d["id"], weight_kg=80).json()
    res = world.manager.post(f"/api/corrections/{c['id']}/reject", json={"note": "Slip says 100"})
    assert res.status_code == 200 and res.json()["status"] == "rejected"
    assert world.manager.get(f"/api/deliveries/{d['id']}").json()["weight_kg"] == 100
    assert world.balance() == 30_000
    # A decided request cannot be decided again.
    assert world.manager.post(f"/api/corrections/{c['id']}/approve", json={}).status_code == 409
    # The Clerk may ask again afterwards.
    assert _request(world, d["id"], weight_kg=90).status_code == 201


def test_only_one_open_request_per_delivery(world):
    d = world.deliver(kg=100).json()
    assert _request(world, d["id"], weight_kg=80).status_code == 201
    assert _request(world, d["id"], weight_kg=70).status_code == 409


def test_request_needs_a_reason_a_change_and_a_live_delivery(world):
    d = world.deliver(kg=100).json()
    assert world.clerk.post("/api/corrections", json={"delivery_id": d["id"], "weight_kg": 80}).status_code == 422
    assert world.clerk.post("/api/corrections", json={"delivery_id": d["id"], "reason": "no change"}).status_code == 422
    assert _request(world, d["id"], weight_kg=100).status_code == 409
    assert _request(world, 99999, weight_kg=5).status_code == 404
    world.manager.post(f"/api/deliveries/{d['id']}/void", json={"reason": "Chosen wrong farmer"})
    assert _request(world, d["id"], weight_kg=80).status_code == 409


def test_only_the_manager_decides_and_a_clerk_sees_only_their_own(world):
    d = world.deliver(kg=100).json()
    c = _request(world, d["id"], weight_kg=80).json()
    for client in (world.clerk, world.officer):
        assert client.post(f"/api/corrections/{c['id']}/approve", json={}).status_code == 403
        assert client.post(f"/api/corrections/{c['id']}/reject", json={}).status_code == 403
    assert world.officer.get("/api/corrections").status_code == 403
    assert len(world.clerk.get("/api/corrections").json()) == 1
    other_clerk = world.add_staff("Second Clerk", "0788000007", "clerk")
    assert other_clerk.get("/api/corrections").json() == []
    assert len(world.manager.get("/api/corrections").json()) == 1
    assert len(world.manager.get("/api/corrections", params={"status": "pending"}).json()) == 1
    assert world.manager.get("/api/corrections", params={"status": "approved"}).json() == []


def test_approval_that_would_overpay_is_refused_and_stays_pending(world):
    d = world.deliver(kg=100).json()
    c = _request(world, d["id"], weight_kg=50).json()
    world.pay(amount=30_000)
    res = world.manager.post(f"/api/corrections/{c['id']}/approve", json={})
    assert res.status_code == 409
    assert world.manager.get("/api/corrections", params={"status": "pending"}).json()[0]["id"] == c["id"]
    assert world.balance() == 0
