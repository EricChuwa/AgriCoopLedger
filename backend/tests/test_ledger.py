"""Deliveries, prices, balances and payments: the money rules (FR 3, 4, 5; BR 3 to 6; NFR 7, 8)."""

from datetime import timedelta

from app.services import today, to_grams, value_of


# ---------- the arithmetic, by hand ----------

def test_value_is_weight_times_price_rounded_half_up():
    assert value_of(to_grams(150), 300) == 45_000          # 150 kg x 300
    assert value_of(to_grams("12.345"), 700) == 8_642      # 8641.5 rounds up
    assert value_of(to_grams("0.001"), 300) == 0           # 0.3 rounds down
    assert value_of(to_grams("0.002"), 250) == 1           # 0.5 rounds up
    assert value_of(to_grams(1_000), 1_000_000) == 1_000_000_000


# ---------- deliveries ----------

def test_clerk_records_delivery_and_value_matches_hand_calculation(world):
    res = world.deliver(kg=150, grade="A")
    assert res.status_code == 201
    d = res.json()
    assert d["value"] == 45_000 and d["price_per_kg"] == 300 and d["weight_kg"] == 150
    assert d["grade"] == "A" and d["recorded_by"] == "Patrick Habineza" and d["receipt_no"].startswith("D-")
    assert world.balance() == 45_000


def test_grade_changes_the_price(world):
    assert world.deliver(kg=100, grade="B").json()["value"] == 25_000  # 100 x 250
    assert world.balance() == 25_000


def test_decimal_weights_are_exact(world):
    assert world.deliver(kg="12.5", grade="A").json()["value"] == 3_750
    assert world.deliver(kg="12.345", grade="B").json()["value"] == 3_086  # 3086.25 rounds down
    assert world.balance() == 3_750 + 3_086


def test_total_balance_over_many_deliveries_and_payments(world):
    for kg, grade in ((150, "A"), (80, "B"), ("33.3", "A")):
        assert world.deliver(kg=kg, grade=grade).status_code == 201
    # 45,000 + 20,000 + 9,990
    assert world.balance() == 74_990
    assert world.pay(amount=30_000).status_code == 201
    assert world.pay(amount=4_990).status_code == 201
    assert world.balance() == 40_000


def test_later_price_change_never_alters_old_deliveries(world):
    first = world.deliver(kg=100, grade="A").json()
    assert first["value"] == 30_000
    r = world.manager.post(f"/api/produce/{world.maize}/prices", json={"grade": "A", "price_per_kg": 400})
    assert r.status_code == 201
    second = world.deliver(kg=100, grade="A").json()
    assert second["value"] == 40_000 and second["price_per_kg"] == 400
    old = world.manager.get(f"/api/deliveries/{first['id']}").json()
    assert old["value"] == 30_000 and old["price_per_kg"] == 300
    assert world.balance() == 70_000


def test_price_in_force_on_the_delivery_date_is_used(world):
    start = today() - timedelta(days=3)
    world.manager.post(f"/api/produce/{world.maize}/prices",
                       json={"grade": "A", "price_per_kg": 350, "effective_from": start.isoformat()})
    before = world.deliver(kg=100, date=(start - timedelta(days=1)).isoformat()).json()
    on = world.deliver(kg=100, date=start.isoformat()).json()
    assert before["price_per_kg"] == 300 and on["price_per_kg"] == 350


def test_no_price_for_that_date_is_rejected(world):
    r = world.manager.post("/api/produce", json={"name": "Beans", "prices": [{"grade": "A", "price_per_kg": 700}]})
    beans = r.json()["id"]
    yesterday = (today() - timedelta(days=1)).isoformat()
    res = world.clerk.post("/api/deliveries", json={
        "farmer_id": world.farmer, "produce_id": beans, "grade": "A", "weight_kg": 5, "delivery_date": yesterday})
    assert res.status_code == 409 and "No price" in res.json()["detail"]["message"]
    res = world.clerk.post("/api/deliveries", json={
        "farmer_id": world.farmer, "produce_id": beans, "grade": "C", "weight_kg": 5})
    assert res.status_code == 409


