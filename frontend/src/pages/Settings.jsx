import { useState } from "react";
import Alert from "../components/Alert.jsx";
import Field from "../components/Field.jsx";
import PhoneInput from "../components/PhoneInput.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { formatPhone } from "../lib/format.js";
import useForm from "../lib/useForm.js";
import { normalizePhone, phoneError, placeNameError } from "../lib/validation.js";

const rules = {
  name: placeNameError("Enter your cooperative's name."),
  district: placeNameError("", false),
  phone: (v) => (v.trim() === "" ? "" : phoneError(v)),
};

export default function Settings() {
  const { coop, updateCoop } = useLedger();
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const { values, errors, handleChange, handleBlur, validate, setFieldError } = useForm({
    name: coop.name,
    district: coop.district,
    phone: coop.phone ? formatPhone(coop.phone).slice(1) : "",
  }, rules);

  const onChange = (e) => { setSaved(false); handleChange(e); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;
    setBusy(true);
    const result = await updateCoop({
      name: values.name.trim(),
      district: values.district.trim(),
      phone: values.phone.trim() ? normalizePhone(values.phone) : "",
    });
    setBusy(false);
    if (result.error) {
      if (result.error.field && result.error.field in rules) setFieldError(result.error.field, result.error.message);
      else setFormError(result.error.message);
      return;
    }
    setSaved(true);
  };

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Cooperative settings</h1>
          <p>Details shown on receipts, statements and reports.</p>
        </div>
      </header>

      <div className="record record-single">
        <form className="record-form" onSubmit={handleSubmit} noValidate>
          <Alert>{formError}</Alert>
          <Field id="name" label="Cooperative name" error={errors.name}>
            {(p) => <input {...p} type="text" autoComplete="organization" value={values.name} onChange={onChange} onBlur={handleBlur} />}
          </Field>
          <Field id="district" label="District or sector (optional)" error={errors.district}>
            {(p) => <input {...p} type="text" autoComplete="off" value={values.district} onChange={onChange} onBlur={handleBlur} />}
          </Field>
          <Field id="phone" label="Contact phone (optional)" error={errors.phone}>
            {(p) => <PhoneInput {...p} value={values.phone} onChange={onChange} onBlur={handleBlur} />}
          </Field>
          <button className="btn btn-primary record-submit" type="submit" disabled={busy}>{busy ? "Saving" : "Save settings"}</button>
          <p className="saved" role="status">{saved ? "Saved." : ""}</p>
        </form>
      </div>
    </div>
  );
}
