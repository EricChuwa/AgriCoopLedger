import { useState } from "react";

// Sample data only. Nothing here is saved or sent anywhere.
const INITIAL_ROWS = [
  { id: 1, name: "J. Mukamana", kg: 42, paid: true },
  { id: 2, name: "E. Habimana", kg: 65, paid: false },
  { id: 3, name: "C. Uwimana", kg: 38, paid: true },
  { id: 4, name: "P. Niyonsenga", kg: 80, paid: false },
];

const fmt = (n) => n.toLocaleString("en-US");

// Keeps only digits and caps the value, so the demo can never show nonsense.
const toNumber = (text, max) => Math.min(max, parseInt(text.replace(/\D/g, ""), 10) || 0);

export default function LedgerDemo() {
  const [price, setPrice] = useState(300);
  const [rows, setRows] = useState(INITIAL_ROWS);

  const update = (id, patch) =>
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const delivered = rows.reduce((sum, r) => sum + r.kg * price, 0);
  const paid = rows.filter((r) => r.paid).reduce((sum, r) => sum + r.kg * price, 0);
  const owed = delivered - paid;

  return (
    <section className="lp-sheet" aria-labelledby="demo-title">
      <div className="lp-sheet-head">
        <div>
          <h2 id="demo-title">Collection day</h2>
          <p>Tuesday, maize</p>
        </div>
        <label className="lp-price">
          <span>Price per kg</span>
          <span className="lp-price-box">
            <input inputMode="numeric" value={price || ""} placeholder="0"
              onChange={(e) => setPrice(toNumber(e.target.value, 9999))} />
            RWF
          </span>
        </label>
      </div>

      <ul className="lp-rows">
        {rows.map((r) => (
          <li className="lp-row" key={r.id}>
            <span className="lp-name">{r.name}</span>

            <label className="lp-kg">
              <span className="visually-hidden">Kilograms delivered by {r.name}</span>
              <input inputMode="numeric" value={r.kg || ""} placeholder="0"
                onChange={(e) => update(r.id, { kg: toNumber(e.target.value, 9999) })} />
              kg
            </label>

            <span className="lp-amt">{fmt(r.kg * price)}</span>

            <button type="button" className={`lp-pill ${r.paid ? "paid" : "owed"}`}
              aria-label={`${r.name}: ${r.paid ? "paid" : "owed"}. Press to mark as ${r.paid ? "owed" : "paid"}.`}
              onClick={() => update(r.id, { paid: !r.paid })}>
              {r.paid ? "Paid" : "Owed"}
            </button>
          </li>
        ))}
      </ul>

      <dl className="lp-sum">
        <div><dt>Delivered</dt><dd>{fmt(delivered)}</dd></div>
        <div><dt>Paid</dt><dd>{fmt(paid)}</dd></div>
        <div className="lp-owed"><dt>Still owed</dt><dd>{fmt(owed)}</dd></div>
      </dl>

      <p className="lp-demo-note">
        Sample data in RWF. Change any number, or press Owed to mark it paid.
      </p>
    </section>
  );
}
