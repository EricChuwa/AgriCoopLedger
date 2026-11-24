import { useEffect, useState } from "react";
import Alert from "../components/Alert.jsx";
import Dialog from "../components/Dialog.jsx";
import Field from "../components/Field.jsx";
import Icon from "../components/Icon.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { GRADES, fmt, shortDate, todayIso } from "../lib/format.js";
import useForm from "../lib/useForm.js";
import { placeNameError } from "../lib/validation.js";

function priceError(value, required = true) {
  const text = String(value).replace(/[,\s]/g, "");
  if (text === "") return required ? "Enter the price per kg, in RWF." : "";
  if (!/^\d+$/.test(text)) return "Use whole numbers only, for example 350.";
  const n = Number(text);
  if (n <= 0) return "Price must be more than 0.";
  if (n > 1000000) return "That price looks too high. Check it.";
  return "";
}
const num = (v) => Number(String(v).replace(/[,\s]/g, ""));

// The price in force today for each grade.
function currentPrices(item) {
  const today = todayIso();
  return Object.fromEntries(GRADES.map((g) => {
    const hits = item.prices.filter((p) => p.grade === g && p.effective_from <= today)
      .sort((a, b) => (a.effective_from === b.effective_from ? b.id - a.id : a.effective_from < b.effective_from ? 1 : -1));
    return [g, hits[0] ?? null];
  }));
}

function AddProduceDialog({ onSubmit, onClose }) {
  const { values, errors, handleChange, handleBlur, validate, setFieldError } = useForm(
    { name: "", A: "", B: "", C: "", from: todayIso() },
    {
      name: placeNameError("Enter the produce name, for example Sorghum."),
      A: (v) => priceError(v, true),
      B: (v) => priceError(v, false),
      C: (v) => priceError(v, false),
      from: (v) => (v ? "" : "Choose the date the prices start."),
    });
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;
    setBusy(true);
    const result = await onSubmit({
      name: values.name.trim(),
      prices: GRADES.filter((g) => String(values[g]).trim() !== "")
        .map((g) => ({ grade: g, price_per_kg: num(values[g]), effective_from: values.from })),
    });
    setBusy(false);
    if (result.error) {
      if (result.error.field === "name") setFieldError("name", result.error.message); else setFormError(result.error.message);
      return;
    }
    onClose();
  };

  return (
    <Dialog title="Add produce" onClose={onClose}>
      <p className="dialog-lead">Add something the cooperative buys, with a price per kg for each grade it accepts.</p>
      <form onSubmit={handleSubmit} noValidate>
        <Alert>{formError}</Alert>
        <Field id="name" label="Produce name" error={errors.name}>
          {(p) => <input {...p} type="text" autoComplete="off" value={values.name} onChange={handleChange} onBlur={handleBlur} />}
        </Field>
        {GRADES.map((g) => (
          <Field key={g} id={g} label={`Grade ${g} price per kg (RWF)${g === "A" ? "" : " (optional)"}`} error={errors[g]}>
            {(p) => <input {...p} type="text" inputMode="numeric" autoComplete="off" value={values[g]} onChange={handleChange} onBlur={handleBlur} />}
          </Field>
        ))}
        <Field id="from" label="Prices start on" error={errors.from}>
          {(p) => <input {...p} type="date" value={values.from} onChange={handleChange} />}
        </Field>
        <div className="dialog-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving" : "Add produce"}</button>
          <button className="btn btn-outline" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Dialog>
  );
}

function PriceDialog({ item, onSubmit, onClose }) {
  const now = currentPrices(item);
  const { values, errors, handleChange, handleBlur, validate, setFieldError } = useForm(
    { grade: "A", price: now.A ? String(now.A.price_per_kg) : "", from: todayIso() },
    { grade: () => "", price: (v) => priceError(v), from: (v) => (v ? "" : "Choose the date the price starts.") });
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const current = now[values.grade];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;
    setBusy(true);
    const result = await onSubmit({ grade: values.grade, price_per_kg: num(values.price), effective_from: values.from });
    setBusy(false);
    if (result.error) {
      const field = { price_per_kg: "price", effective_from: "from" }[result.error.field];
      if (field) setFieldError(field, result.error.message); else setFormError(result.error.message);
      return;
    }
    onClose();
  };

  return (
    <Dialog title={`Set a price for ${item.name}`} onClose={onClose}>
      <p className="dialog-lead">
        {current ? `Grade ${values.grade} is ${fmt(current.price_per_kg)} RWF per kg now.` : `Grade ${values.grade} has no price yet.`}
        {" "}Deliveries already recorded keep the price they were recorded at.
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <Alert>{formError}</Alert>
        <Field id="grade" label="Grade">
          {(p) => (
            <select {...p} value={values.grade} onChange={handleChange}>
              {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
            </select>
          )}
        </Field>
        <Field id="price" label="New price per kg (RWF)" error={errors.price}>
          {(p) => <input {...p} type="text" inputMode="numeric" autoComplete="off" value={values.price} onChange={handleChange} onBlur={handleBlur} />}
        </Field>
        <Field id="from" label="Starts on" hint="It cannot start before the grade's latest price." error={errors.from}>
          {(p) => <input {...p} type="date" value={values.from} onChange={handleChange} />}
        </Field>
        <div className="dialog-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving" : "Save price"}</button>
          <button className="btn btn-outline" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Dialog>
  );
}

