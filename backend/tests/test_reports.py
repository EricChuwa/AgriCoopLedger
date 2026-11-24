"""Paged lists, statements, the period summary and the dashboard are all worked out on the server."""

from datetime import timedelta

from app.services import today


def test_deliveries_are_paged_and_totals_cover_every_page(world):
    for _ in range(5):
        world.deliver(kg=10)
    r1 = world.manager.get("/api/deliveries", params={"page_size": 2, "page": 1}).json()
    r3 = world.manager.get("/api/deliveries", params={"page_size": 2, "page": 3}).json()
    assert r1["total"] == 5 and len(r1["items"]) == 2 and len(r3["items"]) == 1
    assert r1["live_count"] == 5 and r1["live_kg"] == 50 and r1["live_value"] == 15_000
    ids = [d["id"] for d in r1["items"]] + [d["id"] for d in world.manager.get(
        "/api/deliveries", params={"page_size": 2, "page": 2}).json()["items"]] + [d["id"] for d in r3["items"]]
    assert len(set(ids)) == 5 and ids == sorted(ids, reverse=True)
    assert world.manager.get("/api/deliveries", params={"page_size": 500}).status_code == 422


def test_voided_rows_are_listed_but_not_in_live_totals(world):
    d = world.deliver(kg=10).json()
    world.deliver(kg=20)
    world.manager.post(f"/api/deliveries/{d['id']}/void", json={"reason": "Wrong farmer chosen"})
    r = world.manager.get("/api/deliveries").json()
    assert r["total"] == 2 and r["live_count"] == 1 and r["live_kg"] == 20


def test_delivery_search_and_grade_filter(world):
    d = world.deliver(farmer=world.farmer, kg=10, grade="A").json()
    world.deliver(farmer=world.farmer2, kg=10, grade="B")
    m = world.manager
    assert m.get("/api/deliveries", params={"q": "Immaculee"}).json()["total"] == 1
    assert m.get("/api/deliveries", params={"q": d["receipt_no"]}).json()["total"] == 1
    assert m.get("/api/deliveries", params={"grade": "B"}).json()["total"] == 1
    assert m.get("/api/deliveries", params={"q": "nobody"}).json()["total"] == 0


def test_payment_list_search_method_and_totals(world):
    world.deliver(kg=100)
    world.pay(amount=1000, method="cash", reference="")
    world.pay(amount=2000, method="momo", reference="MTN-777")
    o = world.officer
    all_ = o.get("/api/payments").json()
    assert all_["total"] == 2 and all_["live_amount"] == 3000
    assert o.get("/api/payments", params={"method": "momo"}).json()["total"] == 1
    assert o.get("/api/payments", params={"q": "MTN-777"}).json()["total"] == 1
    assert o.get("/api/payments", params={"q": "Immaculee"}).json()["total"] == 2


def test_statement_runs_a_balance_and_rolls_up_an_opening_balance(world):
    d = today()
    world.deliver(kg=100, date=(d - timedelta(days=10)).isoformat())  # 30,000
    world.pay(amount=10_000)                                          # today
    world.deliver(kg=10)                                              # today, 3,000
    s = world.manager.get(f"/api/farmers/{world.farmer}/statement").json()
    assert [r["balance"] for r in s["rows"]] == [30_000, 33_000, 23_000]  # delivery before payment on the same day
    assert s["balance"] == 23_000 == world.balance()
    assert s["delivered_kg"] == 110 and s["delivered_value"] == 33_000 and s["paid_total"] == 10_000
    part = world.manager.get(f"/api/farmers/{world.farmer}/statement",
                             params={"date_from": (d - timedelta(days=1)).isoformat()}).json()
    assert part["show_opening"] and part["opening"] == 30_000 and len(part["rows"]) == 2
    assert part["balance"] == 23_000


def test_statement_ignores_voided_entries_but_counts_them(world):
    d = world.deliver(kg=100).json()
    world.manager.post(f"/api/deliveries/{d['id']}/void", json={"reason": "Chosen wrong farmer"})
    s = world.manager.get(f"/api/farmers/{world.farmer}/statement").json()
    assert s["rows"] == [] and s["voided_count"] == 1 and s["balance"] == 0


def test_statement_is_scoped_to_the_cooperative(make_client, world):
    other = make_client()
    other.post("/api/auth/register", json={
        "full_name": "Other Manager", "phone": "0788111111", "cooperative_name": "Other Coop", "password": "harvest2026"})
    other.post("/api/auth/login", json={"username": "0788111111", "password": "harvest2026"})
    assert other.get(f"/api/farmers/{world.farmer}/statement").status_code == 404


