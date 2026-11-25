import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


@pytest.fixture()
def make_client():
    """Returns a function that makes a new browser-like client. Every client has its own cookies but all of
    them share one fresh in-memory SQLite database, so a test can act as several people."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    def factory():
        c = TestClient(app)
        c.test_session = TestSession
        return c

    factory.session = TestSession
    yield factory
    app.dependency_overrides.clear()


@pytest.fixture()
def client(make_client):
    """One client, for tests that only need a single person."""
    return make_client()


PASSWORD = "harvest2026"
FAR_PAST = "2020-01-01"


class World:
    """One cooperative with a Manager, a Collection Clerk and a Payment Officer already signed in,
    one produce type (Maize, bought at 300 and 250 RWF per kg, sold at 400 and 350) and two farmers."""

    def __init__(self, make_client):
        self.make_client = make_client
        self.manager = make_client()
        r = self.manager.post("/api/auth/register", json={
            "full_name": "Aline Uwase", "phone": "0788000001", "cooperative_name": "Test Coop", "password": PASSWORD})
        assert r.status_code == 201, r.text
        assert self.login(self.manager, "0788000001").status_code == 200

        self.clerk = self.add_staff("Patrick Habineza", "0788000002", "clerk")
        self.officer = self.add_staff("Claudine Uwase", "0788000003", "payment_officer")

        r = self.manager.post("/api/produce", json={"name": "Maize", "prices": [
            {"grade": "A", "price_per_kg": 300, "effective_from": FAR_PAST},
            {"grade": "B", "price_per_kg": 250, "effective_from": FAR_PAST}]})
        assert r.status_code == 201, r.text
        self.maize = r.json()["id"]
        for grade, price in (("A", 400), ("B", 350)):  # the Manager's selling prices
            r = self.manager.post(f"/api/produce/{self.maize}/selling-prices",
                                  json={"grade": grade, "price_per_kg": price, "effective_from": FAR_PAST})
            assert r.status_code == 201, r.text

        self.farmer = self.add_farmer("Immaculee Uwimana", "1199080012345678", "0788410231")["id"]
        self.farmer2 = self.add_farmer("Jean Bosco Habimana", "1198570098765432", "0788522190")["id"]

    def login(self, client, phone, password=PASSWORD):
        return client.post("/api/auth/login", json={"username": phone, "password": password})

    def add_staff(self, name, phone, role):
        r = self.manager.post("/api/users", json={"full_name": name, "phone": phone, "role": role, "password": PASSWORD})
        assert r.status_code == 201, r.text
        client = self.make_client()
        assert self.login(client, phone).status_code == 200
        return client

    def add_farmer(self, name, national_id, phone=""):
        """A Clerk proposes the farmer and the Manager approves, so the farmer can be used straight away."""
        r = self.clerk.post("/api/farmers", json={"full_name": name, "national_id": national_id, "phone": phone})
        assert r.status_code == 201, r.text
        approved = self.manager.post(f"/api/farmers/{r.json()['id']}/approve", json={})
        assert approved.status_code == 200, approved.text
        return approved.json()

    def deliver(self, farmer=None, kg=100, grade="A", date=None):
        body = {"farmer_id": farmer or self.farmer, "produce_id": self.maize, "grade": grade, "weight_kg": kg}
        if date:
            body["delivery_date"] = date
        return self.clerk.post("/api/deliveries", json=body)

    def pay(self, farmer=None, amount=1000, method="cash", reference=""):
        return self.officer.post("/api/payments", json={
            "farmer_id": farmer or self.farmer, "amount": amount, "method": method, "reference": reference})

    def balance(self, farmer=None):
        return self.manager.get(f"/api/farmers/{farmer or self.farmer}").json()["balance"]


@pytest.fixture()
def world(make_client):
    return World(make_client)
