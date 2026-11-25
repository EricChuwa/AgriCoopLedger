"""Payment batches (FR 10): the Payment Officer submits, a Manager approves, payments are recorded against it."""


def owe(world, farmer=None, kg=100):
    assert world.deliver(farmer=farmer, kg=kg).status_code == 201  # 100 kg of grade A is 30,000 RWF


def submit(world, lines, note=""):
    return world.officer.post("/api/batches", json={"note": note, "lines": lines})


def pay_in(world, batch_id, farmer, amount, **extra):
    body = {"farmer_id": farmer, "amount": amount, "method": "cash", **extra}
    return world.officer.post(f"/api/batches/{batch_id}/payments", json=body)


def approved_batch(world, amount=20000):
    owe(world)
    b = submit(world, [{"farmer_id": world.farmer, "amount": amount}]).json()
    assert world.manager.post(f"/api/batches/{b['id']}/approve").status_code == 200
    return b["id"]


def test_officer_submits_a_batch(world):
    owe(world); owe(world, world.farmer2, kg=50)
    r = submit(world, [{"farmer_id": world.farmer, "amount": 30000}, {"farmer_id": world.farmer2, "amount": 10000}], "Friday round")
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["status"] == "submitted" and b["number"] == f"B-{b['id']:06d}" and b["farmers"] == 2
    assert b["planned"] == 40000 and b["paid"] == 0 and b["created_by"] == "Claudine Uwase"
    assert [ln["status"] for ln in b["lines"]] == ["unpaid", "unpaid"]


def test_only_the_payment_officer_submits_and_only_a_manager_decides(world):
    owe(world)
    line = [{"farmer_id": world.farmer, "amount": 1000}]
    for who in (world.manager, world.clerk):
        assert who.post("/api/batches", json={"lines": line}).status_code == 403
    b = submit(world, line).json()
    for who in (world.officer, world.clerk):
        assert who.post(f"/api/batches/{b['id']}/approve").status_code == 403
        assert who.post(f"/api/batches/{b['id']}/reject", json={"reason": "no reason given"}).status_code == 403
    assert world.clerk.get("/api/batches").status_code == 403


def test_a_batch_cannot_plan_more_than_is_owed_or_repeat_a_farmer(world):
    owe(world)
    assert submit(world, [{"farmer_id": world.farmer, "amount": 30001}]).status_code == 409
    assert submit(world, [{"farmer_id": world.farmer, "amount": 100}, {"farmer_id": world.farmer, "amount": 100}]).status_code == 422
    assert submit(world, [{"farmer_id": world.farmer2, "amount": 100}]).status_code == 409  # owed nothing
    assert submit(world, []).status_code == 422


def test_a_farmer_cannot_be_in_two_open_batches(world):
    owe(world)
    first = submit(world, [{"farmer_id": world.farmer, "amount": 1000}]).json()
    again = submit(world, [{"farmer_id": world.farmer, "amount": 1000}])
    assert again.status_code == 409 and first["number"] in str(again.json())
    world.manager.post(f"/api/batches/{first['id']}/reject", json={"reason": "Wrong amounts"})
    assert submit(world, [{"farmer_id": world.farmer, "amount": 1000}]).status_code == 201  # a declined batch frees them


def test_nothing_can_be_paid_before_approval_or_after_a_decline(world):
    owe(world)
    b = submit(world, [{"farmer_id": world.farmer, "amount": 5000}]).json()
    r = pay_in(world, b["id"], world.farmer, 1000)
    assert r.status_code == 409 and "approval" in str(r.json())
    world.manager.post(f"/api/batches/{b['id']}/reject", json={"reason": "Not this week"})
    r = pay_in(world, b["id"], world.farmer, 1000)
    assert r.status_code == 409 and "declined" in str(r.json())
    assert world.balance() == 30000


def test_a_decision_needs_a_reason_to_decline_and_can_only_be_made_once(world):
    owe(world)
    b = submit(world, [{"farmer_id": world.farmer, "amount": 5000}]).json()
    assert world.manager.post(f"/api/batches/{b['id']}/reject", json={"reason": "no"}).status_code == 422
    assert world.manager.post(f"/api/batches/{b['id']}/approve").status_code == 200
    assert world.manager.post(f"/api/batches/{b['id']}/approve").status_code == 409
    assert world.manager.post(f"/api/batches/{b['id']}/reject", json={"reason": "Changed my mind"}).status_code == 409


def test_the_maker_of_a_batch_cannot_approve_it(world):
    owe(world)
    b = submit(world, [{"farmer_id": world.farmer, "amount": 5000}]).json()
    from app.models import PaymentBatch
    mgr = world.manager.get("/api/auth/me").json()["id"]
    with world.make_client.session() as db:
        db.get(PaymentBatch, b["id"]).created_by_id = mgr
        db.commit()
    r = world.manager.post(f"/api/batches/{b['id']}/approve")
    assert r.status_code == 409 and "another Manager" in str(r.json())


