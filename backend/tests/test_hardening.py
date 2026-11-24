"""Fixes from the SRS review: correction pricing, payment races, approval to join a cooperative, strict input."""

from sqlalchemy.dialects import postgresql

from app import audit
from app.models import AuditEntry, User
from tests.conftest import FAR_PAST, PASSWORD, World

COOP = {"full_name": "Eric Chuwa", "phone": "0788 700 001", "cooperative_name": "Test Coop", "password": PASSWORD}


# ---------- 1. a correction keeps the price the delivery was recorded under ----------

def test_weight_only_correction_keeps_the_recorded_price(make_client):
    w = World(make_client)
    d = w.deliver(kg=10, date="2026-11-10").json()
    assert d["price_per_kg"] == 300
    # A Manager later sets a new price that starts on the same day as that delivery.
    assert w.manager.post(f"/api/produce/{w.maize}/prices",
                          json={"grade": "A", "price_per_kg": 400, "effective_from": "2026-11-10"}).status_code == 201
    r = w.manager.post(f"/api/deliveries/{d['id']}/correct", json={"reason": "scale was misread", "weight_kg": 11})
    assert r.status_code == 200
    assert (r.json()["price_per_kg"], r.json()["value"]) == (300, 3300)  # not 400 / 4400


def test_grade_change_uses_that_grades_price_on_the_delivery_date(make_client):
    w = World(make_client)
    d = w.deliver(kg=10, date="2026-11-10").json()
    r = w.manager.post(f"/api/deliveries/{d['id']}/correct", json={"reason": "wrong grade", "grade": "B"})
    assert (r.json()["price_per_kg"], r.json()["value"]) == (250, 2500)


def test_a_clerks_pending_request_previews_the_recorded_price(make_client):
    w = World(make_client)
    d = w.deliver(kg=10, date="2026-11-10").json()
    w.manager.post(f"/api/produce/{w.maize}/prices", json={"grade": "A", "price_per_kg": 400, "effective_from": "2026-11-10"})
    req = w.clerk.post("/api/corrections", json={"delivery_id": d["id"], "weight_kg": 12, "reason": "typo on the slip"})
    assert req.status_code == 201 and req.json()["new_value"] == 3600  # 12 kg at 300
    ok = w.manager.post(f"/api/corrections/{req.json()['id']}/approve", json={"note": ""})
    assert ok.status_code == 200 and ok.json()["new_value"] == 3600


# ---------- 2. the balance is read under the cooperative lock ----------

def test_money_changes_take_the_cooperative_lock_before_reading_the_balance(make_client, monkeypatch):
    from app.routers import deliveries, payments

    w = World(make_client)
    d = w.deliver(kg=100).json()
    calls = []
    real_lock, real_pay_balance, real_del_balance = audit.lock_cooperative, payments.balance_of, deliveries.balance_of
    monkeypatch.setattr(audit, "lock_cooperative", lambda db, cid: (calls.append("lock"), real_lock(db, cid))[1])
    monkeypatch.setattr(payments, "balance_of", lambda db, fid: (calls.append("balance"), real_pay_balance(db, fid))[1])
    monkeypatch.setattr(deliveries, "balance_of", lambda db, fid: (calls.append("balance"), real_del_balance(db, fid))[1])

    assert w.pay(amount=1000).status_code == 201
    assert calls[:2] == ["lock", "balance"]
    calls.clear()
    assert w.manager.post(f"/api/deliveries/{d['id']}/correct", json={"reason": "weight typo", "weight_kg": 99}).status_code == 200
    assert calls[0] == "lock" and "balance" in calls
    calls.clear()
    assert w.manager.post(f"/api/deliveries/{d['id']}/void", json={"reason": "entered twice"}).status_code in (200, 409)
    assert calls[0] == "lock"