def test_invalid_input_is_rejected_with_a_message(world):
    base = {"farmer_id": world.farmer, "produce_id": world.maize, "grade": "A"}
    for bad in (0, -5, "abc", None, 100_001, "1.2345"):
        res = world.clerk.post("/api/deliveries", json={**base, "weight_kg": bad})
        assert res.status_code == 422, bad
    res = world.clerk.post("/api/deliveries", json={**base})  # missing weight
    assert res.status_code == 422
    res = world.clerk.post("/api/deliveries", json={**base, "weight_kg": 5, "grade": "Z"})
    assert res.status_code == 422
    tomorrow = (today() + timedelta(days=1)).isoformat()
    res = world.clerk.post("/api/deliveries", json={**base, "weight_kg": 5, "delivery_date": tomorrow})
    assert res.status_code == 422
    assert world.balance() == 0


def test_inactive_farmer_cannot_have_deliveries_or_payments(world):
    assert world.manager.post(f"/api/farmers/{world.farmer2}/deactivate").status_code == 200
    assert world.deliver(farmer=world.farmer2).status_code == 409
    assert world.pay(farmer=world.farmer2).status_code == 409
    assert world.manager.post(f"/api/farmers/{world.farmer2}/activate").status_code == 200
    assert world.deliver(farmer=world.farmer2).status_code == 201


def test_list_filters_by_farmer_produce_and_date_range(world):
    d = today()
    world.deliver(farmer=world.farmer, kg=10, date=(d - timedelta(days=10)).isoformat())
    world.deliver(farmer=world.farmer, kg=20, date=(d - timedelta(days=2)).isoformat())
    world.deliver(farmer=world.farmer2, kg=30)
    m = world.manager
    assert m.get("/api/deliveries").json()["total"] == 3
    assert m.get("/api/deliveries", params={"farmer_id": world.farmer2}).json()["total"] == 1
    assert m.get("/api/deliveries", params={"produce_id": world.maize}).json()["total"] == 3
    rng = {"date_from": (d - timedelta(days=5)).isoformat(), "date_to": d.isoformat()}
    assert [x["weight_kg"] for x in m.get("/api/deliveries", params=rng).json()["items"]] == [30, 20]
    assert m.get("/api/deliveries", params={"produce_id": 9999}).json()["items"] == []


# ---------- prices ----------

def test_price_history_and_duplicate_price_rules(world):
    m = world.manager
    assert m.post(f"/api/produce/{world.maize}/prices", json={"grade": "A", "price_per_kg": 300}).status_code == 409
    ok = m.post(f"/api/produce/{world.maize}/prices", json={"grade": "A", "price_per_kg": 320})
    assert ok.status_code == 201
    history = [p for p in ok.json()["prices"] if p["grade"] == "A"]
    assert [p["price_per_kg"] for p in history] == [320, 300]  # newest first
    back = m.post(f"/api/produce/{world.maize}/prices",
                  json={"grade": "A", "price_per_kg": 280, "effective_from": "2019-01-01"})
    assert back.status_code == 422  # cannot start before an existing price
    assert m.post(f"/api/produce/{world.maize}/prices", json={"grade": "A", "price_per_kg": 0}).status_code == 422
    assert m.post("/api/produce", json={"name": "maize", "prices": [{"grade": "A", "price_per_kg": 1}]}).status_code == 409


# ---------- payments ----------

def test_payment_reduces_balance_and_overpayment_is_rejected(world):
    world.deliver(kg=100, grade="A")  # 30,000 owed
    assert world.pay(amount=10_000).status_code == 201
    assert world.balance() == 20_000
    over = world.pay(amount=20_001)
    assert over.status_code == 409 and "20,000" in over.json()["detail"]["message"]
    assert world.balance() == 20_000
    assert world.pay(amount=20_000).status_code == 201
    assert world.balance() == 0
    assert world.pay(amount=1).status_code == 409  # nothing owed any more


def test_payment_with_nothing_owed_and_bad_amounts(world):
    assert world.pay(amount=500).status_code == 409
    world.deliver(kg=100)
    for bad in (0, -1, "abc", 1.5, None):
        assert world.officer.post("/api/payments", json={
            "farmer_id": world.farmer, "amount": bad, "method": "cash"}).status_code == 422, bad
    assert world.officer.post("/api/payments", json={
        "farmer_id": world.farmer, "amount": 100, "method": "bitcoin"}).status_code == 422


