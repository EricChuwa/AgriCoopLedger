import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api } from "../api.js";
import Alert from "../components/Alert.jsx";
import Field from "../components/Field.jsx";
import PhoneInput from "../components/PhoneInput.jsx";
import PasswordInput from "../components/PasswordInput.jsx";
import useForm from "../lib/useForm.js";
import { personNameError, phoneError, placeNameError, usernameError } from "../lib/validation.js";

const rules = {
  type: (v) => (v ? "" : "Choose what you are signing up as."),
  name: personNameError("Enter your full name."),
  username: (v) => usernameError(v),
  phone: phoneError,
  coop: placeNameError("Enter your cooperative's name."),
  password: (v) => (v.length < 8 ? "Use at least 8 characters." : ""),
  confirm: (v, all) => (v !== all.password ? "Passwords do not match." : ""),
};

// What a person can sign up as. A Manager starts a new cooperative. The other two ask to join one that exists.
const TYPES = [
  { id: "manager", label: "Manager" },
  { id: "clerk", label: "Collection Clerk" },
  { id: "payment_officer", label: "Payment Officer" },
];

const EMPTY = { type: "", name: "", username: "", phone: "", coop: "", password: "", confirm: "" };

export default function Signup() {
  const { values, errors, handleChange, handleBlur, validate, setFieldError } = useForm(EMPTY, rules);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false); // joined an existing cooperative, waiting for its Manager
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { setHideTabs } = useOutletContext();

  // The success screen replaces the whole card, so the tab switch is hidden there.
  useEffect(() => {
    setHideTabs(done);
    return () => setHideTabs(false);
  }, [done, setHideTabs]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;

    setSubmitting(true);
    try {
      const created = await api("/auth/register", {
        method: "POST",
        body: {
          full_name: values.name,
          username: values.username.trim() || null,
          phone: values.phone,
          cooperative_name: values.coop,
          account_type: values.type,
          password: values.password,
        },
      });
      setPending(created.approval === "pending");
      setDone(true);
    } catch (err) {
      // The server names the field when it can (a phone number already in use).
      const formField = { phone: "phone", username: "username", cooperative_name: "coop" }[err.field];
      if (formField) setFieldError(formField, err.message);
      else setFormError(err.message);
      setSubmitting(false);
    }
  };

  if (done) {
    const firstName = values.name.trim().split(/\s+/)[0];
    return (
      <div role="status" aria-live="polite">
        <div className="tick" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#002626"
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        {pending ? (
          <>
            <h1>Request sent</h1>
            <p className="done-text">
              {firstName}, your request to join {values.coop.trim()} as {TYPES.find((t) => t.id === values.type)?.label} now
              shows on its Manager's Staff page. You can sign in once the Manager approves it.
            </p>
            <Link className="submit" to="/login">Back to sign in</Link>
          </>
        ) : (
          <>
            <h1>Account created</h1>
            <p className="done-text">
              {firstName}, {values.coop.trim()} is registered and you are its manager. Sign in to continue.
            </p>
            <Link className="submit" to="/login">Sign in</Link>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <h1>Create an account</h1>

      <form onSubmit={handleSubmit} noValidate>
        <Alert>{formError}</Alert>

        <Field id="type" label="Account type" error={errors.type}>
          {(p) => (
            <select {...p} value={values.type} onChange={handleChange} onBlur={handleBlur}>
              <option value="">Choose account type</option>
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          )}
        </Field>

        <Field id="name" label="Your full name" error={errors.name}>
          {(p) => (
            <input {...p} type="text" autoComplete="name"
              value={values.name} onChange={handleChange} onBlur={handleBlur} />
          )}
        </Field>

        <Field id="username" label="Username (optional)" hint="You sign in with this. Leave it empty and one is made from your name."
          error={errors.username}>
          {(p) => (
            <input {...p} type="text" autoComplete="username" autoCapitalize="none" spellCheck="false"
              value={values.username} onChange={handleChange} onBlur={handleBlur} />
          )}
        </Field>

        <Field id="phone" label="Phone number" hint="Also works for signing in."
          error={errors.phone}>
          {(p) => (
            <PhoneInput {...p} value={values.phone} onChange={handleChange} onBlur={handleBlur} />
          )}
        </Field>

        <Field id="coop" label="Cooperative name" error={errors.coop}>
          {(p) => (
            <input {...p} type="text" autoComplete="organization"
              value={values.coop} onChange={handleChange} onBlur={handleBlur} />
          )}
        </Field>

        <Field id="password" label="Password" hint="At least 8 characters." error={errors.password}>
          {(p) => (
            <PasswordInput {...p} autoComplete="new-password"
              value={values.password} onChange={handleChange} onBlur={handleBlur} />
          )}
        </Field>

        <Field id="confirm" label="Confirm password" error={errors.confirm}>
          {(p) => (
            <input {...p} type="password" autoComplete="new-password"
              value={values.confirm} onChange={handleChange} onBlur={handleBlur} />
          )}
        </Field>

        <button className="submit" type="submit" disabled={submitting}>
          {submitting ? "Sending" : "Continue"}
        </button>
      </form>
    </>
  );
}
