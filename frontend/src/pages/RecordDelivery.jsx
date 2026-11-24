import { useEffect, useRef, useState } from "react";
import { newClientId } from "../lib/clientId.js";
import { Link, useSearchParams } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import Field from "../components/Field.jsx";
import Icon from "../components/Icon.jsx";
import { Slip, SlipRow, SlipRows } from "../components/Slip.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { GRADES, fmt, kgText, todayIso } from "../lib/format.js";
import useForm from "../lib/useForm.js";
import { kgError } from "../lib/validation.js";

const firstWord = (name) => name.split(" ")[0];

// Same rounding the server uses: whole grams, value rounded half up to a whole franc.
const valueOf = (kg, price) => Math.floor((Math.round(Number(kg) * 1000) * price + 500) / 1000);

function DeliveryForm({ onRecorded }) {
  const { activeFarmers: farmers, activeProduce: produce, priceOn, balanceOf, addDelivery } = useLedger();
  const [params] = useSearchParams();
  const wanted = params.get("farmer");
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
    const result = await addDelivery({
      farmer_id: Number(values.farmerId), produce_id: Number(values.produceId), grade: values.grade,
      weight_kg: String(values.kg).replace(/[,\s]/g, ""), delivery_date: values.date,
      client_id: clientId.current,
    });
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

function DeliveryDone({ result, onAnother }) {
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
          <Link className="btn btn-primary" to={`/receipts/delivery/${d.id}`}>View receipt</Link>
          <button className="btn btn-outline" type="button" onClick={onAnother}>Record another delivery</button>
        </div>
        <Link className="done-link" to="/dashboard">Back to dashboard</Link>
      </section>
    </div>
  );
}

export default function RecordDelivery() {
  const [result, setResult] = useState(null);

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Record delivery</h1>
          <p>Produce a farmer has brought in. Its value is added to what they are owed.</p>
        </div>
      </header>
      {result
        ? <DeliveryDone result={result} onAnother={() => setResult(null)} />
        : <DeliveryForm onRecorded={setResult} />}
    </div>
  );
}
