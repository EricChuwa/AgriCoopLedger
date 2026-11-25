import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import DecisionButtons from "../components/DecisionButtons.jsx";
import Dialog from "../components/Dialog.jsx";
import Field from "../components/Field.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { BATCH_LABEL, LINE_LABEL } from "../lib/batch.js";
import { newClientId } from "../lib/clientId.js";
import { METHOD_LABEL, dateTime, fmt, parseNumber, todayIso } from "../lib/format.js";
import useApiData from "../lib/useApiData.js";

function PayDialog({ batch, line, onClose }) {
  const { payInBatch } = useLedger();
  const [amount, setAmount] = useState(String(line.remaining));
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const clientId = useRef(newClientId());
  const n = parseNumber(amount);
  const ok = Number.isInteger(n) && n > 0 && n <= line.remaining;

  const save = async () => {
    setBusy(true);
    const result = await payInBatch(batch.id, {
      farmer_id: line.farmer_id, amount: n, method, reference: method === "momo" ? reference.trim() : "",
      payment_date: todayIso(), client_id: clientId.current,
    });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    onClose();
  };

  return (
    <Dialog title={`Pay ${line.farmer_name}`} onClose={onClose}>
      <p className="dialog-lead">Planned in {batch.number}: {fmt(line.planned)} RWF. Still to pay: <strong>{fmt(line.remaining)} RWF</strong>.</p>
      <Alert>{error}</Alert>
      <Field id="pay-amount" label="Amount paid (RWF)" error={amount !== "" && !ok ? `Enter a whole number up to ${fmt(line.remaining)}.` : ""}>
        {(p) => <input {...p} type="text" inputMode="numeric" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </Field>
      <fieldset className="choices">
        <legend>Paid by</legend>
        <div className="choice-row">
          {Object.entries(METHOD_LABEL).map(([id, label]) => (
            <label className="choice" key={id}>
              <input type="radio" name="pay-method" value={id} checked={method === id} onChange={() => setMethod(id)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {method === "momo" && (
        <Field id="pay-ref" label="Mobile money reference (optional)">
          {(p) => <input {...p} type="text" autoComplete="off" value={reference} onChange={(e) => setReference(e.target.value)} />}
        </Field>
      )}
      <p className="dialog-note">Record this only when the money has been handed over. Only a Manager can void it later.</p>
      <div className="dialog-actions">
        <button className="btn btn-primary" type="button" disabled={!ok || busy} onClick={save}>{busy ? "Saving" : "Confirm and record"}</button>
        <button className="btn btn-outline" type="button" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}

export default function BatchDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { version, decideBatch } = useLedger();
  const { data: batch, error } = useApiData(`/batches/${id}`, null, version);
  const [paying, setPaying] = useState(null);
  useEffect(() => { document.title = `${batch?.note || batch?.number || "Batch"} | AgriCoopLedger`; }, [batch]);

  if (!batch) {
    return (
      <div>
        <p className="crumb"><Link to="/batches">Payment batches</Link></p>
        {error ? <Alert>{error}</Alert> : <p className="muted">Loading</p>}
      </div>
    );
  }

  const canDecide = user.role === "manager" && batch.status === "submitted";
  const canPay = user.role === "payment_officer" && ["approved", "part_paid"].includes(batch.status);

  return (
    <div>
      <p className="crumb"><Link to="/batches">Payment batches</Link></p>
      <header className="page-head">
        <div>
          <h1>{batch.note || batch.number}<span className="pill pill-muted title-pill">{BATCH_LABEL[batch.status]}</span></h1>
          <p>{batch.note ? `${batch.number}. ` : ""}Made by {batch.created_by}, {dateTime(batch.created_at)}.</p>
          {batch.decided_by && (
            <p className="muted">
              {batch.status === "rejected" ? "Declined" : "Approved"} by {batch.decided_by}, {dateTime(batch.decided_at)}
              {batch.decision_note ? `. Reason: ${batch.decision_note}` : "."}
            </p>
          )}
        </div>
        {canDecide && (
          <div className="quick-actions">
            <DecisionButtons small={false} subject={batch.number} declineNeedsReason
              approveText={`Approving lets the Payment Officer pay ${fmt(batch.planned)} RWF to ${batch.farmers} farmers.`}
              declineText="Nothing can be paid from a declined batch. The farmers stay owed."
              onDecide={(d, note) => decideBatch(batch.id, d, note)} />
          </div>
        )}
      </header>

      <div className="stats stats-three">
        <div className="stat"><p className="stat-label">Planned</p><p className="stat-value">{fmt(batch.planned)}<span className="stat-unit"> RWF</span></p></div>
        <div className="stat"><p className="stat-label">Paid so far</p><p className="stat-value">{fmt(batch.paid)}<span className="stat-unit"> RWF</span></p></div>
        <div className="stat"><p className="stat-label">Still to pay</p><p className="stat-value">{fmt(batch.planned - batch.paid)}<span className="stat-unit"> RWF</span></p></div>
      </div>

      <div className="table-scroll"><table className="table">
        <thead>
          <tr>
            <th scope="col">Farmer</th>
            <th scope="col">Planned</th>
            <th scope="col">Paid</th>
            <th scope="col">Remaining</th>
            <th scope="col">Status</th>
            <th scope="col"><span className="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {batch.lines.map((l) => (
            <tr key={l.farmer_id}>
              <th scope="row" className="cell-main">{l.farmer_name}</th>
              <td data-label="Planned">{fmt(l.planned)} RWF</td>
              <td data-label="Paid">{fmt(l.paid)} RWF</td>
              <td data-label="Remaining">{fmt(l.remaining)} RWF</td>
              <td data-label="Status"><span className={`pill ${l.status === "paid" ? "pill-paid" : "pill-muted"}`}>{LINE_LABEL[l.status]}</span></td>
              <td className="cell-actions">
                {canPay && l.remaining > 0 && (
                  <button className="row-action" type="button" onClick={() => setPaying(l)}>
                    Pay<span className="visually-hidden"> {l.farmer_name}</span>
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>

      {paying && <PayDialog batch={batch} line={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}
