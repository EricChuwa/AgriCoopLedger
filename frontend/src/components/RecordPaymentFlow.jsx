import { useEffect, useRef, useState } from "react";
import { newClientId } from "../lib/clientId.js";
import { Link } from "react-router-dom";
import Alert from "./Alert.jsx";
import Dialog from "./Dialog.jsx";
import Field from "./Field.jsx";
import Icon from "./Icon.jsx";
import { Slip, SlipRow, SlipRows } from "./Slip.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { METHOD_LABEL, fmt, parseNumber, todayIso } from "../lib/format.js";
import useForm from "../lib/useForm.js";

const firstWord = (name) => name.split(" ")[0];

function PaymentForm({ onRecorded, farmerId }) {
  const { activeFarmers, balanceOf, addPayment } = useLedger();
  // Only farmers who are owed something can be paid.
  const farmers = activeFarmers.filter((f) => balanceOf(f.id) > 0);
  const wanted = farmerId == null ? null : String(farmerId);
  const startFarmer = farmers.some((f) => String(f.id) === wanted) ? wanted : "";
  const startOwed = startFarmer ? balanceOf(Number(startFarmer)) : 0;
  const [confirming, setConfirming] = useState(false);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const clientId = useRef(newClientId());

  const form = useForm(
    { farmerId: startFarmer, amount: startOwed > 0 ? String(startOwed) : "", method: "cash", reference: "", date: todayIso() },
    {
      farmerId: (v) => (v ? "" : "Choose the farmer you are paying."),
      amount: (v, vals) => {
        if (!vals.farmerId) return "";
        const owed = balanceOf(Number(vals.farmerId));
        if (owed <= 0) return "Nothing is owed to this farmer.";
        const text = String(v).replace(/[,\s]/g, "");
        if (text === "") return "Enter the amount paid, in RWF.";
        if (!/^\d+$/.test(text)) return "Use whole numbers only, for example 25000.";
        const n = Number(text);
        if (n <= 0) return "Amount must be more than 0.";
        if (n > owed) return `That is more than the ${fmt(owed)} RWF owed. Enter ${fmt(owed)} or less.`;
        return "";
      },
      method: () => "",
      reference: (v) => (v.length > 60 ? "Keep the reference under 60 characters." : ""),
      date: (v) => (!v ? "Choose the date." : v > todayIso() ? "The date cannot be in the future." : ""),
    },
  );
  const { values, errors, handleChange, handleBlur, setValue } = form;

  const farmer = activeFarmers.find((f) => String(f.id) === values.farmerId);
  const owed = farmer ? balanceOf(farmer.id) : 0;
  const amount = parseNumber(values.amount);
  const amountOk = farmer && owed > 0 && Number.isInteger(amount) && amount > 0 && amount <= owed;

  const handleFarmer = (e) => {
    const id = e.target.value;
    const bal = id ? balanceOf(Number(id)) : 0;
    setValue({ farmerId: id, amount: bal > 0 ? String(bal) : "" });
  };

  // Money leaves the cooperative, so the officer confirms the details first (NFR 6).
  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError("");
    if (form.validate()) setConfirming(true);
  };

  const save = async () => {
    setBusy(true);
    const result = await addPayment({
      farmer_id: Number(values.farmerId), amount: parseNumber(values.amount), method: values.method,
      reference: values.reference.trim(), payment_date: values.date,
      client_id: clientId.current,
    });
    setBusy(false);
    setConfirming(false);
    if (result.error) {
      const map = { farmer_id: "farmerId", amount: "amount", reference: "reference", payment_date: "date" };
      const field = map[result.error.field];
      if (field) form.setFieldError(field, result.error.message); else setFormError(result.error.message);
      return;
    }
    onRecorded({ payment: result.data, owedAfter: owed - result.data.amount });
  };

  return (
    <div className="record">
      <form className="record-form" onSubmit={handleSubmit} noValidate>
        <Alert>{formError}</Alert>
        <Field id="farmerId" label="Farmer" error={errors.farmerId}>
          {(props) => (
            <select {...props} value={values.farmerId} onChange={handleFarmer} onBlur={handleBlur}>
              <option value="">{farmers.length ? "Choose a farmer" : "No farmer is owed anything"}</option>
              {farmers.map((f) => (
                <option key={f.id} value={f.id}>{f.full_name}</option>
              ))}
            </select>
          )}
        </Field>

        <Field id="amount" label="Amount paid (RWF)"
          hint={farmer && owed > 0 ? "Pay the full balance or part of it. You cannot pay more than is owed." : undefined} error={errors.amount}>
          {(props) => (
            <input {...props} type="text" inputMode="numeric" autoComplete="off" value={values.amount}
              onChange={handleChange} onBlur={handleBlur} />
          )}
        </Field>
        {farmer && owed > 0 && parseNumber(values.amount) !== owed && (
          <button className="btn btn-outline btn-small full-balance" type="button"
            onClick={() => setValue({ amount: String(owed) })}>
            Pay full balance ({fmt(owed)} RWF)
          </button>
        )}

        <fieldset className="choices">
          <legend>Paid by</legend>
          <div className="choice-row">
            {Object.entries(METHOD_LABEL).map(([id, label]) => (
              <label className="choice" key={id}>
                <input type="radio" name="method" value={id} checked={values.method === id} onChange={handleChange} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {values.method === "momo" && (
          <Field id="reference" label="Mobile money reference (optional)"
            hint="The transaction ID from the confirmation message. Each reference can be used once." error={errors.reference}>
            {(p) => <input {...p} type="text" autoComplete="off" value={values.reference} onChange={handleChange} onBlur={handleBlur} />}
          </Field>
        )}

        <Field id="date" label="Date of payment" error={errors.date}>
          {(p) => <input {...p} type="date" max={todayIso()} value={values.date} onChange={handleChange} />}
        </Field>

        <button className="btn btn-primary record-submit" type="submit">Review and record payment</button>
      </form>

      <Slip title="Payment slip">
        {!farmer ? (
          <p className="slip-empty">Choose a farmer to see what is owed to them.</p>
        ) : (
          <SlipRows>
            <SlipRow label="Farmer" value={farmer.full_name} />
            <SlipRow strong label="Owed now" value={`${fmt(owed)} RWF`} />
            {amountOk && (
              <>
                <SlipRow label="This payment" value={`${fmt(amount)} RWF`} />
                <SlipRow strong label="Owed after payment" value={`${fmt(owed - amount)} RWF`} />
              </>
            )}
          </SlipRows>
        )}
        <p className="slip-note">Record a payment only when the money has been handed over. Payments cannot be edited, only voided by a Manager.</p>
      </Slip>

      {confirming && (
        <Dialog title="Confirm this payment" onClose={() => setConfirming(false)}>
          <p className="dialog-lead">
            Pay <strong>{fmt(amount)} RWF</strong> to <strong>{farmer.full_name}</strong> by {METHOD_LABEL[values.method].toLowerCase()}
            {values.method === "momo" && values.reference.trim() ? ` (ref ${values.reference.trim()})` : ""}.
          </p>
          <p className="dialog-note">After this, {fmt(owed - amount)} RWF will still be owed. Only a Manager can void it later.</p>
          <div className="dialog-actions">
            <button className="btn btn-primary" type="button" disabled={busy} onClick={save}>{busy ? "Saving" : "Confirm and record"}</button>
            <button className="btn btn-outline" type="button" onClick={() => setConfirming(false)}>Go back</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function PaymentDone({ result, onAnother, onClose }) {
  const { payment: p, owedAfter } = result;
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);

  return (
    <div className="record">
      <section className="done" aria-labelledby="done-title">
        <span className="done-mark"><Icon name="check" size={26} /></span>
        <h2 id="done-title" tabIndex={-1} ref={heading}>Payment recorded</h2>
        <p className="done-lead">
          {fmt(p.amount)} RWF paid to {p.farmer_name} ({METHOD_LABEL[p.method].toLowerCase()}). Receipt {p.receipt_no}.
        </p>
        <p className="done-owed">
          {owedAfter > 0
            ? <>Still owed to {firstWord(p.farmer_name)}: <strong>{fmt(owedAfter)} RWF</strong></>
            : <>{firstWord(p.farmer_name)} is <strong>fully paid</strong>.</>}
        </p>
        <div className="done-actions">
          <Link className="btn btn-primary" to={`/receipts/payment/${p.id}`} onClick={onClose}>View receipt</Link>
          <button className="btn btn-outline" type="button" onClick={onAnother}>Record another payment</button>
        </div>
        <button className="done-link link-button" type="button" onClick={onClose}>Close</button>
      </section>
    </div>
  );
}

export default function RecordPaymentFlow({ farmerId, onClose }) {
  const [result, setResult] = useState(null);
  return result
    ? <PaymentDone result={result} onAnother={() => setResult(null)} onClose={onClose} />
    : <PaymentForm onRecorded={setResult} farmerId={farmerId} />;
}
