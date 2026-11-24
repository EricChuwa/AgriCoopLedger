import { useState } from "react";
import { api } from "../api.js";
import Alert from "../components/Alert.jsx";
import Field from "../components/Field.jsx";
import PasswordInput from "../components/PasswordInput.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { ROLE_LABEL } from "../lib/nav.js";
import { formatPhone } from "../lib/format.js";
import useForm from "../lib/useForm.js";

const rules = {
  current: (v) => (v === "" ? "Enter your current password." : ""),
  next: (v, all) => {
    if (v.length < 8) return "Use at least 8 characters.";
    if (v === all.current) return "Choose a password different from your current one.";
    return "";
  },
  confirm: (v, all) => (v !== all.next ? "Passwords do not match." : ""),
};

export default function Account() {
  const { user } = useAuth();
  const { coop } = useLedger();
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const { values, errors, handleChange, handleBlur, validate, setFieldError, setValue } =
    useForm({ current: "", next: "", confirm: "" }, rules);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setNotice("");
    setFormError("");
    if (!validate()) return;
    setBusy(true);
    try {
      await api("/auth/change-password", { method: "POST", body: { current_password: values.current, new_password: values.next } });
      setValue({ current: "", next: "", confirm: "" });
      setNotice("Your password was changed. Use the new one next time you sign in.");
    } catch (err) {
      if (err.field && err.field in rules) setFieldError(err.field, err.message); else setFormError(err.message);
    }
    setBusy(false);
  };

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>My account</h1>
          <p>Your details and password.</p>
        </div>
      </header>

      <div className="record">
        <section className="dpanel" aria-labelledby="details-title">
          <div className="panel-head"><h2 id="details-title">Your details</h2></div>
          <dl className="slip-rows details">
            <div className="slip-row"><dt>Name</dt><dd>{user.full_name}</dd></div>
            <div className="slip-row"><dt>Username</dt><dd>{user.username}</dd></div>
            <div className="slip-row"><dt>Phone</dt><dd>{formatPhone(user.phone)}</dd></div>
            <div className="slip-row"><dt>Role</dt><dd>{ROLE_LABEL[user.role]}</dd></div>
            <div className="slip-row"><dt>Cooperative</dt><dd>{coop.name}</dd></div>
          </dl>
        </section>

        <form className="record-form" onSubmit={handleSubmit} noValidate>
          <h2 className="form-title">Change password</h2>
          <Alert>{formError}</Alert>
          <Field id="current" label="Current password" error={errors.current}>
            {(p) => <PasswordInput {...p} autoComplete="current-password" value={values.current} onChange={handleChange} onBlur={handleBlur} />}
          </Field>
          <Field id="next" label="New password" hint="At least 8 characters." error={errors.next}>
            {(p) => <PasswordInput {...p} autoComplete="new-password" value={values.next} onChange={handleChange} onBlur={handleBlur} />}
          </Field>
          <Field id="confirm" label="Confirm new password" error={errors.confirm}>
            {(p) => <PasswordInput {...p} autoComplete="new-password" value={values.confirm} onChange={handleChange} onBlur={handleBlur} />}
          </Field>
          <button className="btn btn-primary record-submit" type="submit" disabled={busy}>{busy ? "Saving" : "Change password"}</button>
          <p className="saved" role="status">{notice}</p>
        </form>
      </div>
    </div>
  );
}
