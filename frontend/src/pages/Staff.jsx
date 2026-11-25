import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import Dialog from "../components/Dialog.jsx";
import Field from "../components/Field.jsx";
import Icon from "../components/Icon.jsx";
import PhoneInput from "../components/PhoneInput.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { ROLE_LABEL } from "../lib/nav.js";
import { formatPhone } from "../lib/format.js";
import useForm from "../lib/useForm.js";
import { normalizePhone, personNameError, phoneError, usernameError } from "../lib/validation.js";

const ROLES = ["manager", "clerk", "payment_officer"];
const ROLE_NOTE = {
  manager: "A Manager corrects and voids entries, sets prices, sees reports and the audit log, and manages staff. A Manager does not record deliveries or payments.",
  clerk: "A Collection Clerk records deliveries and farmers, and can ask a Manager to correct a delivery.",
  payment_officer: "A Payment Officer records payments. National ID numbers are hidden from them.",
};

function EditStaffDialog({ member, onSubmit, onClose }) {
  const { values, errors, handleChange, handleBlur, validate, setFieldError } = useForm(
    { name: member.full_name, username: member.username, phone: formatPhone(member.phone).slice(1) },
    {
      name: personNameError("Enter the person's full name."),
      username: (v) => usernameError(v, true),
      phone: phoneError,
    });
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;
    setBusy(true);
    const result = await onSubmit({ full_name: values.name.trim(), username: values.username.trim(), phone: normalizePhone(values.phone) });
    setBusy(false);
    if (result.error) {
      const field = { full_name: "name" }[result.error.field] ?? result.error.field;
      if (field && field in errors) setFieldError(field, result.error.message); else setFormError(result.error.message);
      return;
    }
    onClose();
  };

  return (
    <Dialog title={`Edit ${member.full_name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <Alert>{formError}</Alert>
        <Field id="name" label="Full name" error={errors.name}>
          {(p) => <input {...p} type="text" autoComplete="off" value={values.name} onChange={handleChange} onBlur={handleBlur} />}
        </Field>
        <Field id="username" label="Username" error={errors.username}>
          {(p) => <input {...p} type="text" autoComplete="off" autoCapitalize="none" spellCheck="false" value={values.username} onChange={handleChange} onBlur={handleBlur} />}
        </Field>
        <Field id="phone" label="Phone number" error={errors.phone}>
          {(p) => <PhoneInput {...p} value={values.phone} onChange={handleChange} onBlur={handleBlur} />}
        </Field>
        <div className="dialog-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving" : "Save changes"}</button>
          <button className="btn btn-outline" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Dialog>
  );
}

export default function Staff() {
  const { user } = useAuth();
  const { staff, updateStaff, resetStaffPassword, approveStaff, rejectStaff } = useLedger();
  const [deciding, setDeciding] = useState(null); // { member, role }
  const [confirm, setConfirm] = useState(null); // { title, body, label, run }
  const [roleFor, setRoleFor] = useState(null); // { member, role }
  const [editing, setEditing] = useState(null);
  const [issued, setIssued] = useState(null);   // { name, password }
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const requests = staff.filter((s) => s.approval && s.approval !== "approved");
  const members = staff.filter((s) => !s.approval || s.approval === "approved");

  useEffect(() => { document.title = "Staff | AgriCoopLedger"; }, []);

  const run = async (promise) => {
    setBusy(true);
    const result = await promise;
    setBusy(false);
    setError(result.error ? result.error.message : "");
    setConfirm(null);
    setRoleFor(null);
    setDeciding(null);
  };

  const reset = async (s) => {
    const result = await resetStaffPassword(s.id);
    if (result.error) { setError(result.error.message); return; }
    setError("");
    setIssued({ name: s.full_name, password: result.data.temp_password });
  };

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Staff</h1>
          <p>The people who sign in, and what each may do.</p>
        </div>
        <div className="quick-actions">
          <Link className="btn btn-primary" to="/staff/new"><Icon name="plus" size={18} />Add staff member</Link>
        </div>
      </header>

      <Alert>{error}</Alert>
      {issued && (
        <div className="issued" role="status">
          <p>New temporary password for <strong>{issued.name}</strong>:</p>
          <p><code className="code">{issued.password}</code></p>
          <p className="muted">Give it to them in person or by phone. It is shown only once, and their old password no longer works.</p>
          <button className="btn btn-outline btn-small" type="button" onClick={() => setIssued(null)}>Done</button>
        </div>
      )}

      {requests.length > 0 && (
        <section aria-labelledby="requests-h" className="issued">
          <h2 id="requests-h">Waiting for your decision ({requests.length})</h2>
          <p className="muted">These people asked to join your cooperative. They cannot sign in until you approve them. You can keep the role they asked for or choose another.</p>
          <ul className="plain-list">
            {requests.map((r) => (
              <li key={r.id}>
                <strong>{r.full_name}</strong>, {formatPhone(r.phone)}, asked to join as {ROLE_LABEL[r.role]}
                {r.approval === "rejected" && <span className="pill pill-muted"> Declined</span>}
                {" "}
                <button type="button" className="btn btn-primary btn-small" onClick={() => setDeciding({ member: r, role: r.role })}>
                  Approve<span className="visually-hidden"> {r.full_name}</span>
                </button>{" "}
                {r.approval === "pending" && (
                  <button type="button" className="btn btn-outline btn-small"
                    onClick={() => setConfirm({
                      title: `Decline ${r.full_name}?`,
                      body: "They will not be able to sign in. You can still approve them later.",
                      label: "Decline",
                      run: () => run(rejectStaff(r.id)),
                    })}>
                    Decline<span className="visually-hidden"> {r.full_name}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="table-scroll"><table className="table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Username</th>
            <th scope="col">Phone</th>
            <th scope="col">Role</th>
            <th scope="col">Status</th>
            <th scope="col"><span className="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {members.map((s) => {
            const isMe = s.id === user.id;
            return (
              <tr key={s.id}>
                <th scope="row" className="cell-main">
                  <span className="cell-name">{s.full_name}</span>
                  {isMe && <span className="cell-sub">You</span>}
                </th>
                <td data-label="Username">{s.username}</td>
                <td data-label="Phone">{formatPhone(s.phone)}</td>
                <td data-label="Role">{ROLE_LABEL[s.role]}</td>
                <td data-label="Status">
                  {s.is_active ? <span className="pill pill-paid">Active</span> : <span className="pill pill-muted">Inactive</span>}
                </td>
                <td className="cell-actions">
                  <button type="button" className="row-action row-button" onClick={() => setEditing(s)}>
                    Edit<span className="visually-hidden"> {s.full_name}</span>
                  </button>
                  {!isMe && (
                    <>
                      <button type="button" className="row-action row-button" onClick={() => setRoleFor({ member: s, role: s.role })}>
                        Change role<span className="visually-hidden"> of {s.full_name}</span>
                      </button>
                      <button type="button" className="row-action row-button"
                        onClick={() => setConfirm({
                          title: s.is_active ? `Deactivate ${s.full_name}?` : `Reactivate ${s.full_name}?`,
                          body: s.is_active ? "They are signed out and can no longer sign in. Everything they recorded stays on record." : "They will be able to sign in again.",
                          label: s.is_active ? "Deactivate" : "Reactivate",
                          run: () => run(updateStaff(s.id, { is_active: !s.is_active })),
                        })}>
                        {s.is_active ? "Deactivate" : "Reactivate"}<span className="visually-hidden"> {s.full_name}</span>
                      </button>
                      <button type="button" className="row-action row-button" onClick={() => reset(s)}>
                        Reset password<span className="visually-hidden"> for {s.full_name}</span>
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>

      {editing && (
        <EditStaffDialog member={editing} onSubmit={(body) => updateStaff(editing.id, body)} onClose={() => setEditing(null)} />
      )}

      {confirm && (
        <Dialog title={confirm.title} onClose={() => setConfirm(null)}>
          <p className="dialog-lead">{confirm.body}</p>
          <div className="dialog-actions">
            <button className="btn btn-primary" type="button" disabled={busy} onClick={confirm.run}>{confirm.label}</button>
            <button className="btn btn-outline" type="button" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </Dialog>
      )}

      {deciding && (
        <Dialog title={`Approve ${deciding.member.full_name}`} onClose={() => setDeciding(null)}>
          <p className="dialog-lead">Choose what they may do. They can sign in as soon as you approve.</p>
          <fieldset className="choices">
            <legend className="visually-hidden">Role</legend>
            {ROLES.map((r) => (
              <label className="choice" key={r}>
                <input type="radio" name="approve-role" value={r} checked={deciding.role === r} onChange={() => setDeciding({ ...deciding, role: r })} />
                <span>{ROLE_LABEL[r]}</span>
              </label>
            ))}
          </fieldset>
          <p className="dialog-note">{ROLE_NOTE[deciding.role]}</p>
          <div className="dialog-actions">
            <button className="btn btn-primary" type="button" disabled={busy}
              onClick={() => run(approveStaff(deciding.member.id, deciding.role))}>Approve</button>
            <button className="btn btn-outline" type="button" onClick={() => setDeciding(null)}>Cancel</button>
          </div>
        </Dialog>
      )}

      {roleFor && (
        <Dialog title={`Change the role of ${roleFor.member.full_name}`} onClose={() => setRoleFor(null)}>
          <fieldset className="choices">
            <legend className="visually-hidden">Role</legend>
            {ROLES.map((r) => (
              <label className="choice" key={r}>
                <input type="radio" name="role" value={r} checked={roleFor.role === r} onChange={() => setRoleFor({ ...roleFor, role: r })} />
                <span>{ROLE_LABEL[r]}</span>
              </label>
            ))}
          </fieldset>
          <p className="dialog-note">{ROLE_NOTE[roleFor.role]}</p>
          <div className="dialog-actions">
            <button className="btn btn-primary" type="button" disabled={busy || roleFor.role === roleFor.member.role}
              onClick={() => run(updateStaff(roleFor.member.id, { role: roleFor.role }))}>Change role</button>
            <button className="btn btn-outline" type="button" onClick={() => setRoleFor(null)}>Cancel</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