function RenameDialog({ item, onSubmit, onClose }) {
  const { values, errors, handleChange, handleBlur, validate, setFieldError } = useForm(
    { name: item.name }, { name: placeNameError("Enter the produce name, for example Sorghum.") });
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    const result = await onSubmit(values.name.trim());
    setBusy(false);
    if (result.error) { setFieldError("name", result.error.message); return; }
    onClose();
  };

  return (
    <Dialog title={`Rename ${item.name}`} onClose={onClose}>
      <p className="dialog-lead">Old deliveries and prices keep their link to this produce under the new name.</p>
      <form onSubmit={handleSubmit} noValidate>
        <Field id="name" label="Produce name" error={errors.name}>
          {(p) => <input {...p} type="text" autoComplete="off" value={values.name} onChange={handleChange} onBlur={handleBlur} />}
        </Field>
        <div className="dialog-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving" : "Save name"}</button>
          <button className="btn btn-outline" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Dialog>
  );
}

export default function Produce() {
  const { produce, addProduce, setPrice, setProduceActive, renameProduce } = useLedger();
  const { user } = useAuth();
  const canEdit = user.role === "manager"; // everyone can read prices (FR 3.3); only the Manager sets them
  const [dialog, setDialog] = useState(null); // { kind: "add" } or { kind: "price", item }
  const [error, setError] = useState("");

  useEffect(() => { document.title = "Produce and prices | AgriCoopLedger"; }, []);

  const history = produce
    .flatMap((p) => p.prices.map((price) => ({ ...price, name: p.name })))
    .sort((a, b) => (a.effective_from === b.effective_from ? b.id - a.id : a.effective_from < b.effective_from ? 1 : -1));

  const toggle = async (p) => {
    const result = await setProduceActive(p.id, !p.is_active);
    setError(result.error ? result.error.message : "");
  };

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>{canEdit ? "Produce and prices" : "Prices"}</h1>
          <p>What the cooperative buys and the price it pays per kilogram, for each grade.{!canEdit && " Only a Manager can change prices."}</p>
        </div>
        {canEdit && <div className="quick-actions">
          <button className="btn btn-primary" type="button" onClick={() => setDialog({ kind: "add" })}>
            <Icon name="plus" size={18} />Add produce
          </button>
        </div>}
      </header>

      <p className="notice" role="note">
        <Icon name="info" size={18} />
        <span>A price applies to deliveries dated from its start date. Deliveries already recorded keep the price they were recorded at.</span>
      </p>
      <Alert>{error}</Alert>

      <table className="table table-numbers">
        <thead>
          <tr>
            <th scope="col">Produce</th>
            {GRADES.map((g) => <th key={g} scope="col" className="num">Grade {g} per kg</th>)}
            <th scope="col">Status</th>
            {canEdit && <th scope="col"><span className="visually-hidden">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {produce.map((p) => {
            const now = currentPrices(p);
            return (
              <tr key={p.id}>
                <th scope="row" className="cell-main"><span className="cell-name">{p.name}</span></th>
                {GRADES.map((g) => (
                  <td key={g} data-label={`Grade ${g} per kg`} className="num num-strong">
                    {now[g] ? `${fmt(now[g].price_per_kg)} RWF` : <span className="muted">No price</span>}
                  </td>
                ))}
                <td data-label="Status">
                  {p.is_active ? <span className="pill pill-paid">In use</span> : <span className="pill pill-muted">Not in use</span>}
                </td>
                {canEdit && <td className="cell-actions">
                  <button type="button" className="row-action row-button" onClick={() => setDialog({ kind: "price", item: p })}>
                    Set price<span className="visually-hidden"> of {p.name}</span>
                  </button>
                  <button type="button" className="row-action row-button" onClick={() => setDialog({ kind: "rename", item: p })}>
                    Rename<span className="visually-hidden"> {p.name}</span>
                  </button>
                  <button type="button" className="row-action row-button" onClick={() => toggle(p)}>
                    {p.is_active ? "Stop using" : "Use again"}<span className="visually-hidden"> {p.name}</span>
                  </button>
                </td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {produce.length === 0 && <div className="empty-block"><p>{canEdit ? "No produce yet. Add what the cooperative buys, with its prices." : "No prices have been set yet."}</p></div>}

      <section className="dpanel history" aria-labelledby="history-title">
        <div className="panel-head">
          <h2 id="history-title">Price history</h2>
          <p>Every price the cooperative has set, newest first</p>
        </div>
        {history.length === 0 ? <p className="empty">No prices yet.</p> : (
          <ul className="activity">
            {history.map((h) => (
              <li key={h.id}>
                <div>
                  <p className="activity-primary">{h.name}, grade {h.grade}</p>
                  <p className="activity-secondary">From {shortDate(h.effective_from)}, set by {h.set_by}</p>
                </div>
                <p className="activity-amount">{fmt(h.price_per_kg)} RWF per kg</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog?.kind === "add" && <AddProduceDialog onSubmit={addProduce} onClose={() => setDialog(null)} />}
      {dialog?.kind === "rename" && (
        <RenameDialog item={dialog.item} onSubmit={(name) => renameProduce(dialog.item.id, name)} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "price" && (
        <PriceDialog item={dialog.item} onSubmit={(body) => setPrice(dialog.item.id, body)} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
