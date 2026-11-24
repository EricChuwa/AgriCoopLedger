"""Staff accounts and sessions (FR 1.1 to 1.5, NFR 9 to 13)."""

import time

from app import deps
from app.models import User


def test_manager_creates_staff_who_can_sign_in_with_the_roles_given(world):
    res = world.manager.post("/api/users", json={"full_name": "Eric Chuwa", "phone": "0788 000 044", "role": "clerk"})
    assert res.status_code == 201
    body = res.json()
    assert body["role"] == "clerk" and body["phone"] == "+250788000044" and len(body["temp_password"]) >= 8
    client = world.make_client()
    assert world.login(client, "0788000044", body["temp_password"]).status_code == 200
    assert client.get("/api/auth/me").json()["role"] == "clerk"


def test_staff_password_is_stored_hashed(world):
    with world.make_client.session() as db:
        assert all(u.password_hash.startswith("$argon2") for u in db.query(User).all())


def test_phone_must_be_unique_and_valid(world):
    dup = world.manager.post("/api/users", json={"full_name": "Another Person", "phone": "0788000002", "role": "clerk"})
    assert dup.status_code == 409 and dup.json()["detail"]["field"] == "phone"
    assert world.manager.post("/api/users", json={"full_name": "Bad Phone", "phone": "12345", "role": "clerk"}).status_code == 422
    assert world.manager.post("/api/users", json={"full_name": "Bad Role", "phone": "0788000055", "role": "boss"}).status_code == 422


def test_manager_changes_a_role_and_the_new_permissions_apply(world):
    clerk = next(u for u in world.manager.get("/api/users").json() if u["role"] == "clerk")
    assert world.clerk.post("/api/payments", json={"farmer_id": world.farmer, "amount": 1, "method": "cash"}).status_code == 403
    res = world.manager.patch(f"/api/users/{clerk['id']}", json={"role": "payment_officer"})
    assert res.status_code == 200 and res.json()["role"] == "payment_officer"
    assert world.clerk.post("/api/deliveries", json={
        "farmer_id": world.farmer, "produce_id": world.maize, "grade": "A", "weight_kg": 5}).status_code == 403


def test_deactivated_staff_are_signed_out_and_cannot_sign_in(world):
    clerk = next(u for u in world.manager.get("/api/users").json() if u["role"] == "clerk")
    assert world.clerk.get("/api/farmers").status_code == 200
    assert world.manager.patch(f"/api/users/{clerk['id']}", json={"is_active": False}).status_code == 200
    assert world.clerk.get("/api/farmers").status_code == 401  # existing session stops working at once
    assert world.login(world.make_client(), "0788000002").status_code == 401
    world.manager.patch(f"/api/users/{clerk['id']}", json={"is_active": True})
    assert world.login(world.make_client(), "0788000002").status_code == 200


def test_manager_cannot_change_or_deactivate_themselves(world):
    me = world.manager.get("/api/auth/me").json()
    assert world.manager.patch(f"/api/users/{me['id']}", json={"role": "clerk"}).status_code == 422
    assert world.manager.patch(f"/api/users/{me['id']}", json={"is_active": False}).status_code == 422
    assert world.manager.patch(f"/api/users/{me['id']}", json={"full_name": "Aline U. Uwase"}).status_code == 200


def test_reset_password_gives_a_new_working_password_and_ends_the_old_one(world):
    clerk = next(u for u in world.manager.get("/api/users").json() if u["role"] == "clerk")
    res = world.manager.post(f"/api/users/{clerk['id']}/reset-password")
    assert res.status_code == 200
    new = res.json()["temp_password"]
    assert world.login(world.make_client(), "0788000002").status_code == 401  # old password
    assert world.login(world.make_client(), "0788000002", new).status_code == 200


def test_users_of_another_cooperative_cannot_be_touched(make_client, world):
    other = make_client()
    other.post("/api/auth/register", json={
        "full_name": "Other Manager", "phone": "0788111111", "cooperative_name": "Other Coop", "password": "harvest2026"})
    other.post("/api/auth/login", json={"username": "0788111111", "password": "harvest2026"})
    clerk = next(u for u in world.manager.get("/api/users").json() if u["role"] == "clerk")
    assert other.patch(f"/api/users/{clerk['id']}", json={"is_active": False}).status_code == 404
    assert other.post(f"/api/users/{clerk['id']}/reset-password").status_code == 404
    assert len(other.get("/api/users").json()) == 1