def test_paying_a_batch_moves_it_through_part_paid_to_paid(world):
    batch = approved_batch(world, 20000)
    assert world.manager.get(f"/api/batches/{batch}").json()["status"] == "approved"
    r = pay_in(world, batch, world.farmer, 8000)
    assert r.status_code == 201 and r.json()["batch_id"] == batch and r.json()["batch_no"] == f"B-{batch:06d}"
    d = world.manager.get(f"/api/batches/{batch}").json()
    assert d["status"] == "part_paid" and d["paid"] == 8000 and d["lines"][0]["remaining"] == 12000
    assert d["lines"][0]["status"] == "part_paid"
    assert pay_in(world, batch, world.farmer, 12000).status_code == 201
    d = world.manager.get(f"/api/batches/{batch}").json()
    assert d["status"] == "paid" and d["lines"][0]["status"] == "paid"
    assert world.balance() == 10000  # the farmer is still owed what the batch did not plan


def test_a_batch_payment_cannot_exceed_the_planned_amount_or_the_balance(world):
    batch = approved_batch(world, 20000)
    over = pay_in(world, batch, world.farmer, 20001)
    assert over.status_code == 409 and over.json()["detail"]["field"] == "amount"
    assert pay_in(world, batch, world.farmer, 20000).status_code == 201
    assert pay_in(world, batch, world.farmer, 1).status_code == 409  # paid in full already
    assert world.balance() == 10000


def test_balance_check_still_applies_inside_a_batch(world):
    batch = approved_batch(world, 30000)
    assert world.pay(amount=25000).status_code == 201  # an ordinary payment lowers what is owed
    r = pay_in(world, batch, world.farmer, 6000)
    assert r.status_code == 409 and "more than" in str(r.json())
    assert pay_in(world, batch, world.farmer, 5000).status_code == 201
    assert world.balance() == 0


def test_a_farmer_not_in_the_batch_cannot_be_paid_from_it(world):
    batch = approved_batch(world)
    owe(world, world.farmer2)
    r = pay_in(world, batch, world.farmer2, 1000)
    assert r.status_code == 409 and "not in" in str(r.json())


def test_batch_payment_repeat_is_recorded_once(world):
    batch = approved_batch(world)
    one = pay_in(world, batch, world.farmer, 1000, client_id="repeat-0001-aaaa")
    two = pay_in(world, batch, world.farmer, 1000, client_id="repeat-0001-aaaa")
    assert one.status_code == 201 and two.status_code == 201 and one.json()["id"] == two.json()["id"]
    assert world.manager.get(f"/api/batches/{batch}").json()["paid"] == 1000


def test_voiding_a_batch_payment_reopens_the_line(world):
    batch = approved_batch(world, 5000)
    p = pay_in(world, batch, world.farmer, 5000).json()
    assert world.manager.get(f"/api/batches/{batch}").json()["status"] == "paid"
    assert world.manager.post(f"/api/payments/{p['id']}/void", json={"reason": "Wrong amount sent"}).status_code == 200
    d = world.manager.get(f"/api/batches/{batch}").json()
    assert d["status"] == "approved" and d["paid"] == 0 and d["lines"][0]["remaining"] == 5000


def test_list_and_detail_are_scoped_to_the_cooperative(world, make_client):
    batch = approved_batch(world)
    other = make_client()
    other.post("/api/auth/register", json={"full_name": "Other Boss", "phone": "0788999111",
                                            "cooperative_name": "Other Coop", "password": "harvest2026"})
    other.post("/api/auth/login", json={"username": "0788999111", "password": "harvest2026"})
    assert other.get("/api/batches").json() == []
    assert other.get(f"/api/batches/{batch}").status_code == 404
    assert other.post(f"/api/batches/{batch}/approve").status_code == 404
    assert len(world.officer.get("/api/batches").json()) == 1


def test_batch_steps_are_audited_and_the_chain_still_verifies(world):
    batch = approved_batch(world)
    pay_in(world, batch, world.farmer, 1000)
    actions = [e["action"] for e in world.manager.get("/api/audit").json()]
    assert "batch.submitted" in actions and "batch.approved" in actions
    assert world.manager.get("/api/audit/verify").json()["ok"] is True


def test_dashboard_counts_batches_waiting_for_the_manager(world):
    owe(world)
    submit(world, [{"farmer_id": world.farmer, "amount": 1000}])
    assert world.manager.get("/api/dashboard").json()["batches_waiting"] == 1
    assert world.officer.get("/api/dashboard").json()["batches_waiting"] == 0