def test_the_lock_is_a_for_update_on_postgresql():
    from sqlalchemy import select
    from app.models import Cooperative

    sql = str(select(Cooperative.id).where(Cooperative.id == 1).with_for_update().compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in sql


def test_a_repeated_payment_submission_still_returns_the_first(make_client):
    w = World(make_client)
    w.deliver(kg=100)
    body = {"farmer_id": w.farmer, "amount": 30000, "method": "cash", "client_id": "pay-once-1234"}
    first = w.officer.post("/api/payments", json=body)
    again = w.officer.post("/api/payments", json=body)  # the farmer is now fully paid, yet the repeat is not an error
    assert first.status_code == 201 and again.status_code == 201 and again.json()["id"] == first.json()["id"]


# ---------- 3. joining an existing cooperative needs the Manager's approval ----------

def _join(make_client, **over):
    client = make_client()
    res = client.post("/api/auth/register", json={**COOP, **over})
    return client, res


def test_the_first_person_with_a_new_name_becomes_its_manager(make_client):
    client, res = _join(make_client, cooperative_name="Brand New Coop")
    assert res.status_code == 201 and res.json()["role"] == "manager" and res.json()["approval"] == "approved"
    assert client.post("/api/auth/login", json={"username": "0788700001", "password": PASSWORD}).status_code == 200


def test_naming_an_existing_cooperative_sends_a_request_and_blocks_sign_in(make_client):
    w = World(make_client)
    client, res = _join(make_client, cooperative_name="  test   COOP ")  # capitals and spacing do not matter
    assert res.status_code == 201 and res.json()["approval"] == "pending"
    assert res.json()["cooperative_name"] == "Test Coop"
    login = client.post("/api/auth/login", json={"username": "0788700001", "password": PASSWORD})
    assert login.status_code == 403 and "Test Coop" in login.json()["detail"] and "approve" in login.json()["detail"]
    assert client.get("/api/auth/me").status_code == 401
    # a wrong password learns nothing about the request
    wrong = client.post("/api/auth/login", json={"username": "0788700001", "password": "not-the-password"})
    assert wrong.status_code == 401
    # nothing was created: still one cooperative's worth of staff plus the applicant
    with make_client.session() as db:
        assert db.query(User).filter(User.approval == "pending").count() == 1


def test_the_manager_sees_the_request_and_approves_it_with_a_role(make_client):
    w = World(make_client)
    applicant, _ = _join(make_client)
    staff = w.manager.get("/api/users").json()
    waiting = [u for u in staff if u["approval"] == "pending"]
    assert len(waiting) == 1 and waiting[0]["full_name"] == "Eric Chuwa" and waiting[0]["is_active"] is False

    res = w.manager.post(f"/api/users/{waiting[0]['id']}/approve", json={"role": "payment_officer"})
    assert res.status_code == 200 and res.json()["role"] == "payment_officer" and res.json()["approval"] == "approved"
    assert applicant.post("/api/auth/login", json={"username": "0788700001", "password": PASSWORD}).status_code == 200
    assert applicant.get("/api/auth/me").json()["role"] == "payment_officer"
    assert w.manager.post(f"/api/users/{waiting[0]['id']}/approve", json={"role": "clerk"}).status_code == 409


def test_a_declined_request_cannot_sign_in_but_can_be_approved_later(make_client):
    w = World(make_client)
    applicant, _ = _join(make_client)
    uid = next(u["id"] for u in w.manager.get("/api/users").json() if u["approval"] == "pending")
    assert w.manager.post(f"/api/users/{uid}/reject").status_code == 200
    login = applicant.post("/api/auth/login", json={"username": "0788700001", "password": PASSWORD})
    assert login.status_code == 403 and "did not approve" in login.json()["detail"]
    assert w.manager.post(f"/api/users/{uid}/reject").status_code == 409  # only a waiting request can be declined
    assert w.manager.post(f"/api/users/{uid}/approve", json={"role": "clerk"}).status_code == 200
    assert applicant.post("/api/auth/login", json={"username": "0788700001", "password": PASSWORD}).status_code == 200


def test_only_that_cooperatives_manager_can_decide(make_client):
    w = World(make_client)
    _join(make_client)
    uid = next(u["id"] for u in w.manager.get("/api/users").json() if u["approval"] == "pending")
    assert w.clerk.post(f"/api/users/{uid}/approve", json={"role": "manager"}).status_code == 403
    assert w.officer.post(f"/api/users/{uid}/reject").status_code == 403
    other, _ = _join(make_client, phone="0788 700 002", cooperative_name="Other Coop", full_name="Other Manager")
    other.post("/api/auth/login", json={"username": "0788700002", "password": PASSWORD})
    assert other.post(f"/api/users/{uid}/approve", json={"role": "clerk"}).status_code == 404
    assert other.post(f"/api/users/{uid}/reject").status_code == 404


def test_a_waiting_person_cannot_be_edited_activated_or_given_a_role_by_the_staff_route(make_client):
    w = World(make_client)
    _join(make_client)
    uid = next(u["id"] for u in w.manager.get("/api/users").json() if u["approval"] == "pending")
    for body in ({"is_active": True}, {"role": "manager"}, {"full_name": "Someone Else"}):
        assert w.manager.patch(f"/api/users/{uid}", json=body).status_code == 422
    assert w.manager.post(f"/api/users/{uid}/reset-password").status_code == 200  # allowed, harmless: still cannot sign in


def test_the_request_and_the_decision_are_in_the_audit_log(make_client):
    w = World(make_client)
    _join(make_client)
    uid = next(u["id"] for u in w.manager.get("/api/users").json() if u["approval"] == "pending")
    w.manager.post(f"/api/users/{uid}/approve", json={"role": "clerk"})
    actions = [e["action"] for e in w.manager.get("/api/audit").json()]
    assert "user.requested" in actions and "user.approved" in actions
    assert w.manager.get("/api/audit/verify").json()["ok"] is True


# ---------- 4. strict input ----------

def test_money_amounts_must_be_whole_json_numbers(make_client):
    w = World(make_client)
    w.deliver(kg=100)
    for bad in (True, False, "1000", 1000.0, 12.5, 1e3, None, "abc", -1, 0, 2_000_000_001):
        r = w.officer.post("/api/payments", json={"farmer_id": w.farmer, "amount": bad, "method": "cash"})
        assert r.status_code == 422, bad
    assert w.balance() == 30000
    assert w.officer.post("/api/payments", json={"farmer_id": w.farmer, "amount": 1000, "method": "cash"}).status_code == 201


def test_weights_are_plain_decimals_with_at_most_three_places(make_client):
    w = World(make_client)
    for bad in ("1E+2", "1e2", "NaN", "Infinity", "-5", "0", "0.0005", "12.3456", ".5", "12.", "1,000", "١٢", True, [], {}, "1234567"):
        r = w.clerk.post("/api/deliveries", json={"farmer_id": w.farmer, "produce_id": w.maize, "grade": "A", "weight_kg": bad})
        assert r.status_code == 422, bad
    for good, grams in (("12.345", 12345), (12.5, 12500), (7, 7000), (" 3.2 ", 3200)):
        r = w.clerk.post("/api/deliveries", json={"farmer_id": w.farmer, "produce_id": w.maize, "grade": "A", "weight_kg": good})
        assert r.status_code == 201, good
        assert round(r.json()["weight_kg"] * 1000) == grams


def test_ids_must_be_whole_json_numbers(make_client):
    w = World(make_client)
    for bad in ("1", True, 1.5, 0, -1):
        r = w.clerk.post("/api/deliveries", json={"farmer_id": bad, "produce_id": w.maize, "grade": "A", "weight_kg": 5})
        assert r.status_code == 422, bad


def test_unknown_fields_are_refused(make_client):
    w = World(make_client)
    r = w.clerk.post("/api/deliveries", json={"farmer_id": w.farmer, "produce_id": w.maize, "grade": "A", "weight_kg": 5,
                                              "value": 999999, "recorded_by_id": 1})
    assert r.status_code == 422
    r = w.manager.post("/api/users", json={"full_name": "Some Body", "phone": "0788000077", "role": "clerk", "approval": "approved"})
    assert r.status_code == 422
    assert w.manager.patch("/api/cooperative", json={"name": "Test Coop", "id": 5}).status_code == 422


def test_dates_must_be_written_yyyy_mm_dd(make_client):
    w = World(make_client)
    for bad in (1700000000, "1700000000", "2026-11-10T00:00:00", "10/11/2026", "2026-13-01", "20261110", True):
        r = w.clerk.post("/api/deliveries", json={"farmer_id": w.farmer, "produce_id": w.maize, "grade": "A",
                                                  "weight_kg": 5, "delivery_date": bad})
        assert r.status_code == 422, bad
    assert w.clerk.post("/api/deliveries", json={"farmer_id": w.farmer, "produce_id": w.maize, "grade": "A",
                                                 "weight_kg": 5, "delivery_date": "2026-11-10"}).status_code == 201


def test_text_fields_match_their_kind(make_client):
    w = World(make_client)

    def farmer(**over):
        body = {"full_name": "Valid Name", "national_id": "1199080099999999", **over}
        return w.clerk.post("/api/farmers", json=body).status_code

    assert farmer() == 201
    assert farmer(full_name="Jean-Pierre O'Neil", national_id="1199080088888888") == 201
    for bad in ("R2D2", "<script>x</script>", "Name; DROP TABLE", "Bad\x00Name", "12345", "-Leading", "A"):
        assert farmer(full_name=bad, national_id="1199080077777777") == 422, bad
    for bad in ("1199080077777٧٧٧", "119908007777777", "1199080077777777a"):
        assert farmer(national_id=bad) == 422, bad
    assert farmer(national_id="1199 0800-6666 6666", full_name="Spaced Id") == 201
    assert farmer(village="Tumba (Huye)", national_id="1199080055555555", full_name="With Village") == 201
    assert farmer(village="<b>", national_id="1199080044444444", full_name="Bad Village") == 422


def test_names_of_places_and_produce(make_client):
    w = World(make_client)
    assert w.manager.post("/api/produce", json={"name": "Irish Potato", "prices": [
        {"grade": "A", "price_per_kg": 200, "effective_from": FAR_PAST}]}).status_code == 201
    for bad in ("Maize!", "<i>", "x"):
        assert w.manager.post("/api/produce", json={"name": bad, "prices": [{"grade": "A", "price_per_kg": 1}]}).status_code == 422, bad
    assert w.manager.patch("/api/cooperative", json={"name": "Abahuzamugambi (Huye) Ltd", "district": "Huye"}).status_code == 200
    assert w.manager.patch("/api/cooperative", json={"name": "Bad;Name"}).status_code == 422


def test_references_and_submission_ids(make_client):
    w = World(make_client)
    w.deliver(kg=100)

    def pay(**over):
        return w.officer.post("/api/payments", json={"farmer_id": w.farmer, "amount": 100, "method": "momo", **over}).status_code

    assert pay(reference="MP240101.1234.A56") == 201
    for bad in ("has space", "semi;colon", "<x>", "١٢٣"):
        assert pay(reference=bad) == 422, bad
    assert pay(client_id="short") == 422
    assert pay(client_id="bad id with spaces") == 422
    assert pay(client_id="c-lx3k9a-0abcdef123") == 201


def test_reasons_refuse_control_characters_but_allow_a_line_break(make_client):
    w = World(make_client)
    d = w.deliver(kg=10).json()
    assert w.manager.post(f"/api/deliveries/{d['id']}/void", json={"reason": "bad\x00reason"}).status_code == 422
    assert w.manager.post(f"/api/deliveries/{d['id']}/void", json={"reason": "     "}).status_code == 422
    assert w.manager.post(f"/api/deliveries/{d['id']}/void", json={"reason": "entered twice,\nby mistake"}).status_code == 200


def test_booleans_for_flags_are_real_booleans(make_client):
    w = World(make_client)
    clerk = next(u for u in w.manager.get("/api/users").json() if u["role"] == "clerk")
    for bad in ("false", 0, "no"):
        assert w.manager.patch(f"/api/users/{clerk['id']}", json={"is_active": bad}).status_code == 422, bad


def test_search_treats_percent_and_underscore_literally(make_client):
    w = World(make_client)
    assert len(w.manager.get("/api/farmers", params={"q": "%"}).json()) == 0
    assert len(w.manager.get("/api/farmers", params={"q": "_"}).json()) == 0
    assert len(w.manager.get("/api/farmers", params={"q": "Immaculee"}).json()) == 1
    assert w.manager.get("/api/deliveries", params={"q": "%"}).json()["total"] == 0


def test_login_and_password_bodies_are_checked_too(make_client):
    w = World(make_client)
    assert w.login(make_client(), "0788000001").status_code == 200
    assert make_client().post("/api/auth/login", json={"username": "0788000001", "password": PASSWORD, "x": 1}).status_code == 422
    assert make_client().post("/api/auth/login", json={"username": True, "password": PASSWORD}).status_code == 422
    r = make_client().post("/api/auth/register", json={**COOP, "cooperative_name": "New Co", "password": "pass\x00word1"})
    assert r.status_code == 422
