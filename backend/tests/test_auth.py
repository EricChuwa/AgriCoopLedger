from app.models import User

REGISTER = {
    "full_name": "Eric Chuwa",
    "phone": "0788 123 456",
    "cooperative_name": "Abahuzamugambi Coop",
    "password": "harvest2026",
}


def register(client, **overrides):
    return client.post("/api/auth/register", json={**REGISTER, **overrides})


def test_register_creates_cooperative_and_manager(client):
    res = register(client)
    assert res.status_code == 201
    body = res.json()
    assert body["role"] == "manager"
    assert body["phone"] == "+250788123456"
    assert body["cooperative_name"] == "Abahuzamugambi Coop"
    assert "password" not in body and "password_hash" not in body


def test_password_is_stored_hashed(client):
    register(client)
    with client.test_session() as db:
        user = db.query(User).one()
        assert user.password_hash != REGISTER["password"]
        assert user.password_hash.startswith("$argon2")


def test_register_accepts_phone_formats(client):
    assert register(client, phone="+250 788 123 456").json()["phone"] == "+250788123456"


def test_register_rejects_duplicate_phone(client):
    register(client)
    res = register(client, phone="+250788123456", cooperative_name="Another Coop")
    assert res.status_code == 409
    assert res.json()["detail"]["field"] == "phone"


def test_register_rejects_bad_phone(client):
    assert register(client, phone="0711 123 456").status_code == 422


def test_register_rejects_short_password(client):
    assert register(client, password="short").status_code == 422


def test_login_sets_session_and_me_works(client):
    register(client)
    res = client.post("/api/auth/login", json={"username": "0788123456", "password": "harvest2026"})
    assert res.status_code == 200
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["full_name"] == "Eric Chuwa"


def test_login_wrong_password(client):
    register(client)
    res = client.post("/api/auth/login", json={"username": "0788123456", "password": "wrong-password"})
    assert res.status_code == 401
    assert client.get("/api/auth/me").status_code == 401


def test_login_unknown_phone_gives_same_error(client):
    register(client)
    wrong_pw = client.post("/api/auth/login", json={"username": "0788123456", "password": "nope-nope"})
    unknown = client.post("/api/auth/login", json={"username": "0788999999", "password": "nope-nope"})
    assert unknown.status_code == 401
    assert unknown.json() == wrong_pw.json()


def test_inactive_user_cannot_sign_in(client):
    register(client)
    with client.test_session() as db:
        user = db.query(User).one()
        user.is_active = False
        db.commit()
    res = client.post("/api/auth/login", json={"username": "0788123456", "password": "harvest2026"})
    assert res.status_code == 401


def test_logout_ends_session(client):
    register(client)
    client.post("/api/auth/login", json={"username": "0788123456", "password": "harvest2026"})
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_me_requires_sign_in(client):
    assert client.get("/api/auth/me").status_code == 401


def test_choosing_manager_needs_a_new_cooperative_name(client):
    assert register(client, account_type="manager").json()["role"] == "manager"
    again = register(client, account_type="manager", phone="0788 222 333")
    assert again.status_code == 409 and again.json()["detail"]["field"] == "cooperative_name"


def test_choosing_clerk_or_officer_needs_an_existing_cooperative(client):
    nothing = register(client, account_type="clerk", cooperative_name="Nobody Coop")
    assert nothing.status_code == 404 and nothing.json()["detail"]["field"] == "cooperative_name"
    register(client, account_type="manager")
    for phone, kind in (("0788 222 333", "clerk"), ("0788 444 555", "payment_officer")):
        r = register(client, account_type=kind, phone=phone, cooperative_name="abahuzamugambi coop")
        assert r.status_code == 201
        body = r.json()
        assert body["approval"] == "pending" and body["role"] == kind


def test_an_unknown_account_type_is_refused(client):
    assert register(client, account_type="admin").status_code == 422
