"""Farmer enrolment approval (FR 2.5, FR 2.6): a Clerk proposes, a Manager decides, a Manager can add directly."""

NID = "1199000011112222"


def propose(world, nid=NID, name="Eugene Mugabo"):
    r = world.clerk.post("/api/farmers", json={"full_name": name, "national_id": nid})
    assert r.status_code == 201, r.text
    return r.json()


def test_clerk_proposal_is_pending_and_inactive(world):
    f = propose(world)
    assert f["enrolment"] == "pending" and f["is_active"] is False and f["proposed_by"] == "Patrick Habineza"


def test_manager_registers_directly_and_is_approved(world):
    r = world.manager.post("/api/farmers", json={"full_name": "Direct Farmer", "national_id": NID})
    assert r.status_code == 201
    assert r.json()["enrolment"] == "approved" and r.json()["is_active"] is True


def test_pending_farmer_cannot_receive_deliveries_or_payments(world):
    f = propose(world)
    r = world.deliver(farmer=f["id"])
    assert r.status_code == 409 and "inactive" in str(r.json()).lower()
    assert world.pay(farmer=f["id"], amount=100).status_code == 409


def test_manager_approves_and_farmer_can_then_be_used(world):
    f = propose(world)
    r = world.manager.post(f"/api/farmers/{f['id']}/approve", json={})
    assert r.status_code == 200 and r.json()["enrolment"] == "approved" and r.json()["is_active"] is True
    assert world.deliver(farmer=f["id"]).status_code == 201


def test_reject_keeps_the_record_and_can_be_approved_later(world):
    f = propose(world)
    r = world.manager.post(f"/api/farmers/{f['id']}/reject", json={"note": "ID does not match"})
    assert r.status_code == 200 and r.json()["enrolment"] == "rejected" and r.json()["is_active"] is False
    assert r.json()["decision_note"] == "ID does not match"
    assert world.deliver(farmer=f["id"]).status_code == 409
    again = world.manager.post(f"/api/farmers/{f['id']}/approve", json={})
    assert again.status_code == 200 and again.json()["enrolment"] == "approved"


def test_cannot_decide_twice_or_reject_an_approved_farmer(world):
    f = propose(world)
    assert world.manager.post(f"/api/farmers/{f['id']}/approve", json={}).status_code == 200
    assert world.manager.post(f"/api/farmers/{f['id']}/approve", json={}).status_code == 409
    assert world.manager.post(f"/api/farmers/{f['id']}/reject", json={}).status_code == 409


def test_only_a_manager_decides(world):
    f = propose(world)
    for who in (world.clerk, world.officer):
        assert who.post(f"/api/farmers/{f['id']}/approve", json={}).status_code == 403
        assert who.post(f"/api/farmers/{f['id']}/reject", json={}).status_code == 403


def test_activate_cannot_bypass_approval(world):
    f = propose(world)
    assert world.manager.post(f"/api/farmers/{f['id']}/activate").status_code == 409
    assert world.manager.post(f"/api/farmers/{f['id']}/deactivate").status_code == 409


def test_national_id_stays_unique_while_pending(world):
    propose(world)
    again = world.clerk.post("/api/farmers", json={"full_name": "Someone Else", "national_id": NID})
    assert again.status_code == 409


def test_the_proposer_cannot_decide_their_own_proposal(world):
    f = propose(world)
    from app.models import Farmer
    me = world.manager.get("/api/auth/me").json()["id"]
    with world.make_client.session() as db:  # a Clerk who was later made a Manager would be in this position
        db.get(Farmer, f["id"]).proposed_by_id = me
        db.commit()
    r = world.manager.post(f"/api/farmers/{f['id']}/approve", json={})
    assert r.status_code == 409 and "another Manager" in str(r.json())


def test_audit_records_proposal_and_decision(world):
    f = propose(world)
    world.manager.post(f"/api/farmers/{f['id']}/approve", json={})
    actions = [e["action"] for e in world.manager.get("/api/audit").json()]
    assert "farmer.proposed" in actions and "farmer.approved" in actions
    assert world.manager.get("/api/audit/verify").json()["ok"] is True


def test_dashboard_counts_farmers_waiting_for_the_manager_only(world):
    propose(world)
    assert world.manager.get("/api/dashboard").json()["farmers_waiting"] == 1
    assert world.clerk.get("/api/dashboard").json()["farmers_waiting"] == 0


def test_public_totals_ignore_pending_farmers(world, make_client):
    propose(world)
    anon = make_client()
    before = anon.get("/api/public/stats").json()["farmers"]
    f = world.clerk.get("/api/farmers").json()
    pending = [x for x in f if x["enrolment"] == "pending"][0]
    world.manager.post(f"/api/farmers/{pending['id']}/approve", json={})
    assert anon.get("/api/public/stats").json()["farmers"] == before + 1


def test_other_cooperative_cannot_decide(world, make_client):
    f = propose(world)
    other = make_client()
    other.post("/api/auth/register", json={"full_name": "Other Boss", "phone": "0788999111",
                                            "cooperative_name": "Other Coop", "password": "harvest2026"})
    other.post("/api/auth/login", json={"username": "0788999111", "password": "harvest2026"})
    assert other.post(f"/api/farmers/{f['id']}/approve", json={}).status_code == 404
