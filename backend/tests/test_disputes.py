"""Disputes (FR 11) and delivery statuses (FR 4.9)."""


def delivery_of(world, delivery_id):
    return world.manager.get(f"/api/deliveries/{delivery_id}").json()


def test_clerk_disputes_a_delivery_and_it_shows_as_disputed(world):
    d = world.deliver(kg=100).json()
    assert d["status"] == "recorded"
    r = world.clerk.post("/api/disputes", json={"delivery_id": d["id"], "reason": "Farmer says it was 120 kg"})
    assert r.status_code == 201, r.text
    x = r.json()
    assert x["status"] == "open" and x["kind"] == "delivery" and x["record_no"] == d["receipt_no"]
    assert x["number"] == f"X-{x['id']:06d}" and x["raised_by"] == "Patrick Habineza"
    assert delivery_of(world, d["id"])["status"] == "disputed"


def test_a_second_open_dispute_on_the_same_record_is_refused(world):
    d = world.deliver().json()
    body = {"delivery_id": d["id"], "reason": "Weight looks wrong"}
    assert world.clerk.post("/api/disputes", json=body).status_code == 201
    assert world.clerk.post("/api/disputes", json=body).status_code == 409


def test_who_may_dispute_what(world):
    d = world.deliver().json()
    p = world.pay(amount=1000).json()
    on_delivery = {"delivery_id": d["id"], "reason": "Check this delivery"}
    on_payment = {"payment_id": p["id"], "reason": "Check this payment"}
    assert world.officer.post("/api/disputes", json=on_delivery).status_code == 409
    assert world.clerk.post("/api/disputes", json=on_payment).status_code == 409
    assert world.officer.post("/api/disputes", json=on_payment).status_code == 201
    assert world.manager.post("/api/disputes", json=on_delivery).status_code == 201


def test_exactly_one_record_and_a_reason(world):
    d = world.deliver().json()
    p = world.pay(amount=1000).json()
    c = world.manager
    assert c.post("/api/disputes", json={"reason": "No record given"}).status_code == 422
    assert c.post("/api/disputes", json={"delivery_id": d["id"], "payment_id": p["id"], "reason": "Both given"}).status_code == 422
    assert c.post("/api/disputes", json={"delivery_id": d["id"], "reason": "no"}).status_code == 422
    assert c.post("/api/disputes", json={"delivery_id": 9999, "reason": "No such delivery"}).status_code == 404


def test_a_voided_record_cannot_be_disputed(world):
    d = world.deliver().json()
    world.manager.post(f"/api/deliveries/{d['id']}/void", json={"reason": "Wrong farmer chosen"})
    assert world.clerk.post("/api/disputes", json={"delivery_id": d["id"], "reason": "Too late for this"}).status_code == 409


