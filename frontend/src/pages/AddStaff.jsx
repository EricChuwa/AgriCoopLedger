import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import Field from "../components/Field.jsx";
import Icon from "../components/Icon.jsx";
import PhoneInput from "../components/PhoneInput.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { formatPhone } from "../lib/format.js";
import { ROLE_LABEL } from "../lib/nav.js";
import { tempPassword } from "../lib/password.js";
import useForm from "../lib/useForm.js";
import { normalizePhone, personNameError, phoneError, usernameError } from "../lib/validation.js";

const rules = {
  name: personNameError("Enter the person's full name."),
  username: (v) => usernameError(v),
  phone: phoneError,
  role: (v) => (v ? "" : "Choose a role."),
  password: (v) => (v.length < 8 ? "Use at least 8 characters." : ""),
};

function AddStaffForm({ onAdded }) {
  const { addStaff } = useLedger();
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const { values, errors, handleChange, handleBlur, validate, setFieldError, setValue } =
    useForm({ name: "", username: "", phone: "", role: "clerk", password: tempPassword() }, rules);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;
    setBusy(true);
    const result = await addStaff({
      full_name: values.name.trim(), username: values.username.trim() || null, phone: normalizePhone(values.phone), role: values.role, password: values.password,
    });
    setBusy(false);
    if (result.error) {
      const field = { full_name: "name" }[result.error.field] ?? result.error.field;
      if (field && field in rules) setFieldError(field, result.error.message); else setFormError(result.error.message);
      return;
    }
    onAdded({ member: result.data, password: values.password });
  };

  return (
    <div className="record record-single">
      <form className="record-form" onSubmit={handleSubmit} noValidate>
        <Alert>{formError}</Alert>
        <Field id="name" label="Full name" error={errors.name}>
          {(p) => <input {...p} type="text" autoComplete="off" value={values.name} onChange={handleChange} onBlur={handleBlur} />}
        </Field>
        <Field id="username" label="Username (optional)" hint="They sign in with this. Leave it empty and one is made from their name." error={errors.username}>
          {(p) => <input {...p} type="text" autoComplete="off" autoCapitalize="none" spellCheck="false" value={values.username} onChange={handleChange} onBlur={handleBlur} />}
        </Field>
        <Field id="phone" label="Phone number" hint="Also works for signing in." error={errors.phone}>
          {(p) => <PhoneInput {...p} value={values.phone} onChange={handleChange} onBlur={handleBlur} />}
        </Field>
        <Field id="role" label="Role" error={errors.role}
          hint={{ clerk: "Records deliveries and farmers.", payment_officer: "Records payments.", manager: "Oversees, corrects and voids, sets prices, manages staff." }[values.role]}>
          {(p) => (
            <select {...p} value={values.role} onChange={handleChange}>
              {["clerk", "payment_officer", "manager"].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          )}
        </Field>
        <Field id="password" label="Temporary password"
          hint="Give this to them. They can change it under My account. Use the button for a new one, or type your own." error={errors.password}>
          {(p) => <input {...p} type="text" autoComplete="off" spellCheck="false" value={values.password} onChange={handleChange} onBlur={handleBlur} />}
        </Field>
        <button className="btn btn-outline btn-small full-balance" type="button" onClick={() => setValue({ password: tempPassword() })}>
          Generate a new password
        </button>
        <button className="btn btn-primary record-submit" type="submit" disabled={busy}>{busy ? "Saving" : "Add staff member"}</button>
      </form>
    </div>
  );
}

function Added({ result, onAnother }) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <div className="record record-single">
      <section className="done" aria-labelledby="done-title">
        <span className="done-mark"><Icon name="check" size={26} /></span>
        <h2 id="done-title" tabIndex={-1} ref={heading}>Staff member added</h2>
        <p className="done-lead">
          {result.member.full_name} ({ROLE_LABEL[result.member.role]}) signs in with the username {result.member.username} (or {formatPhone(result.member.phone)}) and this temporary password:
        </p>
        <p><code className="code">{result.password}</code></p>
        <p className="done-owed">Write it down now. It is not shown again.</p>
        <div className="done-actions">
          <Link className="btn btn-primary" to="/staff">Back to staff</Link>
          <button className="btn btn-outline" type="button" onClick={onAnother}>Add another</button>
        </div>
      </section>
    </div>
  );
}

export default function AddStaff() {
  const [result, setResult] = useState(null);
  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Add staff member</h1>
          <p>Create an account for a Collection Clerk, a Payment Officer or another Manager.</p>
        </div>
      </header>
      {result ? <Added result={result} onAnother={() => setResult(null)} /> : <AddStaffForm onAdded={setResult} />}
    </div>
  );
}