def test_change_own_password(world):
    ok = world.clerk.post("/api/auth/change-password", json={"current_password": "harvest2026", "new_password": "newer-pass-1"})
    assert ok.status_code == 204
    assert world.login(world.make_client(), "0788000002").status_code == 401
    assert world.login(world.make_client(), "0788000002", "newer-pass-1").status_code == 200
    wrong = world.clerk.post("/api/auth/change-password", json={"current_password": "nope-nope-1", "new_password": "another-pass-1"})
    assert wrong.status_code == 422 and wrong.json()["detail"]["field"] == "current"
    same = world.clerk.post("/api/auth/change-password", json={"current_password": "newer-pass-1", "new_password": "newer-pass-1"})
    assert same.status_code == 422
    short = world.clerk.post("/api/auth/change-password", json={"current_password": "newer-pass-1", "new_password": "short"})
    assert short.status_code == 422


def test_session_ends_after_15_minutes_of_inactivity(world, monkeypatch):
    start = time.time()
    clock = {"now": start}
    monkeypatch.setattr(deps.time, "time", lambda: clock["now"])
    assert world.login(world.clerk, "0788000002").status_code == 200  # login stamps real time; restamp below
    clock["now"] = start + 14 * 60
    assert world.clerk.get("/api/farmers").status_code == 200       # activity at 14 minutes keeps it alive
    clock["now"] = start + 14 * 60 + 14 * 60
    assert world.clerk.get("/api/farmers").status_code == 200       # 14 minutes after that is still fine
    clock["now"] = start + 14 * 60 + 14 * 60 + 15 * 60 + 1
    res = world.clerk.get("/api/farmers")
    assert res.status_code == 401 and "15 minutes" in res.json()["detail"]
    assert world.clerk.get("/api/farmers").status_code == 401       # and stays signed out


def test_idle_limit_is_fifteen_minutes():
    from app.config import SESSION_IDLE_SECONDS
    assert SESSION_IDLE_SECONDS == 15 * 60


def test_cooperative_details_can_be_updated_by_manager(world):
    res = world.manager.patch("/api/cooperative", json={"name": "Abahuzamugambi", "district": "Huye", "phone": "0788 123 456"})
    assert res.status_code == 200
    got = world.clerk.get("/api/cooperative").json()
    assert got["name"] == "Abahuzamugambi" and got["district"] == "Huye" and got["phone"] == "+250788123456"


def test_username_is_given_or_suggested_and_works_at_sign_in(world):
    given = world.manager.post("/api/users", json={
        "full_name": "Eric Chuwa", "username": "Eric.C", "phone": "0788000044", "role": "clerk", "password": "harvest2026"})
    assert given.status_code == 201 and given.json()["username"] == "eric.c"
    suggested = world.manager.post("/api/users", json={
        "full_name": "Eric Chuwa", "phone": "0788000045", "role": "clerk", "password": "harvest2026"})
    assert suggested.json()["username"] == "eric.chuwa"
    again = world.manager.post("/api/users", json={
        "full_name": "Eric Chuwa", "phone": "0788000046", "role": "clerk", "password": "harvest2026"})
    assert again.json()["username"] == "eric.chuwa2"
    # Sign in by username (any case), or by phone number.
    assert world.login(world.make_client(), "ERIC.C").status_code == 200
    assert world.login(world.make_client(), "eric.chuwa").status_code == 200
    assert world.login(world.make_client(), "0788000044").status_code == 200
    assert world.login(world.make_client(), "nobody").status_code == 401


def test_username_must_be_valid_and_unique(world):
    for bad in ("ab", "has space", "x" * 31, "bad!char"):
        res = world.manager.post("/api/users", json={"full_name": "Some One", "username": bad, "phone": "0788000047", "role": "clerk"})
        assert res.status_code == 422, bad
    world.manager.post("/api/users", json={"full_name": "First Person", "username": "taken.name", "phone": "0788000048", "role": "clerk"})
    dup = world.manager.post("/api/users", json={"full_name": "Second Person", "username": "taken.name", "phone": "0788000049", "role": "clerk"})
    assert dup.status_code == 409 and dup.json()["detail"]["field"] == "username"


def test_manager_edits_name_username_and_phone_of_staff(world):
    clerk = next(u for u in world.manager.get("/api/users").json() if u["role"] == "clerk")
    res = world.manager.patch(f"/api/users/{clerk['id']}", json={
        "full_name": "Patrick H. Habineza", "username": "patrick.h", "phone": "0788000060"})
    assert res.status_code == 200
    assert (res.json()["username"], res.json()["phone"]) == ("patrick.h", "+250788000060")
    assert world.login(world.make_client(), "patrick.h").status_code == 200
    clash = world.manager.patch(f"/api/users/{clerk['id']}", json={"username": "aline.uwase"})
    assert clash.status_code == 409
