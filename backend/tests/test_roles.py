"""The role rules from the SRS (FR 1.5, BR 1, BR 2, NFR 11), checked on the server for every route.
A request is made as each role and the answer must be allowed or 403, never a hidden page."""

import pytest

# (method, path, body factory taking the world, roles allowed)
M, C, O = "manager", "clerk", "payment_officer"
ALL = {M, C, O}


def _rules(w):
    delivery = {"farmer_id": w.farmer, "produce_id": w.maize, "grade": "A", "weight_kg": 10}
    return [
        ("get", "/api/users", None, {M}),
        ("post", "/api/users", {"full_name": "New Person", "phone": "0788000099", "role": "clerk"}, {M}),
        ("get", "/api/audit", None, {M}),
        ("patch", "/api/cooperative", {"name": "Renamed Coop"}, {M}),
        ("get", "/api/cooperative", None, ALL),
        ("get", "/api/farmers", None, ALL),
        ("post", "/api/farmers", {"full_name": "Some Farmer", "national_id": "1199000011112222"}, {M, C}),
        ("post", f"/api/farmers/{w.farmer2}/deactivate", None, {M}),
        ("get", "/api/produce", None, ALL),
        ("post", "/api/produce", {"name": "Beans", "prices": [{"grade": "A", "price_per_kg": 700}]}, {M}),
        ("post", f"/api/produce/{w.maize}/prices", {"grade": "A", "price_per_kg": 310}, {M}),
        ("get", "/api/deliveries", None, ALL),
        ("post", "/api/deliveries", delivery, {C}),
        ("get", "/api/payments", None, ALL),
        ("post", "/api/payments", {"farmer_id": w.farmer, "amount": 1, "method": "cash"}, {O}),
        ("get", "/api/corrections", None, {M, C}),
    ]


ROLE_ATTR = {M: "manager", C: "clerk", O: "officer"}


@pytest.mark.parametrize("role", [M, C, O])
def test_every_route_enforces_its_roles(world, role):
    # Give the farmer something owed so the payment route has a valid target for the Payment Officer.
    assert world.deliver(kg=10).status_code == 201
    for method, path, body, allowed in _rules(world):
        client = getattr(world, ROLE_ATTR[role])
        res = getattr(client, method)(path, **({"json": body} if body is not None else {}))
        if role in allowed:
            assert res.status_code != 403, f"{role} should be allowed {method.upper()} {path}: {res.text}"
        else:
            assert res.status_code == 403, f"{role} must be refused {method.upper()} {path}, got {res.status_code}"
        # Pretend nothing changed so every role faces the same starting data.
        if res.status_code in (200, 201) and method == "post" and path == "/api/payments":
            world.manager.post(f"/api/payments/{res.json()['id']}/void", json={"reason": "test cleanup"})


def test_signed_out_user_gets_401_everywhere(make_client, world):
    anon = make_client()
    for path in ("/api/farmers", "/api/deliveries", "/api/payments", "/api/produce", "/api/users", "/api/audit"):
        assert anon.get(path).status_code == 401, path


def test_only_clerk_records_deliveries_not_even_manager(world):
    body = {"farmer_id": world.farmer, "produce_id": world.maize, "grade": "A", "weight_kg": 10}
    assert world.manager.post("/api/deliveries", json=body).status_code == 403
    assert world.officer.post("/api/deliveries", json=body).status_code == 403
    assert world.clerk.post("/api/deliveries", json=body).status_code == 201


def test_only_payment_officer_records_payments_not_even_manager(world):
    world.deliver(kg=100)
    body = {"farmer_id": world.farmer, "amount": 1000, "method": "cash"}
    assert world.manager.post("/api/payments", json=body).status_code == 403
    assert world.clerk.post("/api/payments", json=body).status_code == 403
    assert world.officer.post("/api/payments", json=body).status_code == 201


def test_only_manager_voids_corrects_and_sets_prices(world):
    d = world.deliver(kg=100).json()
    p = world.pay(amount=1000).json()
    for client in (world.clerk, world.officer):
        assert client.post(f"/api/deliveries/{d['id']}/void", json={"reason": "wrong farmer"}).status_code == 403
        assert client.post(f"/api/deliveries/{d['id']}/correct", json={"weight_kg": 90, "reason": "mis-weighed"}).status_code == 403
        assert client.post(f"/api/payments/{p['id']}/void", json={"reason": "wrong amount"}).status_code == 403
        assert client.post(f"/api/produce/{world.maize}/prices", json={"grade": "A", "price_per_kg": 999}).status_code == 403


def test_cooperatives_cannot_see_each_other(make_client, world):
    other = make_client()
    other.post("/api/auth/register", json={
        "full_name": "Other Manager", "phone": "0788111111", "cooperative_name": "Other Coop", "password": "harvest2026"})
    other.post("/api/auth/login", json={"username": "0788111111", "password": "harvest2026"})
    d = world.deliver(kg=50).json()
    assert other.get("/api/farmers").json() == []
    assert other.get("/api/deliveries").json()["items"] == []
    assert other.get(f"/api/farmers/{world.farmer}").status_code == 404
    assert other.get(f"/api/deliveries/{d['id']}").status_code == 404
    assert other.post(f"/api/deliveries/{d['id']}/void", json={"reason": "not yours"}).status_code == 404
    assert other.get("/api/audit").json()[0]["summary"].startswith("Registered Other Coop")


def test_payment_officer_sees_national_id_masked(world):
    full = world.manager.get(f"/api/farmers/{world.farmer}").json()["national_id"]
    masked = world.officer.get(f"/api/farmers/{world.farmer}").json()["national_id"]
    assert full == "1199080012345678"
    assert masked == "************5678"
    listed = world.officer.get("/api/farmers").json()
    assert all(f["national_id"].startswith("************") for f in listed)
    # Searching by the hidden ID must not reveal it either.
    assert world.officer.get("/api/farmers", params={"q": "1199080012345678"}).json() == []
    assert len(world.clerk.get("/api/farmers", params={"q": "1199080012345678"}).json()) == 1
