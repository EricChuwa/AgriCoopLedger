"""The landing page numbers are open to visitors, count only live entries, and carry nothing personal."""


def test_stats_are_open_and_empty_at_first(make_client):
    r = make_client().get("/api/public/stats")
    assert r.status_code == 200
    assert r.json() == {"cooperatives": 0, "farmers": 0, "deliveries": 0, "total_kg": 0}


def test_stats_count_live_entries_only(world, make_client):
    d = world.deliver(kg=10).json()
    world.deliver(kg=20)
    world.manager.post(f"/api/deliveries/{d['id']}/void", json={"reason": "Wrong farmer chosen"})
    body = make_client().get("/api/public/stats").json()
    assert body["cooperatives"] == 1 and body["deliveries"] == 1 and body["total_kg"] == 20
    assert body["farmers"] >= 1
    assert set(body) == {"cooperatives", "farmers", "deliveries", "total_kg"}
