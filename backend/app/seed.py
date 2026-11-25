"""Demo data: one synthetic cooperative with the three staff roles, farmers, prices, deliveries and payments.

    python -m app.seed            # adds the demo cooperative if it is not there yet
    python -m app.seed --reset    # removes it first, then adds it again

Every name, phone number and national ID here is made up. The demo password is printed when the script finishes.
"""

import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app import audit, models as m
from app.database import Base, SessionLocal, engine
from app.security import hash_password
from app.services import balance_of, to_grams, today, value_of

PASSWORD = "harvest2026"
COOP_NAME = "Demo Cooperative (sample data)"

STAFF = [
    ("Aline Uwase", "aline", "+250788000001", m.ROLE_MANAGER),
    ("Patrick Habineza", "patrick", "+250788000002", m.ROLE_CLERK),
    ("Claudine Uwase", "claudine", "+250788000003", m.ROLE_PAYMENT_OFFICER),
]

FARMERS = [
    ("Immaculee Uwimana", "1199080012345678", "+250788410231", "Tumba"),
    ("Jean Bosco Habimana", "1198570098765432", "+250788522190", "Mukura"),
    ("Esperance Mukamana", "1199280011223344", "+250788611002", "Tumba"),
    ("Emmanuel Nsengimana", "1198080055667788", "+250788733451", "Rwabuye"),
    ("Chantal Nyirahabimana", "1199580099887766", None, "Mukura"),
    ("Theogene Ndayisaba", "1197880044332211", "+250788904412", "Rwabuye"),
    ("Josephine Mukeshimana", "1199380066778899", "+250788155820", "Tumba"),
    ("Innocent Bizimana", "1198280022334455", None, "Gahogo"),
    ("Vestine Uwamahoro", "1199780033445566", "+250788367709", "Gahogo"),
    ("Damascene Niyonzima", "1197580077889900", "+250788480013", "Mukura"),
]

# (produce, {grade: price per kg})
SELLING = {"Maize": {"A": 380, "B": 320, "C": 260}, "Beans": {"A": 850, "B": 700, "C": 600}}
PRODUCE = [("Maize", {"A": 300, "B": 250, "C": 200}), ("Beans", {"A": 700, "B": 620, "C": 500})]

# farmer index, produce, grade, kg, days ago, paid share of total owed (0 to 1)
DELIVERIES = [
    (0, "Maize", "A", 150, 40), (0, "Beans", "A", 42.5, 12), (0, "Maize", "B", 80, 3),
    (1, "Maize", "A", 220, 35), (1, "Maize", "B", 95.5, 9),
    (2, "Beans", "B", 60, 28), (2, "Beans", "A", 35.25, 6),
    (3, "Maize", "C", 300, 30), (3, "Maize", "A", 120, 2),
    (4, "Beans", "A", 25, 21),
    (5, "Maize", "B", 180, 18), (5, "Beans", "C", 70, 5),
    (6, "Maize", "A", 90, 14),
    (7, "Beans", "B", 48.75, 10),
    (8, "Maize", "A", 260, 25), (8, "Maize", "B", 140, 4),
    (9, "Beans", "A", 55, 8),
]
# farmer index: share of what is owed to pay, and how many days ago
PAYMENTS = {0: (0.6, 20), 1: (1.0, 7), 2: (0.5, 15), 3: (0.8, 10), 5: (0.4, 9), 8: (0.7, 12)}


