"""Farmers (FR 2.1 to 2.4, BR 6, BR 7, NFR 3, NFR 8)."""


def test_register_farmer_with_national_id_and_membership_date(world):
    res = world.manager.post("/api/farmers", json={
        "full_name": "Alice Mukamana", "national_id": "1 2000 8 0055555 5 55".replace(" ", ""),
        "phone": "0789 317 744", "village": "Mukura", "member_since": "2024-03-15"})
    assert res.status_code == 201
    f = res.json()
    assert f["national_id"] == "1200080055555555" and f["phone"] == "+250789317744"
    assert f["member_since"] == "2024-03-15" and f["balance"] == 0 and f["is_active"] is True


def test_national_id_must_be_16_digits_and_unique_in_the_cooperative(world):
    for bad in ("123", "abcdefghijklmnop", "11990800123456789", ""):
        assert world.clerk.post("/api/farmers", json={"full_name": "Some Farmer", "national_id": bad}).status_code == 422
    dup = world.clerk.post("/api/farmers", json={"full_name": "Impostor Farmer", "national_id": "1199080012345678"})
    assert dup.status_code == 409 and dup.json()["detail"]["field"] == "national_id"
    spaced = world.clerk.post("/api/farmers", json={"full_name": "Impostor Farmer", "national_id": "1199 0800 1234 5678"})
    assert spaced.status_code == 409


def test_same_national_id_is_allowed_in_a_different_cooperative(make_client, world):
    other = make_client()
    other.post("/api/auth/register", json={
        "full_name": "Other Manager", "phone": "0788111111", "cooperative_name": "Other Coop", "password": "harvest2026"})
    other.post("/api/auth/login", json={"username": "0788111111", "password": "harvest2026"})
    res = other.post("/api/farmers", json={"full_name": "Immaculee Uwimana", "national_id": "1199080012345678"})
    assert res.status_code == 201


def test_phone_belongs_to_one_farmer(world):
    res = world.clerk.post("/api/farmers", json={
        "full_name": "Another Farmer", "national_id": "1199000011112222", "phone": "0788410231"})
    assert res.status_code == 409 and res.json()["detail"]["field"] == "phone"


def test_membership_date_cannot_be_in_the_future(world):
    res = world.clerk.post("/api/farmers", json={
        "full_name": "Future Farmer", "national_id": "1199000011112222", "member_since": "2999-01-01"})
    assert res.status_code == 422


def test_edit_farmer_keeps_deliveries_and_checks_uniqueness(world):
    world.deliver(kg=100)
    res = world.clerk.patch(f"/api/farmers/{world.farmer}", json={
        "full_name": "Immaculee Uwimana-Kamali", "national_id": "1199080012345678", "phone": "0788410231", "village": "Tumba"})
    assert res.status_code == 200 and res.json()["village"] == "Tumba" and res.json()["balance"] == 30_000
    clash = world.clerk.patch(f"/api/farmers/{world.farmer}", json={
        "full_name": "Immaculee Uwimana", "national_id": "1198570098765432"})
    assert clash.status_code == 409


def test_search_by_name_id_phone_and_village(world):
    c = world.clerk
    assert [f["full_name"] for f in c.get("/api/farmers", params={"q": "immac"}).json()] == ["Immaculee Uwimana"]
    assert [f["full_name"] for f in c.get("/api/farmers", params={"q": "1198570098765432"}).json()] == ["Jean Bosco Habimana"]
    assert [f["full_name"] for f in c.get("/api/farmers", params={"q": "0788 522 190"}).json()] == ["Jean Bosco Habimana"]
    assert [f["full_name"] for f in c.get("/api/farmers", params={"q": "+250788410231"}).json()] == ["Immaculee Uwimana"]
    assert c.get("/api/farmers", params={"q": "nobody"}).json() == []
    assert len(c.get("/api/farmers").json()) == 2


def test_cannot_deactivate_a_farmer_who_is_owed_money_and_history_is_kept(world):
    world.deliver(kg=100)
    res = world.manager.post(f"/api/farmers/{world.farmer}/deactivate")
    assert res.status_code == 409 and "30,000" in res.json()["detail"]
    world.pay(amount=30_000)
    assert world.manager.post(f"/api/farmers/{world.farmer}/deactivate").status_code == 200
    assert world.manager.get("/api/deliveries").json()["total"] == 1  # history stays
    assert world.manager.get(f"/api/farmers/{world.farmer}").json()["is_active"] is False


def test_farmers_cannot_be_deleted(world):
    assert world.manager.delete(f"/api/farmers/{world.farmer}").status_code in (404, 405)
