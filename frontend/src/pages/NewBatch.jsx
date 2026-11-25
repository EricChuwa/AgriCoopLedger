import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import Field from "../components/Field.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { fmt, parseNumber } from "../lib/format.js";

// The Payment Officer picks farmers who are owed money and sets how much to pay each.
export default function NewBatch() {
  const { activeFarmers, createBatch } = useLedger();
  const navigate = useNavigate();
  const owed = useMemo(() => activeFarmers.filter((f) => f.balance > 0), [activeFarmers]);
  const [picked, setPicked] = useState({});   // farmer id -> amount text
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = "New payment batch | AgriCoopLedger"; }, []);

  const toggle = (f) => setPicked((p) => {
    const next = { ...p };
    if (f.id in next) delete next[f.id]; else next[f.id] = String(f.balance);
    return next;
  });
  const lines = owed.filter((f) => f.id in picked).map((f) => ({ farmer: f, amount: parseNumber(picked[f.id]) }));
  const bad = (l) => !Number.isInteger(l.amount) || l.amount <= 0 || l.amount > l.farmer.balance;
  const total = lines.reduce((s, l) => s + (bad(l) ? 0 : l.amount), 0);
  const ready = lines.length > 0 && lines.every((l) => !bad(l));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const result = await createBatch({ note: note.trim(), lines: lines.map((l) => ({ farmer_id: l.farmer.id, amount: l.amount })) });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    navigate(`/batches/${result.data.id}`);
  };

  return (
    <div>
      <p className="crumb"><Link to="/batches">Payment batches</Link></p>
      <header className="page-head">
        <div>
          <h1>New payment batch</h1>
          <p>Choose the farmers to pay and the amount for each. A Manager must approve the batch before you pay.</p>
        </div>
      </header>
      <form className="record-form" onSubmit={submit} noValidate>
        <Alert>{error}</Alert>
        <Field id="batch-name" label="Batch name" hint="So it is easy to find later, for example Maize, week 47. Leave empty to use the batch number.">
          {(p) => <input {...p} type="text" maxLength={200} placeholder="Maize, week 47" value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {owed.length === 0 ? (
          <div className="empty-block"><p>No farmer is owed anything right now.</p></div>
        ) : (
          <div className="table-scroll"><table className="table">
            <thead>
              <tr>
                <th scope="col">Include</th>
                <th scope="col">Farmer</th>
                <th scope="col">Owed</th>
                <th scope="col">Pay (RWF)</th>
              </tr>
            </thead>
            <tbody>
              {owed.map((f) => {
                const on = f.id in picked;
                const l = on ? { farmer: f, amount: parseNumber(picked[f.id]) } : null;
                return (
                  <tr key={f.id}>
                    <td data-label="Include">
                      <input type="checkbox" checked={on} onChange={() => toggle(f)} aria-label={`Include ${f.full_name}`} />
                    </td>
                    <th scope="row" className="cell-main">{f.full_name}</th>
                    <td data-label="Owed">{fmt(f.balance)} RWF</td>
                    <td data-label="Pay (RWF)">
                      {on && (
                        <>
                          <input type="text" inputMode="numeric" autoComplete="off" value={picked[f.id]}
                            aria-label={`Amount for ${f.full_name}`} aria-invalid={bad(l)}
                            onChange={(e) => setPicked((p) => ({ ...p, [f.id]: e.target.value }))} />
                          {bad(l) && <span className="cell-sub">Whole RWF, up to {fmt(f.balance)}.</span>}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
        <p className="results">{lines.length} selected &middot; {fmt(total)} RWF planned</p>
        <button className="btn btn-primary record-submit" type="submit" disabled={!ready || busy}>
          {busy ? "Saving" : "Send to Manager for approval"}
        </button>
      </form>
    </div>
  );
}
