import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import Alert from "../components/Alert.jsx";
import { dateTime, plural } from "../lib/format.js";

const AREAS = [
  { id: "", label: "Everything" },
  { id: "delivery", label: "Deliveries" },
  { id: "payment", label: "Payments" },
  { id: "correction", label: "Corrections" },
  { id: "farmer", label: "Farmers" },
  { id: "price", label: "Prices" },
  { id: "produce", label: "Produce" },
  { id: "user", label: "Staff" },
  { id: "cooperative", label: "Cooperative" },
];

// Who did what and when (FR 7.2). Read only: nothing here can be edited or deleted.
export default function AuditLog() {
  const [rows, setRows] = useState([]);
  const [staff, setStaff] = useState([]);
  const [area, setArea] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [check, setCheck] = useState(null); // result of the integrity check
  const [checking, setChecking] = useState(false);

  useEffect(() => { document.title = "Audit log | AgriCoopLedger"; api("/users").then(setStaff).catch(() => {}); }, []);

  const load = useCallback(() => {
    setLoading(true);
    api("/audit", { params: { action: area, user_id: userId, date_from: from, date_to: to, limit: 500 } })
      .then((data) => { setRows(data); setError(""); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [area, userId, from, to]);

  useEffect(() => { load(); }, [load]);

  const verify = () => {
    setChecking(true);
    api("/audit/verify")
      .then(setCheck)
      .catch((err) => setCheck({ failed: err.message }))
      .finally(() => setChecking(false));
  };

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>Every change to the ledger, with who made it and when. Entries cannot be edited or deleted.</p>
        </div>
        <div className="quick-actions">
          <button className="btn btn-outline" type="button" onClick={verify} disabled={checking}>{checking ? "Checking" : "Check integrity"}</button>
          <button className="btn btn-outline" type="button" onClick={load}>Refresh</button>
        </div>
      </header>

      <div className="filters">
        <div className="filter">
          <label htmlFor="area">Show</label>
          <select id="area" value={area} onChange={(e) => setArea(e.target.value)}>
            {AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
        <div className="filter">
          <label htmlFor="who">Person</label>
          <select id="who" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Everyone</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
        <div className="filter"><label htmlFor="from">From</label><input id="from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="filter"><label htmlFor="to">To</label><input id="to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></div>
      </div>

      {check && (
        <div className={check.ok ? "notice" : "alert"} role="status">
          {check.failed
            ? `The check could not run: ${check.failed}`
            : check.ok
              ? `Integrity check passed. All ${check.checked} ${plural(check.checked, "entry", "entries")} are linked and unchanged.`
              : `Integrity check failed at entry #${check.first_bad_id}. That entry, or one before it, was changed or removed outside the app.`}
        </div>
      )}
      <Alert>{error}</Alert>
      <p className="results" aria-live="polite">
        {loading ? "Loading" : `${rows.length} ${plural(rows.length, "entry", "entries")}${rows.length === 500 ? " (the newest 500)" : ""}`}
      </p>

      {!loading && rows.length === 0 ? (
        <div className="empty-block"><p>No entries match.</p></div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Who</th>
              <th scope="col">What happened</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row" className="cell-main"><span className="cell-name">{dateTime(r.created_at)}</span></th>
                <td data-label="Who">{r.user_name}</td>
                <td data-label="What happened">{r.summary}<span className="cell-sub">{r.action}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