def seed(reset: bool = False, session_factory=None) -> None:
    if session_factory is None:
        Base.metadata.create_all(engine)
    with (session_factory or SessionLocal)() as db:
        existing = db.scalar(select(m.Cooperative).where(m.Cooperative.name == COOP_NAME))
        if existing and not reset:
            print("Demo cooperative already exists. Use --reset to rebuild it.")
            return
        if existing:
            _wipe(db, existing.id)

        coop = m.Cooperative(name=COOP_NAME, district="Huye", phone="+250788000000")
        db.add(coop)
        db.flush()
        users = {}
        for name, username, phone, role in STAFF:
            u = m.User(cooperative_id=coop.id, full_name=name, username=username, phone=phone, role=role,
                       password_hash=hash_password(PASSWORD))
            db.add(u)
            users[role] = u
        db.flush()
        manager, clerk, officer = users[m.ROLE_MANAGER], users[m.ROLE_CLERK], users[m.ROLE_PAYMENT_OFFICER]
        start = today() - timedelta(days=90)

        produce = {}
        for name, grades in PRODUCE:
            p = m.ProduceType(cooperative_id=coop.id, name=name)
            db.add(p)
            db.flush()
            produce[name] = p
            for grade, price in grades.items():
                db.add(m.Price(produce_id=p.id, grade=grade, price_per_kg=price, effective_from=start,
                               created_by_id=manager.id))
            audit.record(db, manager, "produce.created", "produce", p.id, f"Added {name} with grades A, B and C.")
            for grade, price in SELLING[name].items():
                db.add(m.SellingPrice(produce_id=p.id, grade=grade, price_per_kg=price, effective_from=start,
                                      created_by_id=manager.id))

        farmers = []
        for name, nid, phone, village in FARMERS:
            f = m.Farmer(cooperative_id=coop.id, full_name=name, national_id=nid, phone=phone, village=village,
                         member_since=start)
            db.add(f)
            db.flush()
            farmers.append(f)
            audit.record(db, clerk, "farmer.created", "farmer", f.id, f"Registered farmer {name}.")

        for idx, pname, grade, kg, ago in DELIVERIES:
            when = today() - timedelta(days=ago)
            price = next(x for x in produce[pname].prices if x.grade == grade).price_per_kg
            grams = to_grams(kg)
            d = m.Delivery(cooperative_id=coop.id, farmer_id=farmers[idx].id, produce_id=produce[pname].id,
                           grade=grade, weight_grams=grams, price_per_kg=price, value=value_of(grams, price),
                           delivery_date=when, recorded_by_id=clerk.id)
            db.add(d)
            db.flush()
            audit.record(db, clerk, "delivery.recorded", "delivery", d.id,
                         f"Recorded D-{d.id:06d}: {kg} kg {pname} grade {grade} from {farmers[idx].full_name}.")

        for idx, (share, ago) in PAYMENTS.items():
            owed = balance_of(db, farmers[idx].id)
            amount = int(owed * share)
            if amount <= 0:
                continue
            p = m.Payment(cooperative_id=coop.id, farmer_id=farmers[idx].id, amount=amount, method="momo" if idx % 2 else "cash",
                          reference=f"DEMO-{idx:03d}" if idx % 2 else None, payment_date=today() - timedelta(days=ago),
                          recorded_by_id=officer.id)
            db.add(p)
            db.flush()
            audit.record(db, officer, "payment.recorded", "payment", p.id,
                         f"Recorded P-{p.id:06d}: paid {amount:,} RWF to {farmers[idx].full_name}.")

        # Buyer side: one paid sale, one part paid with a payment waiting for confirmation, one new request.
        buyers = [("Kigali Fresh Market", "+250788610001", "Maize", "A", 120, 380, 3),
                  ("Huye Schools Kitchen", "+250788610002", "Beans", "B", 40, 700, 1)]
        for n, (buyer, bphone, pname, grade, kg, price, ago) in enumerate(buyers):
            grams = to_grams(kg)
            sale = m.Sale(cooperative_id=coop.id, buyer_name=buyer, buyer_phone=bphone, produce_id=produce[pname].id,
                          grade=grade, weight_grams=grams, price_per_kg=price, value=value_of(grams, price),
                          sale_date=today() - timedelta(days=ago), recorded_by_id=clerk.id)
            db.add(sale)
            db.flush()
            audit.record(db, clerk, "sale.recorded", "sale", sale.id,
                         f"Sold {kg} kg {pname} grade {grade} to {buyer} at {price:,} RWF per kg, {sale.value:,} RWF (S-{sale.id:06d})")
            amount = sale.value if n == 0 else sale.value // 2
            status = m.BUYER_PAY_CONFIRMED if n == 0 else m.BUYER_PAY_PENDING
            bp = m.BuyerPayment(cooperative_id=coop.id, sale_id=sale.id, amount=amount, method="momo", status=status,
                                reference=f"BUYER-{n + 1:03d}", payment_date=today() - timedelta(days=max(ago - 1, 0)),
                                recorded_by_id=clerk.id,
                                decided_by_id=officer.id if status == m.BUYER_PAY_CONFIRMED else None,
                                decided_at=datetime.now(timezone.utc) if status == m.BUYER_PAY_CONFIRMED else None)
            db.add(bp)
            db.flush()
            audit.record(db, clerk, "buyer_payment.recorded", "buyer_payment", bp.id,
                         f"Recorded {amount:,} RWF from {buyer} for S-{sale.id:06d}, waiting for confirmation (R-{bp.id:06d})")
            if status == m.BUYER_PAY_CONFIRMED:
                audit.record(db, officer, "buyer_payment.confirmed", "buyer_payment", bp.id,
                             f"Confirmed R-{bp.id:06d}, {amount:,} RWF for S-{sale.id:06d}.")
        order = m.BuyerOrder(cooperative_id=coop.id, buyer_name="Aimable Nkurunziza", buyer_phone="+250788610003",
                             produce_id=produce["Maize"].id, grade="B", weight_grams=to_grams(60),
                             note="Pickup on Friday if possible")
        db.add(order)
        db.flush()
        audit.record_for(db, coop.id, None, "Aimable Nkurunziza (buyer, not signed in)", "order.requested", "order", order.id,
                         f"Request O-{order.id:06d}: 60 kg Maize grade B")
        db.commit()
    print(f"Demo cooperative ready. Sign in as aline (Manager), patrick (Collection Clerk) "
          f"or claudine (Payment Officer). Password: {PASSWORD}")


