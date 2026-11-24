from app import models as m
from app.seed import seed


def test_seed_builds_a_consistent_demo_and_can_be_rerun(make_client):
    S = make_client.session
    seed(session_factory=S)
    seed(session_factory=S)  # second run does nothing
    seed(reset=True, session_factory=S)  # rebuild
    with S() as db:
        assert db.query(m.Cooperative).filter_by(name="Demo Cooperative (sample data)").count() == 1
        assert db.query(m.Farmer).count() == 10
        from app.services import balance_of
        assert all(balance_of(db, f.id) >= 0 for f in db.query(m.Farmer).all())
        assert db.query(m.Delivery).count() == 17 and db.query(m.Payment).count() >= 5
    c = make_client()
    assert c.post("/api/auth/login", json={"username": "0788000003", "password": "harvest2026"}).json()["role"] == "payment_officer"
