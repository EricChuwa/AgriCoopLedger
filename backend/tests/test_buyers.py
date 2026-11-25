"""The buyer side (FR 12): public requests, sales from stock, buyer payments confirmed by a Payment Officer."""


def stock(world, kg=100, grade="A"):
    assert world.deliver(kg=kg, grade=grade).status_code == 201


def coop_id(world):
    return world.manager.get("/api/cooperative").json()["id"]


def request(client, world, kg=10, grade="A", phone="0788555111", name="Marie Buyer"):
    return client.post("/api/public/orders", json={
        "cooperative_id": coop_id(world), "produce_id": world.maize, "grade": grade, "weight_kg": kg,
        "buyer_name": name, "buyer_phone": phone})


def sell(world, kg=10, price=400, **extra):
    body = {"buyer_name": "Marie Buyer", "buyer_phone": "0788555111", "produce_id": world.maize, "grade": "A",
            "weight_kg": kg, "price_per_kg": price, **extra}
    return world.clerk.post("/api/sales", json=body)


def receive(world, sale_id, amount, **extra):
    return world.clerk.post(f"/api/sales/{sale_id}/payments", json={"amount": amount, "method": "cash", **extra})


# ---------- public ----------

def test_public_stock_shows_kilograms_only(world, make_client):
    stock(world, 100)
    anon = make_client()
    r = anon.get("/api/public/stock")
    assert r.status_code == 200
    coop = r.json()[0]
    assert coop["cooperative_name"] == "Test Coop"
    assert coop["items"] == [{"produce_id": world.maize, "produce_name": "Maize", "grade": "A", "available_kg": 100.0}]
    assert "price" not in str(r.json())


def test_empty_stock_is_not_listed(world, make_client):
    assert make_client().get("/api/public/stock").json() == []


def test_anyone_can_request_and_the_clerk_sees_it(world, make_client):
    stock(world)
    r = request(make_client(), world, kg=25)
    assert r.status_code == 201, r.text
    assert r.json()["number"].startswith("O-")
    orders = world.clerk.get("/api/orders").json()
    assert len(orders) == 1 and orders[0]["status"] == "requested" and orders[0]["weight_kg"] == 25
    assert orders[0]["buyer_phone"] == "+250788555111"
    assert world.manager.get("/api/orders").status_code == 200
    assert world.officer.get("/api/orders").status_code == 403


def test_request_is_checked(world, make_client):
    stock(world, 50)
    anon = make_client()
    assert request(anon, world, kg=60).status_code == 409           # more than stock
    assert request(anon, world, phone="12345").status_code == 422   # not a Rwandan mobile
    assert request(anon, world, name="X").status_code == 422
    assert request(anon, world, kg=0).status_code == 422
    assert request(anon, world, grade="B").status_code == 409       # none in stock
    r = anon.post("/api/public/orders", json={"cooperative_id": 9999, "produce_id": 1, "grade": "A", "weight_kg": 1,
                                              "buyer_name": "Marie Buyer", "buyer_phone": "0788555111"})
    assert r.status_code == 409


def test_one_phone_cannot_flood_a_cooperative(world, make_client):
    stock(world, 100)
    anon = make_client()
    for _ in range(3):
        assert request(anon, world, kg=1).status_code == 201
    assert request(anon, world, kg=1).status_code == 409
    assert request(anon, world, kg=1, phone="0788555222").status_code == 201


def test_a_request_is_audited_and_the_chain_still_verifies(world, make_client):
    stock(world)
    request(make_client(), world)
    log = world.manager.get("/api/audit").json()
    items = log["items"] if isinstance(log, dict) else log
    assert any(e["action"] == "order.requested" for e in items)
    assert world.manager.get("/api/audit/verify").json()["ok"] is True


# ---------- orders to sales ----------

def test_clerk_accepts_an_order_and_it_becomes_a_sale(world, make_client):
    stock(world, 100)
    o = request(make_client(), world, kg=40).json()
    oid = world.clerk.get("/api/orders").json()[0]["id"]
    r = world.clerk.post(f"/api/orders/{oid}/accept", json={"price_per_kg": 400})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "accepted" and r.json()["sale_no"].startswith("S-")
    sale = world.manager.get("/api/sales").json()[0]
    assert sale["value"] == 16_000 and sale["status"] == "unpaid" and sale["order_no"] == o["number"]
    assert world.clerk.post(f"/api/orders/{oid}/accept", json={"price_per_kg": 400}).status_code == 409


def test_decline_needs_a_reason(world, make_client):
    stock(world)
    request(make_client(), world)
    oid = world.clerk.get("/api/orders").json()[0]["id"]
    assert world.clerk.post(f"/api/orders/{oid}/decline", json={}).status_code == 422
    r = world.clerk.post(f"/api/orders/{oid}/decline", json={"reason": "Already promised elsewhere"})
    assert r.status_code == 200 and r.json()["status"] == "declined"
    assert r.json()["decline_reason"] == "Already promised elsewhere"


