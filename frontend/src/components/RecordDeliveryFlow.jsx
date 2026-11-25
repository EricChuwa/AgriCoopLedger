import { useEffect, useRef, useState } from "react";
import { newClientId } from "../lib/clientId.js";
import { Link } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import Field from "../components/Field.jsx";
import Icon from "../components/Icon.jsx";
import { Slip, SlipRow, SlipRows } from "../components/Slip.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { useOffline } from "../context/OfflineContext.jsx";
import { GRADES, fmt, kgText, todayIso } from "../lib/format.js";
import useForm from "../lib/useForm.js";
import { kgError } from "../lib/validation.js";

const firstWord = (name) => name.split(" ")[0];

// Same rounding the server uses: whole grams, value rounded half up to a whole franc.
const valueOf = (kg, price) => Math.floor((Math.round(Number(kg) * 1000) * price + 500) / 1000);

function DeliveryForm({ onRecorded, farmerId }) {
  const { activeFarmers: farmers, activeProduce: produce, priceOn, balanceOf, addDelivery } = useLedger();
  const { online, enqueue } = useOffline();
  const wanted = farmerId == null ? null : String(farmerId);
  const startFarmer = farmers.some((f) => String(f.id) === wanted) ? wanted : "";
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const clientId = useRef(newClientId());

  const form = useForm(
    { farmerId: startFarmer, produceId: "", grade: "A", kg: "", date: todayIso() },
    {
      farmerId: (v) => (v ? "" : "Choose the farmer who brought the produce."),
      produceId: (v) => (v ? "" : "Choose the produce."),
      grade: (v) => (v ? "" : "Choose the grade."),
      kg: kgError,
      date: (v) => (!v ? "Choose the date." : v > todayIso() ? "The date cannot be in the future." : ""),
    },
  );
  const { values, errors, handleChange, handleBlur } = form;

  const item = produce.find((p) => String(p.id) === values.produceId);
  const farmer = farmers.find((f) => String(f.id) === values.farmerId);
  const kgOk = kgError(values.kg) === "";
  const kg = Number(String(values.kg).replace(/[,\s]/g, ""));
  const price = item && values.date ? priceOn(item.id, values.grade, values.date) : null;
  const value = item && kgOk && price ? valueOf(kg, price) : null;
  const before = farmer ? balanceOf(farmer.id) : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.validate()) return;
    setBusy(true);
    const body = {
      farmer_id: Number(values.farmerId), produce_id: Number(values.produceId), grade: values.grade,
      weight_kg: String(values.kg).replace(/[,\s]/g, ""), delivery_date: values.date,
      client_id: clientId.current,
    };
    // Keep it on this device and send it later (FR 4.9). The same one-time id goes with it, so if the first
    // attempt did reach the server the repeat is recognised and nothing is recorded twice.
    const keep = () => {
      const saved = enqueue({
        clientId: body.client_id, body,
        label: { farmer: farmer.full_name, produce: item.name, grade: values.grade, kg, date: values.date },
      });
      setBusy(false);
      if (saved) onRecorded({ queued: true, label: { farmer: farmer.full_name, produce: item.name, grade: values.grade, kg } });
      else setFormError("This browser would not save the delivery on the device. Write it down and record it when you are back online.");
    };
    if (!online) { keep(); return; }
    const result = await addDelivery(body);
    if (result.error?.network) { keep(); return; }
    setBusy(false);
    if (result.error) {
      const map = { farmer_id: "farmerId", produce_id: "produceId", weight_kg: "kg", delivery_date: "date", grade: "grade" };
      const field = map[result.error.field];
      if (field) form.setFieldError(field, result.error.message); else setFormError(result.error.message);
      return;
    }
    onRecorded({ delivery: result.data, owedAfter: before + result.data.value });
  };

  return (
    <div className="record">
      <form className="record-form" onSubmit={handleSubmit} noValidate>
        <Alert>{formError}</Alert>
        <Field id="farmerId" label="Farmer" error={errors.farmerId}>
          {(props) => (
            <select {...props} value={values.farmerId} onChange={handleChange} onBlur={handleBlur}>
              <option value="">Choose a farmer</option>
              {farmers.map((f) => <option key={f.id} value={f.id}>{f.full_name}</option>)}
            </select>
          )}
        </Field>

        <Field id="produceId" label="Produce" error={errors.produceId}>
          {(props) => (
            <select {...props} value={values.produceId} onChange={handleChange} onBlur={handleBlur}>
              <option value="">Choose produce</option>
              {produce.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </Field>

        <Field id="grade" label="Grade" error={errors.grade}>
          {(props) => (
            <select {...props} value={values.grade} onChange={handleChange} onBlur={handleBlur}>
              {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
            </select>
          )}
        </Field>

        <Field id="kg" label="Weight (kg)" hint="Weigh on the cooperative scale. Up to 3 decimals, for example 12.345." error={errors.kg}>
          {(props) => (
            <input {...props} type="text" inputMode="decimal" autoComplete="off" value={values.kg}
              onChange={handleChange} onBlur={handleBlur} />
          )}
        </Field>

        <Field id="date" label="Date of delivery" error={errors.date}>
          {(props) => <input {...props} type="date" max={todayIso()} value={values.date} onChange={handleChange} />}
        </Field>

        <button className="btn btn-primary record-submit" type="submit" disabled={busy}>{busy ? "Saving" : "Record delivery"}</button>
      </form>

      <Slip title="Delivery slip">
        {item && !price && (
          <p className="slip-empty">No grade {values.grade} price for {item.name} on this date. Ask the Manager to set one.</p>
        )}
        {!item || !kgOk || !price ? (
          !item || price ? <p className="slip-empty">Choose the produce and enter the weight to see its value.</p> : null
        ) : (
          <SlipRows>
            <SlipRow label="Produce" value={`${item.name}, grade ${values.grade}`} />
            <SlipRow label="Price per kg" value={`${fmt(price)} RWF`} />
            <SlipRow label="Weight" value={`${kgText(kg)}`} />
            <SlipRow strong label="Value" value={`${fmt(value)} RWF`} />
            {farmer && (
              <>
                <SlipRow label={`${firstWord(farmer.full_name)} is owed now`} value={`${fmt(before)} RWF`} />
                <SlipRow strong label="Owed after this delivery" value={`${fmt(before + value)} RWF`} />
              </>
            )}
          </SlipRows>
        )}
        <p className="slip-note">The value is added to what the farmer is owed. Nothing is paid until a Payment Officer records a payment.</p>
      </Slip>
    </div>
  );
}

function QueuedDone({ result, onAnother, onClose }) {
  const { label } = result;
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <div className="record">
      <section className="done" aria-labelledby="done-title">
        <span className="done-mark"><Icon name="check" size={26} /></span>
        <h2 id="done-title" tabIndex={-1} ref={heading}>Saved on this device</h2>
        <p className="done-lead">
          {label.farmer}'s {kgText(label.kg)} of {label.produce.toLowerCase()} (grade {label.grade}) has not reached the server yet.
          It is sent automatically when the connection returns. There is no receipt until then.
        </p>
        <p className="done-owed">Keep this page's browser and this device until it shows as sent.</p>
        <div className="done-actions">
          <button className="btn btn-primary" type="button" onClick={onAnother}>Record another delivery</button>
        </div>
        <button className="done-link link-button" type="button" onClick={onClose}>Close</button>
      </section>
    </div>
  );
}

function WaitingList() {
  const { queue, syncing, online, retry, discard } = useOffline();
  if (queue.length === 0) return null;
  return (
    <section className="queue" aria-labelledby="queue-title">
      <h2 id="queue-title">Waiting to be sent ({queue.length})</h2>
      <p className="queue-lead">
        {online ? "These are sent automatically. You can also send them now." : "These are kept on this device until the connection returns."}
      </p>
      <ul>
        {queue.map((q) => (
          <li key={q.clientId}>
            <div>
              <p className="queue-main">{q.label.farmer}: {kgText(q.label.kg)} {q.label.produce}, grade {q.label.grade}</p>
              <p className="queue-sub">Delivery date {q.label.date}. Saved {new Date(q.savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.</p>
              {q.error && <p className="queue-error">Not accepted: {q.error}</p>}
            </div>
            <button type="button" className="btn btn-outline btn-small" onClick={() => discard(q.clientId)}>
              Discard<span className="visually-hidden"> {q.label.farmer}'s delivery</span>
            </button>
          </li>
        ))}
      </ul>
      {queue.some((q) => q.error) && (
        <div className="queue-tools">
          <button type="button" className="btn btn-primary btn-small" onClick={retry} disabled={syncing || !online}>
            {syncing ? "Sending" : "Try the refused ones again"}
          </button>
        </div>
      )}
    </section>
  );
}

function DeliveryDone({ result, onAnother, onClose }) {
  const { delivery: d, owedAfter } = result;
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);

  return (
    <div className="record">
      <section className="done" aria-labelledby="done-title">
        <span className="done-mark"><Icon name="check" size={26} /></span>
        <h2 id="done-title" tabIndex={-1} ref={heading}>Delivery recorded</h2>
        <p className="done-lead">
          {d.farmer_name} delivered {kgText(d.weight_kg)} of {d.produce_name.toLowerCase()} (grade {d.grade}), worth {fmt(d.value)} RWF.
        </p>
        <p className="done-owed">
          Receipt {d.receipt_no}. Now owed to {firstWord(d.farmer_name)}: <strong>{fmt(owedAfter)} RWF</strong>
        </p>
        <div className="done-actions">
          <Link className="btn btn-primary" to={`/receipts/delivery/${d.id}`} onClick={onClose}>View receipt</Link>
          <button className="btn btn-outline" type="button" onClick={onAnother}>Record another delivery</button>
        </div>
        <button className="done-link link-button" type="button" onClick={onClose}>Close</button>
      </section>
    </div>
  );
}

export default function RecordDeliveryFlow({ farmerId, onClose }) {
  const [result, setResult] = useState(null);

  return (
    <>
      <p className="dialog-note">Produce a farmer has brought in. Its value is added to what they are owed.</p>
      {result
        ? (result.queued
          ? <QueuedDone result={result} onAnother={() => setResult(null)} onClose={onClose} />
          : <DeliveryDone result={result} onAnother={() => setResult(null)} onClose={onClose} />)
        : <DeliveryForm onRecorded={setResult} farmerId={farmerId} />}
      <WaitingList />
    </>
  );
}