def _wipe(db, coop_id: int) -> None:
    """Remove the cooperative and everything under it, children first so PostgreSQL's foreign keys are satisfied."""
    batch_ids = list(db.scalars(select(m.PaymentBatch.id).where(m.PaymentBatch.cooperative_id == coop_id)))
    steps = [
        (m.BuyerPayment, m.BuyerPayment.cooperative_id == coop_id),
        (m.Sale, m.Sale.cooperative_id == coop_id),
        (m.BuyerOrder, m.BuyerOrder.cooperative_id == coop_id),
        (m.Dispute, m.Dispute.cooperative_id == coop_id),
        (m.AuditEntry, m.AuditEntry.cooperative_id == coop_id),
        (m.Correction, m.Correction.cooperative_id == coop_id),
        (m.Payment, m.Payment.cooperative_id == coop_id),
    ]
    if batch_ids:
        steps.append((m.BatchLine, m.BatchLine.batch_id.in_(batch_ids)))
    steps += [
        (m.PaymentBatch, m.PaymentBatch.cooperative_id == coop_id),
        (m.Delivery, m.Delivery.cooperative_id == coop_id),
        (m.Farmer, m.Farmer.cooperative_id == coop_id),
    ]
    for model, condition in steps:
        for row in db.scalars(select(model).where(condition)).all():
            db.delete(row)
        db.flush()
    for p in db.scalars(select(m.ProduceType).where(m.ProduceType.cooperative_id == coop_id)).all():
        for price in list(p.prices) + list(p.selling_prices):
            db.delete(price)
        db.delete(p)
    for u in db.scalars(select(m.User).where(m.User.cooperative_id == coop_id)).all():
        db.delete(u)
    db.flush()
    db.delete(db.get(m.Cooperative, coop_id))
    db.commit()


if __name__ == "__main__":
    seed(reset="--reset" in sys.argv)
