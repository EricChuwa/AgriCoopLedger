import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import Dialog from "../components/Dialog.jsx";
import Field from "../components/Field.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { dateTime, fmt, kgText } from "../lib/format.js";

const STATUS_LABEL = { pending: "Waiting for a Manager", approved: "Approved", rejected: "Rejected", direct: "Corrected by a Manager" };
const FILTERS = [
  { id: "pending", label: "Waiting" },
  { id: "all", label: "All" },
];

function Change({ c }) {
  const parts = [];
  if (c.old_weight_kg !== c.new_weight_kg) parts.push(`${kgText(c.old_weight_kg)} to ${kgText(c.new_weight_kg)}`);
  if (c.old_grade !== c.new_grade) parts.push(`grade ${c.old_grade} to ${c.new_grade}`);
  return (
    <>
      {parts.join(", ")}
      {c.new_value != null && <span className="cell-sub">Value {fmt(c.old_value)} to {fmt(c.new_value)} RWF</span>}
    </>
  );
}

// Corrections to deliveries. A Manager sees every one and decides the waiting requests;
// a Collection Clerk sees the requests they sent.
export default function Corrections() {
  const { user } = useAuth();
  const isManager = user.role === "manager";
  const { corrections, decideCorrection } = useLedger();
  const [filter, setFilter] = useState(isManager ? "pending" : "all");
  const [deciding, setDeciding] = useState(null); // { c, decision }
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = "Corrections | AgriCoopLedger"; }, []);

  const shown = corrections.filter((c) => filter === "all" || c.status === "pending");
  const waiting = corrections.filter((c) => c.status === "pending").length;

  const decide = async () => {
    setBusy(true);
    const result = await decideCorrection(deciding.c.id, deciding.decision, note.trim());
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setDeciding(null);
  };

  const open = (c, decision) => { setDeciding({ c, decision }); setNote(""); setError(""); };

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Corrections</h1>
          <p>
            {isManager
              ? "Fixes to delivery weights and grades. Approve or reject what clerks ask for. The old values are always kept."
              : "Requests you sent to a Manager to fix a delivery. To send one, open Deliveries and choose Request correction."}
          </p>
        </div>
        {!isManager && <div className="quick-actions"><Link className="btn btn-primary" to="/deliveries">Go to deliveries</Link></div>}
      </header>

      <div className="filters">
        <div className="filter">
          <span className="filter-label" id="cf-label">Show</span>
          <div className="seg" role="group" aria-labelledby="cf-label">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}{f.id === "pending" && waiting > 0 ? ` (${waiting})` : ""}
              </button>
            ))}
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="empty-block"><p>{filter === "pending" ? "No corrections are waiting." : "No corrections yet."}</p></div>
      ) : (
        <div className="table-scroll"><table className="table table-numbers">
          <thead>
            <tr>
              <th scope="col">Delivery</th>
              <th scope="col">Change</th>
              <th scope="col">Reason</th>
              <th scope="col">Status</th>
              {isManager && <th scope="col"><span className="visually-hidden">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id}>
                <th scope="row" className="cell-main">
                  <span className="cell-name">{c.receipt_no}</span>
                  <span className="cell-sub">{c.farmer_name}, {c.produce_name}</span>
                </th>
                <td data-label="Change"><Change c={c} /></td>
                <td data-label="Reason">
                  {c.reason}
                  <span className="cell-sub">{c.status === "direct" ? "Corrected" : "Asked"} by {c.requested_by}, {dateTime(c.created_at)}</span>
                </td>
                <td data-label="Status">
                  <span className={c.status === "pending" ? "pill pill-owed" : "pill pill-muted"}>{STATUS_LABEL[c.status]}</span>
                  {c.decided_by && <span className="cell-sub">{c.decided_by}, {dateTime(c.decided_at)}{c.decision_note ? `: ${c.decision_note}` : ""}</span>}
                </td>
                {isManager && (
                  <td className="cell-actions">
                    {c.status === "pending" && (
                      <>
                        <button type="button" className="row-action row-button" onClick={() => open(c, "approve")}>
                          Approve<span className="visually-hidden"> {c.receipt_no}</span>
                        </button>
                        <button type="button" className="row-action row-button" onClick={() => open(c, "reject")}>
                          Reject<span className="visually-hidden"> {c.receipt_no}</span>
                        </button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      {deciding && (
        <Dialog title={deciding.decision === "approve" ? "Approve this correction?" : "Reject this correction?"} onClose={() => setDeciding(null)}>
          <p className="dialog-lead">{deciding.c.receipt_no}, {deciding.c.farmer_name}: <Change c={deciding.c} /></p>
          <p className="dialog-note">
            {deciding.decision === "approve"
              ? "The delivery is changed now and its value is recalculated. The old values stay on record."
              : "The delivery stays as it is."}
          </p>
          <Alert>{error}</Alert>
          <Field id="note" label="Note (optional)">
            {(p) => <textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <div className="dialog-actions">
            <button className={`btn ${deciding.decision === "approve" ? "btn-primary" : "btn-danger"}`} type="button" disabled={busy} onClick={decide}>
              {busy ? "Saving" : deciding.decision === "approve" ? "Approve" : "Reject"}
            </button>
            <button className="btn btn-outline" type="button" onClick={() => setDeciding(null)}>Cancel</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
