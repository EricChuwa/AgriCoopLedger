import { useState } from "react";
import Alert from "./Alert.jsx";
import Dialog from "./Dialog.jsx";
import Field from "./Field.jsx";

// Asks for a reason, then runs an action that needs one (void a delivery, void a payment,
// correct a delivery, request a correction). onConfirm(reason) is async and returns { error } or { data }.
// children are extra fields shown above the reason; extraValid() lets them block the submit.
export default function ReasonDialog({ title, summary, note, submitLabel, danger = true, onConfirm, onClose, children, beforeSubmit }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (beforeSubmit) {
      const problem = beforeSubmit();
      if (problem) { setFormError(problem); return; }
    }
    if (reason.trim().length < 5) {
      setError("Give a reason of at least 5 characters, for example: scale was misread.");
      document.getElementById("reason")?.focus();
      return;
    }
    setBusy(true);
    const result = await onConfirm(reason.trim());
    setBusy(false);
    if (result.error) { setFormError(result.error.message); return; }
    onClose(result.data);
  };

  return (
    <Dialog title={title} onClose={() => onClose()}>
      {summary && <p className="dialog-lead">{summary}</p>}
      {note && <p className="dialog-note">{note}</p>}
      <form onSubmit={handleSubmit} noValidate>
        <Alert>{formError}</Alert>
        {children}
        <Field id="reason" label="Reason" error={error}>
          {(p) => (
            <textarea {...p} rows={3} value={reason}
              onChange={(e) => { setReason(e.target.value); if (error) setError(""); }} />
          )}
        </Field>
        <div className="dialog-actions">
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} type="submit" disabled={busy}>
            {busy ? "Saving" : submitLabel}
          </button>
          <button className="btn btn-outline" type="button" onClick={() => onClose()}>Cancel</button>
        </div>
      </form>
    </Dialog>
  );
}
