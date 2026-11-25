import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
function currentPrices(item, list = "prices") {
  const today = todayIso();
  return Object.fromEntries(GRADES.map((g) => {
    const hits = (item[list] || []).filter((p) => p.grade === g && p.effective_from <= today)
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

// A suggested selling price: what the cooperative pays for the grade now, plus a 20% margin, rounded up to 10 RWF.
const MARGIN = 1.2;
const suggest = (buy) => (buy ? Math.ceil((buy.price_per_kg * MARGIN) / 10) * 10 : null);

function PriceDialog({ item, onSubmit, onClose, selling = false }) {
  const now = currentPrices(item, selling ? "selling_prices" : "prices");
  const buying = currentPrices(item);
  const start = (g) => (now[g] ? String(now[g].price_per_kg) : selling && suggest(buying[g]) ? String(suggest(buying[g])) : "");
  const { values, errors, handleChange, handleBlur, validate, setFieldError, setValue } = useForm(
    { grade: "A", price: start("A"), from: todayIso() },
    { grade: () => "", price: (v) => priceError(v), from: (v) => (v ? "" : "Choose the date the price starts.") });
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const current = now[values.grade];
  const hint = selling ? suggest(buying[values.grade]) : null;
  const pickGrade = (e) => setValue({ grade: e.target.value, price: start(e.target.value) });

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
    <Dialog title={`${selling ? "Set a selling price for" : "Set a price for"} ${item.name}`} onClose={onClose}>
      <p className="dialog-lead">
        {current ? `Grade ${values.grade} ${selling ? "sells" : "is"} at ${fmt(current.price_per_kg)} RWF per kg now.` : `Grade ${values.grade} has no ${selling ? "selling " : ""}price yet.`}
        {selling
          ? " Clerks must sell at this price. Sales already recorded keep theirs."
          : " Deliveries already recorded keep the price they were recorded at."}
      </p>
      {selling && <p className="dialog-note">
        {buying[values.grade]
          ? `The cooperative pays farmers ${fmt(buying[values.grade].price_per_kg)} RWF per kg for Grade ${values.grade}. Suggested selling price: ${fmt(hint)} RWF (that price plus 20%, rounded up to 10).`
          : `No buying price is set for Grade ${values.grade}, so there is nothing to suggest from.`}
      </p>}
      <form onSubmit={handleSubmit} noValidate>
        <Alert>{formError}</Alert>
        <Field id="grade" label="Grade">
          {(p) => (
            <select {...p} value={values.grade} onChange={pickGrade}>
              {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
            </select>
          )}
        </Field>
        <Field id="price" label={selling ? "Selling price per kg (RWF)" : "New price per kg (RWF)"} error={errors.price}>
          {(p) => <input {...p} type="text" inputMode="numeric" autoComplete="off" value={values.price} onChange={handleChange} onBlur={handleBlur} />}
        </Field>
        <Field id="from" label="Starts on" hint="It cannot start before the grade's latest price." error={errors.from}>
          {(p) => <input {...p} type="date" value={values.from} onChange={handleChange} />}
        </Field>
        <div className="dialog-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving" : selling ? "Save selling price" : "Save price"}</button>
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
  const { produce, addProduce, setPrice, setSellingPrice, setProduceActive, renameProduce } = useLedger();
  const { user } = useAuth();
  const canEdit = user.role === "manager"; // everyone can read prices (FR 3.3); only the Manager sets them
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState(() => (params.get("add") === "1" && user.role === "manager" ? { kind: "add" } : null)); // { kind: "add" } or { kind: "price", item }
  useEffect(() => { if (params.get("add")) setParams({}, { replace: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
          <p>What the cooperative buys and the buying price it pays per kilogram, for each grade.{!canEdit && " Only a Manager can change prices."}<span className="info-tip">
            <button type="button" className="info-tip-btn" aria-label="How prices apply" aria-describedby="price-tip">
              <Icon name="info" size={18} />
            </button>
            <span id="price-tip" role="tooltip" className="info-tip-bubble">A price applies to deliveries dated from its start date. Deliveries already recorded keep the price they were recorded at.</span>
          </span></p>
        </div>
        {canEdit && <div className="quick-actions">
          <button className="btn btn-primary" type="button" onClick={() => setDialog({ kind: "add" })}>
            <Icon name="plus" size={18} />Add produce
          </button>
        </div>}
      </header>

      <Alert>{error}</Alert>

      <div className="table-scroll"><table className="table table-numbers">
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
      </table></div>
      {produce.length === 0 && <div className="empty-block"><p>{canEdit ? "No produce yet. Add what the cooperative buys, with its prices." : "No prices have been set yet."}</p></div>}

      <section aria-labelledby="sell-title" className="sell-prices">
        <div className="panel-head">
          <h2 id="sell-title">Selling prices</h2>
          <p>What the cooperative sells at, per kilogram.{canEdit ? " Clerks must use these prices when they sell." : " Set by the Manager."}</p>
        </div>
        <div className="table-scroll"><table className="table table-numbers">
          <thead>
            <tr>
              <th scope="col">Produce</th>
              {GRADES.map((g) => <th key={g} scope="col" className="num">Grade {g} per kg</th>)}
              {canEdit && <th scope="col"><span className="visually-hidden">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {produce.filter((p) => p.is_active).map((p) => {
              const now = currentPrices(p, "selling_prices");
              return (
                <tr key={p.id}>
                  <th scope="row" className="cell-main"><span className="cell-name">{p.name}</span></th>
                  {GRADES.map((g) => (
                    <td key={g} data-label={`Grade ${g} per kg`} className="num num-strong">
                      {now[g] ? `${fmt(now[g].price_per_kg)} RWF` : <span className="muted">Not set</span>}
                    </td>
                  ))}
                  {canEdit && <td className="cell-actions">
                    <button type="button" className="row-action row-button" onClick={() => setDialog({ kind: "sell", item: p })}>
                      Set selling price<span className="visually-hidden"> of {p.name}</span>
                    </button>
                  </td>}
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </section>

      <section className="dpanel history" aria-labelledby="history-title">
        <div className="panel-head">
          <h2 id="history-title">Buying price history</h2>
          <p>Every buying price the cooperative has set, newest first</p>
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
      {dialog?.kind === "sell" && (
        <PriceDialog selling item={dialog.item} onSubmit={(body) => setSellingPrice(dialog.item.id, body)} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "price" && (
        <PriceDialog item={dialog.item} onSubmit={(body) => setPrice(dialog.item.id, body)} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
