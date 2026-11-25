import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import Alert from "../components/Alert.jsx";
import Field from "../components/Field.jsx";
import Icon from "../components/Icon.jsx";
import PhoneInput from "../components/PhoneInput.jsx";
import Wordmark from "../components/Wordmark.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import useTheme from "../lib/theme.js";
import { fmt } from "../lib/format.js";
import { kgError, personNameError, phoneError } from "../lib/validation.js";
import "../styles/dark.css";
import "../styles/landing.css";
import "../styles/buy.css";

const nameRule = personNameError("Enter your name.");

// The public Buy page. Anyone can see what cooperatives have in stock and ask to buy. A request promises nothing:
// a Clerk at the cooperative answers it. No sign in, no prices (the Clerk agrees the price with the buyer).
export default function Buy() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const [stock, setStock] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [choice, setChoice] = useState({ coop: "", item: "" }); // item is "produceId|grade"
  const [kg, setKg] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => { document.title = "Buy | AgriCoopLedger"; }, []);
  useEffect(() => {
    api("/public/stock").then(setStock).catch((e) => { setLoadError(e.message); setStock([]); });
  }, [done]);

  const coop = useMemo(() => stock?.find((c) => String(c.cooperative_id) === choice.coop), [stock, choice.coop]);
  const item = useMemo(() => coop?.items.find((i) => `${i.produce_id}|${i.grade}` === choice.item), [coop, choice.item]);

  const pick = (c, i) => {
    setChoice({ coop: String(c.cooperative_id), item: i ? `${i.produce_id}|${i.grade}` : "" });
    setErrors({}); setFormError("");
    document.getElementById("buy-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async (e) => {
    e.preventDefault();
    const next = {
      coop: choice.coop ? "" : "Choose a cooperative.",
      item: choice.item ? "" : "Choose the produce and grade.",
      kg: kgError(kg),
      name: nameRule(name),
      phone: phoneError(phone),
    };
    if (!next.kg && item && Number(kg.replace(/[,\s]/g, "")) > item.available_kg) next.kg = `Only ${fmt(item.available_kg)} kg is in stock.`;
    setErrors(next); setFormError("");
    if (Object.values(next).some(Boolean)) return;
    const [produce_id, grade] = choice.item.split("|");
    setBusy(true);
    try {
      const data = await api("/public/orders", { method: "POST", body: {
        cooperative_id: Number(choice.coop), produce_id: Number(produce_id), grade, weight_kg: kg.replace(/[,\s]/g, ""),
        buyer_name: name.trim(), buyer_phone: phone, note: note.trim(),
      } });
      setDone(data);
    } catch (err) {
      if (err.field === "weight_kg") setErrors((x) => ({ ...x, kg: err.message }));
      else setFormError(err.message);
    } finally { setBusy(false); }
  };

  const again = () => { setDone(null); setKg(""); setNote(""); setChoice({ coop: "", item: "" }); setErrors({}); };

  return (
    <div className={`lp-page buy-page${dark ? " theme-dark" : ""}`}>
      <header className="buy-bar">
        <div className="lp-wrap buy-bar-in">
          <Wordmark />
          <div className="buy-bar-end">
            <button type="button" className="theme-toggle" onClick={toggle} aria-pressed={dark}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}>
              <span className="theme-icon" key={dark ? "sun" : "moon"}><Icon name={dark ? "sun" : "moon"} size={20} /></span>
            </button>
            <Link className="lp-link" to="/login">Sign in</Link>
          </div>
        </div>
      </header>

      <main className="lp-wrap buy-main">
        <h1>Buy produce straight from a cooperative</h1>
        <p className="buy-lead">
          See what cooperatives have in stock and ask to buy. A request does not commit anyone. A clerk at the
          cooperative will call you to agree the price and the pickup.
        </p>

        {done ? (
          <section className="buy-card buy-done" aria-live="polite">
            <Icon name="check" size={28} />
            <h2>Request sent</h2>
            <p><strong>{done.number}</strong>: {done.summary} from {done.cooperative_name}.</p>
            <p>A clerk will call the number you gave. Nothing is bought until they accept your request.</p>
            <div className="buy-actions">
              <button className="lp-btn" type="button" onClick={again}>Make another request</button>
              <Link className="lp-link" to="/">Back to the home page</Link>
            </div>
          </section>
        ) : (
          <div className="buy-grid">
            <section aria-labelledby="stock-title">
              <h2 id="stock-title">In stock now</h2>
              {stock === null ? <p>Loading</p> : stock.length === 0 ? (
                <div className="buy-card"><p>{loadError || "No cooperative has produce listed right now. Please check again later."}</p></div>
              ) : stock.map((c) => (
                <div className="buy-card" key={c.cooperative_id}>
                  <h3>{c.cooperative_name.replace(/\s*\(sample data\)/i, "")}</h3>
                  {c.district && <p className="buy-sub">{c.district}</p>}
                  <ul className="buy-stock">
                    {c.items.map((i) => (
                      <li key={`${i.produce_id}${i.grade}`}>
                        <span>{i.produce_name}, grade {i.grade}</span>
                        <span className="buy-kg">{fmt(i.available_kg)} kg</span>
                        <button type="button" className="buy-pick" onClick={() => pick(c, i)}>
                          Request<span className="visually-hidden"> {i.produce_name} grade {i.grade} from {c.cooperative_name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>

            <section id="buy-form" aria-labelledby="req-title">
              <h2 id="req-title">Ask to buy</h2>
              <form className="buy-card" onSubmit={submit} noValidate>
                <Alert>{formError}</Alert>
                <Field id="b-coop" label="Cooperative" error={errors.coop}>
                  {(p) => (
                    <select {...p} value={choice.coop} onChange={(e) => setChoice({ coop: e.target.value, item: "" })}>
                      <option value="">Choose a cooperative</option>
                      {(stock ?? []).map((c) => <option key={c.cooperative_id} value={c.cooperative_id}>{c.cooperative_name.replace(/\s*\(sample data\)/i, "")}</option>)}
                    </select>
                  )}
                </Field>
                <Field id="b-item" label="Produce and grade" error={errors.item}>
                  {(p) => (
                    <select {...p} value={choice.item} disabled={!coop} onChange={(e) => setChoice((c) => ({ ...c, item: e.target.value }))}>
                      <option value="">Choose produce</option>
                      {(coop?.items ?? []).map((i) => <option key={`${i.produce_id}|${i.grade}`} value={`${i.produce_id}|${i.grade}`}>{i.produce_name}, grade {i.grade} ({fmt(i.available_kg)} kg)</option>)}
                    </select>
                  )}
                </Field>
                <Field id="b-kg" label="How many kilograms" error={errors.kg}>
                  {(p) => <input {...p} type="text" inputMode="decimal" autoComplete="off" value={kg} onChange={(e) => setKg(e.target.value)} />}
                </Field>
                <Field id="b-name" label="Your name" error={errors.name}>
                  {(p) => <input {...p} type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}
                </Field>
                <Field id="b-phone" label="Your phone number" hint="The clerk will call this number." error={errors.phone}>
                  {(p) => <PhoneInput {...p} value={phone} onChange={(e) => setPhone(e.target.value)} />}
                </Field>
                <Field id="b-note" label="Note (optional)">
                  {(p) => <textarea {...p} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}
                </Field>
                <button className="lp-btn buy-submit" type="submit" disabled={busy}>{busy ? "Sending" : "Send request"}</button>
              </form>
            </section>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
