import { useState } from "react";
import Alert from "./Alert.jsx";
import Dialog from "./Dialog.jsx";
import Field from "./Field.jsx";

// Approve and Decline buttons that ask for an optional note first. Used for farmers
// waiting for a Manager and for payment batches. `onDecide(decision, note)` returns {error} or {data}.
export default function DecisionButtons({ subject, approveText, declineText, onDecide, small = true, declineNeedsReason = false }) {
  const [deciding, setDeciding] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => { setDeciding(null); setNote(""); setError(""); };
  const decide = async () => {
    setBusy(true);
    const result = await onDecide(deciding, note.trim());
    setBusy(false);
    if (result?.error) { setError(result.error.message); return; }
    close();
  };
  const size = small ? " btn-small" : "";
  const approving = deciding === "approve";

  return (
    <>
      <button className={`btn btn-primary${size}`} type="button" onClick={() => setDeciding("approve")}>
        Approve<span className="visually-hidden"> {subject}</span>
      </button>
      <button className={`btn btn-outline${size}`} type="button" onClick={() => setDeciding("reject")}>
        Decline<span className="visually-hidden"> {subject}</span>
      </button>
      {deciding && (
        <Dialog title={approving ? `Approve ${subject}?` : `Decline ${subject}?`} onClose={close}>
          <p className="dialog-note">{approving ? approveText : declineText}</p>
          <Alert>{error}</Alert>
          <Field id="decision-note" label={approving ? "Note (optional)" : declineNeedsReason ? "Reason (required)" : "Reason (optional)"}>
            {(p) => <textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <div className="dialog-actions">
            <button className={`btn ${approving ? "btn-primary" : "btn-danger"}`} type="button" disabled={busy || (!approving && declineNeedsReason && note.trim().length < 5)} onClick={decide}>
              {busy ? "Saving" : approving ? "Approve" : "Decline"}
            </button>
            <button className="btn btn-outline" type="button" onClick={close}>Cancel</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