def test_manager_upholds_and_the_delivery_goes_back_to_recorded(world):
    d = world.deliver().json()
    x = world.clerk.post("/api/disputes", json={"delivery_id": d["id"], "reason": "Farmer says 120 kg"}).json()
    r = world.manager.post(f"/api/disputes/{x['id']}/uphold", json={"note": "Slip shows 120 kg"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "upheld" and r.json()["decided_by"] == "Aline Uwase"
    assert delivery_of(world, d["id"])["status"] == "recorded"
    assert world.manager.post(f"/api/disputes/{x['id']}/dismiss", json={"note": "Too late now"}).status_code == 409
    # an upheld dispute changes no amount by itself
    assert world.balance() == 30_000


def test_dismiss_needs_a_note_and_only_a_manager_decides(world):
    p = world.deliver().json()
    x = world.clerk.post("/api/disputes", json={"delivery_id": p["id"], "reason": "Check the grade"}).json()
    assert world.manager.post(f"/api/disputes/{x['id']}/dismiss", json={}).status_code == 422
    for who in (world.clerk, world.officer):
        assert who.post(f"/api/disputes/{x['id']}/dismiss", json={"note": "Not my call"}).status_code == 403
    assert world.manager.post(f"/api/disputes/{x['id']}/dismiss", json={"note": "Grade is right"}).status_code == 200


def test_lists_are_scoped_to_who_raised_them(world):
    d = world.deliver().json()
    pay = world.pay(amount=1000).json()
    world.clerk.post("/api/disputes", json={"delivery_id": d["id"], "reason": "Check this delivery"})
    world.officer.post("/api/disputes", json={"payment_id": pay["id"], "reason": "Check this payment"})
    assert len(world.manager.get("/api/disputes").json()) == 2
    assert [x["kind"] for x in world.clerk.get("/api/disputes").json()] == ["delivery"]
    assert [x["kind"] for x in world.officer.get("/api/disputes").json()] == ["payment"]
    assert len(world.manager.get("/api/disputes?status=open").json()) == 2
    assert world.manager.get("/api/disputes?status=upheld").json() == []
    paid = world.manager.get("/api/payments").json()["items"][0]
    assert paid["disputed"] is True


def test_another_cooperative_cannot_see_or_decide_a_dispute(world, make_client):
    d = world.deliver().json()
    x = world.clerk.post("/api/disputes", json={"delivery_id": d["id"], "reason": "Check this one"}).json()
    other = make_client()
    other.post("/api/auth/register", json={"full_name": "Other Boss", "phone": "0788777001", "cooperative_name": "Other Coop", "password": "harvest2026"})
    other.post("/api/auth/login", json={"username": "0788777001", "password": "harvest2026"})
    assert other.get("/api/disputes").json() == []
    assert other.post(f"/api/disputes/{x['id']}/dismiss", json={"note": "Not yours to decide"}).status_code == 404


def test_dispute_steps_are_audited(world):
    d = world.deliver().json()
    x = world.clerk.post("/api/disputes", json={"delivery_id": d["id"], "reason": "Check the weight"}).json()
    world.manager.post(f"/api/disputes/{x['id']}/dismiss", json={"note": "Slip matches"})
    actions = [e["action"] for e in world.manager.get("/api/audit").json()["items"]] if isinstance(world.manager.get("/api/audit").json(), dict) else [e["action"] for e in world.manager.get("/api/audit").json()]
    assert "dispute.raised" in actions and "dispute.dismissed" in actions
    assert world.manager.get("/api/audit/verify").json()["ok"] is True


# ---------- delivery statuses ----------

def test_payment_status_follows_payments_oldest_first(world):
    a = world.deliver(kg=100, date="2026-11-01").json()  # 30,000
    b = world.deliver(kg=100, date="2026-11-02").json()  # 30,000
    assert [delivery_of(world, i)["payment_status"] for i in (a["id"], b["id"])] == ["unpaid", "unpaid"]
    world.pay(amount=40_000)
    assert delivery_of(world, a["id"])["payment_status"] == "paid"
    assert delivery_of(world, b["id"])["payment_status"] == "part_paid"
    world.pay(amount=20_000)
    assert delivery_of(world, b["id"])["payment_status"] == "paid"


def test_in_batch_status_for_money_planned_in_an_open_batch(world):
    a = world.deliver(kg=100, date="2026-11-01").json()
    b = world.deliver(kg=100, date="2026-11-02").json()
    batch = world.officer.post("/api/batches", json={"lines": [{"farmer_id": world.farmer, "amount": 30_000}]}).json()
    assert delivery_of(world, a["id"])["payment_status"] == "in_batch"
    assert delivery_of(world, b["id"])["payment_status"] == "unpaid"  # the batch only covers the first
    world.manager.post(f"/api/batches/{batch['id']}/reject", json={"reason": "Not this week"})
    assert delivery_of(world, a["id"])["payment_status"] == "unpaid"


def test_voided_delivery_status(world):
    d = world.deliver().json()
    world.manager.post(f"/api/deliveries/{d['id']}/void", json={"reason": "Chosen wrong farmer"})
    got = delivery_of(world, d["id"])
    assert got["status"] == "voided" and got["payment_status"] == "none"


def test_correction_pending_status(world):
    d = world.deliver().json()
    world.clerk.post("/api/corrections", json={"delivery_id": d["id"], "weight_kg": 90, "reason": "Scale misread"})
    assert delivery_of(world, d["id"])["status"] == "correction_pending"