def test_same_mobile_money_reference_cannot_be_reused(world):
    world.deliver(kg=100)
    assert world.pay(amount=1000, method="momo", reference="TX-1001").status_code == 201
    assert world.pay(amount=1000, method="momo", reference="tx-1001").status_code == 409


def test_void_payment_needs_reason_and_restores_balance(world):
    world.deliver(kg=100)
    p = world.pay(amount=10_000).json()
    assert world.manager.post(f"/api/payments/{p['id']}/void", json={"reason": ""}).status_code == 422
    assert world.manager.post(f"/api/payments/{p['id']}/void", json={"reason": "abc"}).status_code == 422
    res = world.manager.post(f"/api/payments/{p['id']}/void", json={"reason": "Entered against wrong farmer"})
    assert res.status_code == 200 and res.json()["voided"]["reason"] == "Entered against wrong farmer"
    assert world.balance() == 30_000
    assert world.manager.post(f"/api/payments/{p['id']}/void", json={"reason": "again please"}).status_code == 409
    # The voided record is still there (NFR 7).
    listed = world.manager.get("/api/payments").json()["items"]
    assert len(listed) == 1 and listed[0]["voided"] is not None


def test_void_delivery_removes_value_but_keeps_record(world):
    d = world.deliver(kg=100).json()
    res = world.manager.post(f"/api/deliveries/{d['id']}/void", json={"reason": "Chosen wrong farmer"})
    assert res.status_code == 200
    assert world.balance() == 0
    assert world.manager.get("/api/deliveries").json()["total"] == 1


def test_void_delivery_blocked_when_it_would_leave_the_farmer_overpaid(world):
    d = world.deliver(kg=100).json()  # 30,000
    world.pay(amount=30_000)
    res = world.manager.post(f"/api/deliveries/{d['id']}/void", json={"reason": "Chosen wrong farmer"})
    assert res.status_code == 409 and "overpaid" in res.json()["detail"]
    assert world.balance() == 0


def test_nothing_can_be_deleted_or_edited_through_the_api(world):
    d = world.deliver(kg=10).json()
    p = None
    world.deliver(kg=100)
    p = world.pay(amount=100).json()
    for client in (world.manager, world.clerk, world.officer):
        for path in (f"/api/deliveries/{d['id']}", f"/api/payments/{p['id']}"):
            assert client.delete(path).status_code in (404, 405)
            assert client.put(path, json={}).status_code in (404, 405)
            assert client.patch(path, json={"amount": 1}).status_code in (404, 405)


def test_manager_renames_produce_and_it_is_audited(world):
    res = world.manager.patch(f"/api/produce/{world.maize}", json={"name": "Dry maize"})
    assert res.status_code == 200 and res.json()["name"] == "Dry maize"
    assert world.manager.get("/api/deliveries").json()["items"] == []
    assert any("Dry maize" in e["summary"] or e["action"].startswith("produce") for e in world.manager.get("/api/audit").json())
    assert world.clerk.patch(f"/api/produce/{world.maize}", json={"name": "Other"}).status_code == 403


def test_repeated_delivery_submission_records_once(world):
    body = {"farmer_id": world.farmer, "produce_id": world.maize, "grade": "A",
            "weight_kg": "10", "client_id": "abc-12345-xyz"}
    a = world.clerk.post("/api/deliveries", json=body)
    b = world.clerk.post("/api/deliveries", json=body)
    assert a.status_code == 201 and b.status_code == 201
    assert a.json()["id"] == b.json()["id"]
    assert world.balance() == 3000


def test_repeated_payment_submission_records_once(world):
    world.deliver(kg=10)
    body = {"farmer_id": world.farmer, "amount": 1000, "method": "cash", "reference": "R-1",
            "client_id": "pay-12345-xyz"}
    a = world.officer.post("/api/payments", json=body)
    b = world.officer.post("/api/payments", json=body)
    assert a.status_code == 201 and b.status_code == 201
    assert a.json()["id"] == b.json()["id"]
    assert world.balance() == 2000
