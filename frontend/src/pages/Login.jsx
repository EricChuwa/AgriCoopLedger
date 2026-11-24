import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import Field from "../components/Field.jsx";
import PasswordInput from "../components/PasswordInput.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import useForm from "../lib/useForm.js";

const rules = {
  username: (v) => (v.trim() ? "" : "Enter your username or phone number."),
  password: (v) => (v ? "" : "Enter your password."),
};

export default function Login() {
  const navigate = useNavigate();
  const { login, notice } = useAuth();
  const { values, errors, handleChange, handleBlur, validate } = useForm(
    { username: "", password: "" },
    rules
  );
  const [formError, setFormError] = useState("");
  const message = formError || notice;
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;

    setSubmitting(true);
    try {
      await login(values);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setFormError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <>
      <h1>Welcome back</h1>
      <p className="sub">Sign in with your username (or the phone number on your account) and password.</p>

      <form onSubmit={handleSubmit} noValidate>
        <Alert>{message}</Alert>

        <Field id="username" label="Username or phone number" error={errors.username}>
          {(p) => (
            <input {...p} type="text" autoComplete="username" autoCapitalize="none" spellCheck="false"
              value={values.username} onChange={handleChange} onBlur={handleBlur} />
          )}
        </Field>

        <Field id="password" label="Password" error={errors.password}>
          {(p) => (
            <PasswordInput {...p} autoComplete="current-password"
              value={values.password} onChange={handleChange} onBlur={handleBlur} />
          )}
        </Field>

        <button className="submit" type="submit" disabled={submitting}>
          {submitting ? "Signing in" : "Sign in"}
        </button>
        <p className="alt">Forgot your password? Ask your cooperative manager to reset it.</p>
      </form>
    </>
  );
}