def test_only_the_clerk_handles_orders(world, make_client):
    stock(world)
    request(make_client(), world)
    oid = world.clerk.get("/api/orders").json()[0]["id"]
    for who in (world.manager, world.officer):
        assert who.post(f"/api/orders/{oid}/accept", json={"price_per_kg": 400}).status_code == 403
        assert who.post(f"/api/orders/{oid}/decline", json={"reason": "Not my job"}).status_code == 403


# ---------- sales and stock ----------

def test_a_sale_cannot_exceed_stock_and_stock_goes_down(world, make_client):
    stock(world, 50)
    assert sell(world, kg=60).status_code == 409
    assert sell(world, kg=30).status_code == 201
    assert sell(world, kg=30).status_code == 409  # only 20 left
    summary = world.manager.get("/api/sales/summary").json()
    line = summary["stock"][0]
    assert (line["received_kg"], line["sold_kg"], line["on_hand_kg"]) == (50, 30, 20)
    assert make_client().get("/api/public/stock").json()[0]["items"][0]["available_kg"] == 20


def test_sale_value_rounds_half_up_and_repeat_submission_records_once(world):
    stock(world, 100)
    world.manager.post(f"/api/produce/{world.maize}/selling-prices", json={"grade": "A", "price_per_kg": 700})
    a = sell(world, kg=12.345, price=700, client_id="repeat-0001")
    b = sell(world, kg=12.345, price=700, client_id="repeat-0001")
    assert a.status_code == 201 and a.json()["value"] == 8_642
    assert a.json()["id"] == b.json()["id"]
    assert len(world.manager.get("/api/sales").json()) == 1


def test_only_the_clerk_records_a_sale(world):
    stock(world)
    body = {"buyer_name": "Marie Buyer", "buyer_phone": "0788555111", "produce_id": world.maize, "grade": "A",
            "weight_kg": 5, "price_per_kg": 400}
    for who in (world.manager, world.officer):
        assert who.post("/api/sales", json=body).status_code == 403


def test_voiding_a_sale_returns_stock_but_not_with_money_on_it(world):
    stock(world, 50)
    s = sell(world, kg=50).json()
    assert world.clerk.post(f"/api/sales/{s['id']}/void", json={"reason": "Buyer cancelled"}).status_code == 200
    assert sell(world, kg=50).status_code == 201  # stock is back
    s2 = world.manager.get("/api/sales").json()[0]
    receive(world, s2["id"], 1000)
    assert world.clerk.post(f"/api/sales/{s2['id']}/void", json={"reason": "Changed my mind"}).status_code == 409


# ---------- buyer payments ----------

def test_payment_is_pending_until_an_officer_confirms(world):
    stock(world, 100)
    s = sell(world, kg=10, price=400).json()  # 4,000
    p = receive(world, s["id"], 1500, reference="MOMO123")
    assert p.status_code == 201, p.text
    assert p.json()["status"] == "pending" and p.json()["number"].startswith("R-")
    row = world.manager.get("/api/sales").json()[0]
    assert (row["confirmed"], row["pending"], row["owed"], row["status"]) == (0, 1500, 4000, "unpaid")
    c = world.officer.post(f"/api/buyer-payments/{p.json()['id']}/confirm", json={})
    assert c.status_code == 200 and c.json()["status"] == "confirmed" and c.json()["decided_by"] == "Claudine Uwase"
    row = world.manager.get("/api/sales").json()[0]
    assert (row["confirmed"], row["pending"], row["owed"], row["status"]) == (1500, 0, 2500, "part_paid")
    p2 = receive(world, s["id"], 2500).json()
    world.officer.post(f"/api/buyer-payments/{p2['id']}/confirm", json={})
    assert world.manager.get("/api/sales").json()[0]["status"] == "paid"


def test_cannot_record_more_than_the_sale_is_worth_counting_pending(world):
    stock(world, 100)
    s = sell(world, kg=10, price=400).json()  # 4,000
    assert receive(world, s["id"], 5000).status_code == 409
    assert receive(world, s["id"], 3000).status_code == 201
    assert receive(world, s["id"], 1500).status_code == 409  # 3,000 is already waiting
    assert receive(world, s["id"], 1000).status_code == 201
    assert receive(world, s["id"], 1).status_code == 409


def test_a_rejected_payment_frees_the_room_and_needs_a_note(world):
    stock(world, 100)
    s = sell(world, kg=10, price=400).json()
    p = receive(world, s["id"], 4000).json()
    assert world.officer.post(f"/api/buyer-payments/{p['id']}/reject", json={}).status_code == 422
    r = world.officer.post(f"/api/buyer-payments/{p['id']}/reject", json={"note": "Not on the mobile money statement"})
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    assert receive(world, s["id"], 4000).status_code == 201
    assert world.officer.post(f"/api/buyer-payments/{p['id']}/confirm", json={}).status_code == 409  # already decided


