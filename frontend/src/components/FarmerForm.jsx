import { useState } from "react";
import Alert from "./Alert.jsx";
import Field from "./Field.jsx";
import PhoneInput from "./PhoneInput.jsx";
import useForm from "../lib/useForm.js";
import { nationalIdDigits, nationalIdError, normalizePhone, phoneError, personNameError, placeNameError } from "../lib/validation.js";
import { todayIso } from "../lib/format.js";

const rules = {
  name: personNameError("Enter the farmer's full name."),
  national_id: nationalIdError,
  // A phone number is optional, but when given it must be a valid Rwandan mobile number.
  phone: (v) => (v.trim() === "" ? "" : phoneError(v)),
  village: placeNameError("", false),
  member_since: (v) => (v && v > todayIso() ? "The membership date cannot be in the future." : ""),
};

// Shared by Add farmer and Edit farmer.
// onSubmit(body) is async and returns { error: { field, message } } or { data }.
export default function FarmerForm({ initial, submitLabel, onSubmit }) {
  const { values, errors, handleChange, handleBlur, validate, setFieldError } = useForm(initial, rules);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;
    setBusy(true);
    const result = await onSubmit({
      full_name: values.name.trim(),
      national_id: nationalIdDigits(values.national_id),
      phone: values.phone.trim() ? normalizePhone(values.phone) : "",
      village: values.village.trim(),
      member_since: values.member_since || null,
    });
    setBusy(false);
    if (result?.error) {
      const field = { full_name: "name" }[result.error.field] ?? result.error.field;
      if (field && field in rules) setFieldError(field, result.error.message);
      else setFormError(result.error.message);
    }
  };

  return (
    <form className="record-form" onSubmit={handleSubmit} noValidate>
      <Alert>{formError}</Alert>
      <Field id="name" label="Full name" error={errors.name}>
        {(p) => <input {...p} type="text" autoComplete="off" value={values.name} onChange={handleChange} onBlur={handleBlur} />}
      </Field>
      <Field id="national_id" label="National ID number" hint="16 digits. Each ID can be registered once in the cooperative." error={errors.national_id}>
        {(p) => <input {...p} type="text" inputMode="numeric" autoComplete="off" value={values.national_id} onChange={handleChange} onBlur={handleBlur} />}
      </Field>
      <Field id="phone" label="Phone number (optional)"
        hint="A mobile number lets the cooperative reach the farmer. Each number can belong to one farmer." error={errors.phone}>
        {(p) => <PhoneInput {...p} value={values.phone} onChange={handleChange} onBlur={handleBlur} />}
      </Field>
      <Field id="village" label="Village or sector (optional)" error={errors.village}>
        {(p) => <input {...p} type="text" autoComplete="off" value={values.village} onChange={handleChange} onBlur={handleBlur} />}
      </Field>
      <Field id="member_since" label="Member since (optional)" hint="Leave empty to use today." error={errors.member_since}>
        {(p) => <input {...p} type="date" max={todayIso()} value={values.member_since} onChange={handleChange} onBlur={handleBlur} />}
      </Field>
      <button className="btn btn-primary record-submit" type="submit" disabled={busy}>{busy ? "Saving" : submitLabel}</button>
    </form>
  );
}
