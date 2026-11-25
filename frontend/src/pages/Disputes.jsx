import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import Dialog from "../components/Dialog.jsx";
import Field from "../components/Field.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { dateTime } from "../lib/format.js";

const STATUS = {
  open: { cls: "pill pill-owed", label: "Open" },
  upheld: { cls: "pill pill-paid", label: "Upheld" },
  dismissed: { cls: "pill pill-muted", label: "Dismissed" },
};
const FILTERS = [
  { id: "open", label: "Open" },
  { id: "all", label: "All" },
];

// A dispute is a challenge to one delivery or one payment. A Manager sees all of them and decides the open
// ones. A Collection Clerk or Payment Officer sees the ones they raised.
export default function Disputes() {
  const { user } = useAuth();
  const isManager = user.role === "manager";
  const { disputes, decideDispute } = useLedger();
  const [filter, setFilter] = useState(isManager ? "open" : "all");
  const [deciding, setDeciding] = useState(null); // { d, decision: "uphold" | "dismiss" }
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = "Disputes | AgriCoopLedger"; }, []);

  const shown = disputes.filter((d) => filter === "all" || d.status === "open");
  const open = disputes.filter((d) => d.status === "open").length;

  const begin = (d, decision) => { setDeciding({ d, decision }); setNote(""); setError(""); };
  const decide = async () => {
    if (note.trim().length < 5) { setError("Write a note of at least 5 characters."); return; }
    setBusy(true);
    const result = await decideDispute(deciding.d.id, deciding.decision, note.trim());
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setDeciding(null);
  };

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Disputes</h1>
          <p>
            {isManager
              ? "Challenges to a delivery or a payment. Uphold one if it is right, then correct or void the record. Dismiss it if the record stands."
              : "Challenges you raised on a delivery or a payment. To raise one, open the record's list and choose Dispute."}
          </p>
        </div>
        {!isManager && (
          <div className="quick-actions">
            <Link className="btn btn-primary" to={user.role === "clerk" ? "/deliveries" : "/payments"}>
              {user.role === "clerk" ? "Go to deliveries" : "Go to payments"}
            </Link>
          </div>
        )}
      </header>

      <div className="filters">
        <div className="filter">
          <span className="filter-label" id="df-label">Show</span>
          <div className="seg" role="group" aria-labelledby="df-label">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}{f.id === "open" && open > 0 ? ` (${open})` : ""}
              </button>
            ))}
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="empty-block"><p>{filter === "open" ? "No disputes are open." : "No disputes yet."}</p></div>
      ) : (
        <div className="table-scroll"><table className="table table-numbers">
          <thead>
            <tr>
              <th scope="col">Record</th>
              <th scope="col">Challenge</th>
              <th scope="col">Status</th>
              {isManager && <th scope="col"><span className="visually-hidden">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.id}>
                <th scope="row" className="cell-main">
                  <span className="cell-name">{d.record_no}</span>
                  <span className="cell-sub">{d.farmer_name}, {d.summary}</span>
                </th>
                <td data-label="Challenge">
                  {d.reason}
                  <span className="cell-sub">{d.number}, raised by {d.raised_by}, {dateTime(d.created_at)}</span>
                </td>
                <td data-label="Status">
                  <span className={STATUS[d.status].cls}>{STATUS[d.status].label}</span>
                  {d.decided_by && <span className="cell-sub">{d.decided_by}, {dateTime(d.decided_at)}: {d.decision_note}</span>}
                </td>
                {isManager && (
                  <td className="cell-actions">
                    {d.status === "open" && (
                      <>
                        <button type="button" className="row-action row-button" onClick={() => begin(d, "uphold")}>
                          Uphold<span className="visually-hidden"> {d.number}</span>
                        </button>
                        <button type="button" className="row-action row-button" onClick={() => begin(d, "dismiss")}>
                          Dismiss<span className="visually-hidden"> {d.number}</span>
                        </button>
                        <Link className="row-action" to={d.kind === "delivery" ? "/deliveries" : "/payments"}>
                          Open {d.kind}s<span className="visually-hidden"> to fix {d.record_no}</span>
                        </Link>
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
        <Dialog title={deciding.decision === "uphold" ? "Uphold this dispute?" : "Dismiss this dispute?"} onClose={() => setDeciding(null)}>
          <p className="dialog-lead">{deciding.d.record_no}, {deciding.d.farmer_name}: {deciding.d.reason}</p>
          <p className="dialog-note">
            {deciding.decision === "uphold"
              ? "The challenge is right. No amount changes yet. Next, correct or void the record, which keeps its own reason."
              : "The record stands as it is."}
          </p>
          <Alert>{error}</Alert>
          <Field id="note" label="Note (required)">
            {(p) => <textarea {...p} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <div className="dialog-actions">
            <button className="btn btn-primary" type="button" disabled={busy} onClick={decide}>
              {busy ? "Saving" : deciding.decision === "uphold" ? "Uphold" : "Dismiss"}
            </button>
            <button className="btn btn-outline" type="button" onClick={() => setDeciding(null)}>Cancel</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