def test_summary_totals_by_produce_and_farmer(world):
    world.deliver(farmer=world.farmer, kg=100, grade="A")   # 30,000
    world.deliver(farmer=world.farmer2, kg=40, grade="B")   # 10,000
    world.pay(amount=5000)
    s = world.manager.get("/api/reports/summary", params={"date_from": today().isoformat()}).json()
    assert s["deliveries"] == 2 and s["kg"] == 140 and s["delivered"] == 40_000 and s["paid"] == 5000
    assert {r["name"] for r in s["by_produce"]} == {"Maize, grade A", "Maize, grade B"}
    row = next(r for r in s["by_farmer"] if r["id"] == world.farmer)
    assert (row["kg"], row["delivered"], row["paid"], row["owed_now"]) == (100, 30_000, 5000, 25_000)
    assert world.officer.get("/api/reports/summary").status_code == 200
    assert world.clerk.get("/api/reports/summary").status_code == 403


def test_dashboard_figures(world):
    world.deliver(farmer=world.farmer, kg=100)
    world.deliver(farmer=world.farmer2, kg=10)
    world.pay(amount=1000)
    d = world.manager.get("/api/dashboard").json()
    assert d["total_owed"] == 32_000 and d["farmers_owed"] == 2
    assert d["delivered_today_kg"] == 110 and d["deliveries_today"] == 2 and d["paid_today"] == 1000
    assert d["farmers_this_week"] == 2 and len(d["week"]) == 7 and d["week"][-1]["kg"] == 110
    assert d["largest_balances"][0]["owed"] == 29_000
    assert len(d["recent_deliveries"]) == 2 and len(d["recent_payments"]) == 1
    for client in (world.clerk, world.officer):
        assert client.get("/api/dashboard").status_code == 200


def test_farmer_list_has_last_delivery_date(world):
    world.deliver(farmer=world.farmer, kg=10)
    rows = {f["id"]: f for f in world.manager.get("/api/farmers").json()}
    assert rows[world.farmer]["last_delivery_date"] == today().isoformat()
    assert rows[world.farmer2]["last_delivery_date"] is None


def test_dashboard_produce_mix_is_the_weeks_kilograms_by_produce_and_never_counts_voided(world):
    first = world.deliver(farmer=world.farmer, kg=100).json()
    world.deliver(farmer=world.farmer2, kg=40)
    world.manager.post(f"/api/deliveries/{first['id']}/void", json={"reason": "entered twice"})
    for client in (world.manager, world.clerk, world.officer):
        mix = client.get("/api/dashboard").json()["produce_week"]
        assert [(m["name"], m["kg"]) for m in mix] == [("Maize", 40)]


def test_period_bounds_cover_the_named_week_month_and_quarter():
    from datetime import date
    from app.routers.reports import period_bounds
    now = date(2026, 11, 24)
    assert period_bounds(now, "week") == (date(2026, 11, 18), now)
    assert period_bounds(now, "month") == (date(2026, 11, 1), now)
    assert period_bounds(now, "last_month") == (date(2026, 10, 1), date(2026, 10, 31))
    assert period_bounds(now, "quarter") == (date(2026, 10, 1), now)
    assert period_bounds(now, "last_quarter") == (date(2026, 7, 1), date(2026, 9, 30))
    jan = date(2027, 1, 15)
    assert period_bounds(jan, "last_month") == (date(2026, 12, 1), date(2026, 12, 31))
    assert period_bounds(jan, "last_quarter") == (date(2026, 10, 1), date(2026, 12, 31))


def test_produce_mix_endpoint_filters_by_period_and_skips_voided(world):
    first = world.deliver(farmer=world.farmer, kg=100).json()
    world.deliver(farmer=world.farmer2, kg=40)
    world.deliver(farmer=world.farmer2, kg=7, date=(today() - timedelta(days=400)).isoformat())
    world.manager.post(f"/api/deliveries/{first['id']}/void", json={"reason": "entered twice"})
    for client in (world.manager, world.clerk, world.officer):
        for period in ("week", "month", "quarter"):
            r = client.get("/api/reports/produce-mix", params={"period": period}).json()
            assert r["total_kg"] == 40 and [(i["name"], i["kg"]) for i in r["items"]] == [("Maize", 40)]
    assert world.manager.get("/api/reports/produce-mix", params={"period": "year"}).status_code == 422