def test_only_the_officer_decides_and_only_the_clerk_records(world):
    stock(world)
    s = sell(world).json()
    for who in (world.manager, world.officer):
        assert who.post(f"/api/sales/{s['id']}/payments", json={"amount": 100, "method": "cash"}).status_code == 403
    p = receive(world, s["id"], 100).json()
    for who in (world.manager, world.clerk):
        assert who.post(f"/api/buyer-payments/{p['id']}/confirm", json={}).status_code == 403
        assert who.post(f"/api/buyer-payments/{p['id']}/reject", json={"note": "Not mine to reject"}).status_code == 403


def test_reference_cannot_be_reused_but_can_after_rejection(world):
    stock(world, 100)
    s = sell(world, kg=10, price=400).json()
    p = receive(world, s["id"], 1000, reference="MOMO9").json()
    assert receive(world, s["id"], 1000, reference="momo9").status_code == 409
    world.officer.post(f"/api/buyer-payments/{p['id']}/reject", json={"note": "Wrong amount shown"})
    assert receive(world, s["id"], 1000, reference="MOMO9").status_code == 201


def test_summary_hooks_buyers_to_the_farmer_side(world):
    stock(world, 100)  # 30,000 owed to the farmer
    s = sell(world, kg=10, price=400).json()  # 4,000
    p = receive(world, s["id"], 4000).json()
    world.officer.post(f"/api/buyer-payments/{p['id']}/confirm", json={})
    world.pay(amount=10_000)
    x = world.manager.get("/api/sales/summary").json()
    assert (x["sold"], x["confirmed"], x["pending"], x["owed"]) == (4000, 4000, 0, 0)
    assert (x["paid_to_farmers"], x["owed_to_farmers"]) == (10_000, 20_000)
    for who in (world.clerk, world.officer):
        assert who.get("/api/sales/summary").status_code == 200


def test_everything_is_scoped_to_the_cooperative_and_audited(world, make_client):
    stock(world, 100)
    s = sell(world).json()
    p = receive(world, s["id"], 100).json()
    other = make_client()
    other.post("/api/auth/register", json={"full_name": "Other Boss", "phone": "0788777001", "cooperative_name": "Other Coop", "password": "harvest2026"})
    other.post("/api/auth/login", json={"username": "0788777001", "password": "harvest2026"})
    assert other.get("/api/sales").json() == [] and other.get("/api/buyer-payments").json() == []
    assert other.get("/api/orders").json() == []
    log = world.manager.get("/api/audit").json()
    items = log["items"] if isinstance(log, dict) else log
    actions = {e["action"] for e in items}
    assert {"sale.recorded", "buyer_payment.recorded"} <= actions
    assert world.manager.get("/api/audit/verify").json()["ok"] is True


# ---------- selling price set by the Manager ----------

def test_clerk_uses_the_managers_selling_price(world):
    stock(world, 100)
    body = {"buyer_name": "Marie Buyer", "buyer_phone": "0788555111", "produce_id": world.maize, "grade": "A", "weight_kg": 10}
    r = world.clerk.post("/api/sales", json=body)  # no price sent: the Manager's 400 is used
    assert r.status_code == 201 and r.json()["price_per_kg"] == 400 and r.json()["value"] == 4000
    assert world.clerk.post("/api/sales", json={**body, "price_per_kg": 450}).status_code == 422


def test_sale_needs_a_selling_price(world):
    r = world.manager.post("/api/produce", json={"name": "Rice", "prices": [{"grade": "A", "price_per_kg": 500}]})
    rice = r.json()["id"]
    body = {"farmer_id": world.farmer, "produce_id": rice, "grade": "A", "weight_kg": 50}
    assert world.clerk.post("/api/deliveries", json=body).status_code == 201
    sale = {"buyer_name": "Marie Buyer", "buyer_phone": "0788555111", "produce_id": rice, "grade": "A", "weight_kg": 5}
    assert world.clerk.post("/api/sales", json=sale).status_code == 409
    assert world.manager.post(f"/api/produce/{rice}/selling-prices", json={"grade": "A", "price_per_kg": 650}).status_code == 201
    assert world.clerk.post("/api/sales", json=sale).json()["price_per_kg"] == 650


def test_only_the_manager_sets_selling_prices_and_old_sales_keep_theirs(world):
    stock(world, 100)
    first = sell(world, kg=10).json()
    path = f"/api/produce/{world.maize}/selling-prices"
    for who in (world.clerk, world.officer):
        assert who.post(path, json={"grade": "A", "price_per_kg": 500}).status_code == 403
    assert world.manager.post(path, json={"grade": "A", "price_per_kg": 400}).status_code == 409
    r = world.manager.post(path, json={"grade": "A", "price_per_kg": 500})
    assert r.status_code == 201 and r.json()["selling_prices"][0]["price_per_kg"] == 500
    assert sell(world, kg=10, price=500).json()["price_per_kg"] == 500
    assert world.clerk.get("/api/sales").json()[-1]["price_per_kg"] == first["price_per_kg"] == 400
    assert world.clerk.get("/api/produce").json()[0]["selling_prices"][0]["price_per_kg"] == 500
