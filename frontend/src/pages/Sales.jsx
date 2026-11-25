import { useEffect, useMemo, useState } from "react";
import Alert from "../components/Alert.jsx";
import Dialog from "../components/Dialog.jsx";
import Field from "../components/Field.jsx";
import PhoneInput from "../components/PhoneInput.jsx";
import ReasonDialog from "../components/ReverseDialog.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import Icon from "../components/Icon.jsx";
import useApiData from "../lib/useApiData.js";
import { newClientId } from "../lib/clientId.js";
import { GRADES, METHOD_LABEL, dateTime, fmt, kgText, shortDate, todayIso } from "../lib/format.js";
import { kgError, personNameError, phoneError } from "../lib/validation.js";

const SALE_PILL = {
  unpaid: ["pill pill-owed", "Unpaid"], part_paid: ["pill pill-owed", "Part paid"], paid: ["pill pill-paid", "Paid"],
  voided: ["pill pill-muted", "Voided"],
};
const PAY_PILL = {
  pending: ["pill pill-muted", "Waiting for confirmation"], confirmed: ["pill pill-paid", "Confirmed"],
  rejected: ["pill pill-owed", "Rejected"],
};
const ORDER_PILL = {
  requested: ["pill pill-owed", "New request"], accepted: ["pill pill-paid", "Accepted"], declined: ["pill pill-muted", "Declined"],
};

// Selling to buyers. The Clerk handles requests and sales and records what buyers pay. The Payment Officer
// confirms each buyer payment. The Manager reads everything and changes nothing here.
export default function Sales() {
  const { user } = useAuth();
  const role = user.role;
  const { version } = useLedger();
  const canOrders = role === "clerk" || role === "manager";
  const [tab, setTab] = useState(canOrders ? "orders" : "payments");
  const [dialog, setDialog] = useState(null);
  const [sent, setSent] = useState("");

  useEffect(() => { document.title = "Sales | AgriCoopLedger"; }, []);

  const { data: sum } = useApiData("/sales/summary", {}, version);
  const { data: orders } = useApiData(canOrders ? "/orders" : null, {}, version);
  const { data: sales } = useApiData("/sales", {}, version);
  const { data: pays } = useApiData("/buyer-payments", {}, version);

  const waiting = (pays ?? []).filter((p) => p.status === "pending").length;
  const newOrders = (orders ?? []).filter((o) => o.status === "requested").length;
  const tabs = [
    ...(canOrders ? [{ id: "orders", label: "Requests", n: newOrders }] : []),
    { id: "sales", label: "Sales" },
    { id: "payments", label: "Buyer payments", n: waiting },
  ];

  const close = (done, message) => { if (done && message) setSent(message); setDialog(null); };

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Sales</h1>
          <p>
            Produce sold to buyers. Requests come from the public Buy page.
            {role === "clerk" && " You accept or decline requests, record sales and record what buyers pay."}
            {role === "payment_officer" && " You confirm or reject each payment a buyer made."}
            {role === "manager" && " You can see everything here. The Clerk and the Payment Officer do the work."}
          </p>
        </div>
        {role === "clerk" && (
          <div className="quick-actions">
            <button className="btn btn-primary" type="button" onClick={() => setDialog({ kind: "sale" })}><Icon name="plus" size={18} />Record sale</button>
          </div>
        )}
      </header>

      {sent && <p className="notice" role="status"><Icon name="check" size={18} /><span>{sent}</span></p>}

      {sum && (
        <div className="sales-sum" role="group" aria-label="Summary">
          <div><span>Sold</span><strong>{fmt(sum.sold)} RWF</strong></div>
          <div><span>Received, confirmed</span><strong>{fmt(sum.confirmed)} RWF</strong></div>
          <div><span>Waiting for confirmation</span><strong>{fmt(sum.pending)} RWF</strong></div>
          <div><span>Buyers still owe</span><strong>{fmt(sum.owed)} RWF</strong></div>
          <div><span>Paid to farmers</span><strong>{fmt(sum.paid_to_farmers)} RWF</strong></div>
          <div><span>Still owed to farmers</span><strong>{fmt(sum.owed_to_farmers)} RWF</strong></div>
        </div>
      )}

      {sum && (
        <details className="sales-stock">
          <summary>Stock on hand</summary>
          {sum.stock.length === 0 ? <p>No produce received yet.</p> : (
            <div className="table-scroll"><table className="table table-numbers">
              <thead><tr><th scope="col">Produce</th><th scope="col" className="num">Received</th><th scope="col" className="num">Sold</th><th scope="col" className="num">On hand</th></tr></thead>
              <tbody>
                {sum.stock.map((l) => (
                  <tr key={l.produce_name + l.grade}>
                    <th scope="row" className="cell-main"><span className="cell-name">{l.produce_name}, grade {l.grade}</span></th>
                    <td data-label="Received" className="num">{kgText(l.received_kg)}</td>
                    <td data-label="Sold" className="num">{kgText(l.sold_kg)}</td>
                    <td data-label="On hand" className="num num-strong">{kgText(l.on_hand_kg)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </details>
      )}

      <div className="filters">
        <div className="filter">
          <span className="filter-label" id="st-label">Show</span>
          <div className="seg" role="group" aria-labelledby="st-label">
            {tabs.map((t) => (
              <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}{t.n > 0 ? ` (${t.n})` : ""}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "orders" && canOrders && <Orders orders={orders} role={role} onAct={setDialog} />}
      {tab === "sales" && <SalesTable sales={sales} role={role} onAct={setDialog} />}
      {tab === "payments" && <BuyerPayments pays={pays} role={role} onAct={setDialog} />}

      {dialog?.kind === "accept" && <AcceptDialog order={dialog.order} onClose={close} />}
      {dialog?.kind === "decline" && <DeclineDialog order={dialog.order} onClose={close} />}
      {dialog?.kind === "sale" && <SaleDialog onClose={close} />}
      {dialog?.kind === "void" && <VoidSaleDialog sale={dialog.sale} onClose={close} />}
      {dialog?.kind === "receive" && <ReceiveDialog sale={dialog.sale} onClose={close} />}
      {dialog?.kind === "confirm" && <ConfirmDialog payment={dialog.payment} onClose={close} />}
      {dialog?.kind === "reject" && <RejectDialog payment={dialog.payment} onClose={close} />}
    </div>
  );
}

function Empty({ children }) { return <div className="empty-block"><p>{children}</p></div>; }

function Orders({ orders, role, onAct }) {
  if (!orders) return <p>Loading</p>;
  if (orders.length === 0) return <Empty>No buyer requests yet. Requests appear here when someone uses the Buy page.</Empty>;
  return (
    <div className="table-scroll"><table className="table table-numbers">
      <thead><tr>
        <th scope="col">Request</th><th scope="col">Buyer</th><th scope="col">Wants</th><th scope="col">Status</th>
        <th scope="col"><span className="visually-hidden">Actions</span></th>
      </tr></thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id}>
            <th scope="row" className="cell-main"><span className="cell-name">{o.number}</span><span className="cell-sub">{dateTime(o.created_at)}</span></th>
            <td data-label="Buyer"><div className="cell-stack"><span className="cell-name">{o.buyer_name}</span><span className="cell-sub">{o.buyer_phone}</span>{o.note && <span className="cell-sub">{o.note}</span>}</div></td>
            <td data-label="Wants">{kgText(o.weight_kg)} {o.produce_name}, grade {o.grade}</td>
            <td data-label="Status">
              <div className="cell-stack">
                <span className={ORDER_PILL[o.status][0]}>{ORDER_PILL[o.status][1]}</span>
                {o.sale_no && <span className="cell-sub">Sale {o.sale_no}</span>}
                {o.decline_reason && <span className="cell-sub">{o.decline_reason}</span>}
              </div>
            </td>
            <td className="cell-actions">
              {role === "clerk" && o.status === "requested" && (
                <>
                  <button type="button" className="row-action row-button" onClick={() => onAct({ kind: "accept", order: o })}>Accept<span className="visually-hidden"> {o.number}</span></button>
                  <button type="button" className="row-action row-button" onClick={() => onAct({ kind: "decline", order: o })}>Decline<span className="visually-hidden"> {o.number}</span></button>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

function SalesTable({ sales, role, onAct }) {
  if (!sales) return <p>Loading</p>;
  if (sales.length === 0) return <Empty>No sales yet.</Empty>;
  return (
    <div className="table-scroll"><table className="table table-numbers">
      <thead><tr>
        <th scope="col">Sale</th><th scope="col">Buyer</th><th scope="col">Produce</th><th scope="col" className="num">Value</th>
        <th scope="col">Status</th><th scope="col"><span className="visually-hidden">Actions</span></th>
      </tr></thead>
      <tbody>
        {sales.map((s) => (
          <tr key={s.id} className={s.voided ? "row-reversed" : undefined}>
            <th scope="row" className="cell-main"><span className="cell-name">{s.number}</span><span className="cell-sub">{shortDate(s.sale_date)}{s.order_no ? `, from ${s.order_no}` : ""}</span></th>
            <td data-label="Buyer"><div className="cell-stack"><span className="cell-name">{s.buyer_name}</span><span className="cell-sub">Recorded by {s.recorded_by}</span>{s.voided && <span className="cell-sub reversed-note">Voided by {s.voided.by}: {s.voided.reason}</span>}</div></td>
            <td data-label="Produce">{kgText(s.weight_kg)} {s.produce_name}, grade {s.grade}<span className="cell-sub">{fmt(s.price_per_kg)} RWF per kg</span></td>
            <td data-label="Value" className="num num-strong">{fmt(s.value)} RWF</td>
            <td data-label="Status">
              <div className="cell-stack">
                <span className={SALE_PILL[s.status][0]}>{SALE_PILL[s.status][1]}</span>
                {!s.voided && <span className="cell-sub">Confirmed {fmt(s.confirmed)}{s.pending > 0 && `, waiting ${fmt(s.pending)}`}, owed {fmt(s.owed)} RWF</span>}
              </div>
            </td>
            <td className="cell-actions">
              {role === "clerk" && !s.voided && (
                <>
                  {s.owed - s.pending > 0 && <button type="button" className="row-action row-button" onClick={() => onAct({ kind: "receive", sale: s })}>Record payment<span className="visually-hidden"> for {s.number}</span></button>}
                  <button type="button" className="row-action row-button" onClick={() => onAct({ kind: "void", sale: s })}>Void<span className="visually-hidden"> {s.number}</span></button>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

function BuyerPayments({ pays, role, onAct }) {
  if (!pays) return <p>Loading</p>;
  if (pays.length === 0) return <Empty>No buyer payments yet.</Empty>;
  return (
    <div className="table-scroll"><table className="table table-numbers">
      <thead><tr>
        <th scope="col">Payment</th><th scope="col">Buyer</th><th scope="col" className="num">Amount</th><th scope="col">Status</th>
        <th scope="col"><span className="visually-hidden">Actions</span></th>
      </tr></thead>
      <tbody>
        {pays.map((p) => (
          <tr key={p.id}>
            <th scope="row" className="cell-main"><span className="cell-name">{p.number}</span><span className="cell-sub">{shortDate(p.payment_date)}, {p.sale_no}</span></th>
            <td data-label="Buyer"><div className="cell-stack"><span className="cell-name">{p.buyer_name}</span><span className="cell-sub">{METHOD_LABEL[p.method]}{p.reference && `, ref ${p.reference}`}, recorded by {p.recorded_by}</span></div></td>
            <td data-label="Amount" className="num num-strong">{fmt(p.amount)} RWF</td>
            <td data-label="Status">
              <div className="cell-stack">
                <span className={PAY_PILL[p.status][0]}>{PAY_PILL[p.status][1]}</span>
                {p.decided_by && <span className="cell-sub">{p.decided_by}, {dateTime(p.decided_at)}{p.decision_note && `: ${p.decision_note}`}</span>}
              </div>
            </td>
            <td className="cell-actions">
              {role === "payment_officer" && p.status === "pending" && (
                <>
                  <button type="button" className="row-action row-button" onClick={() => onAct({ kind: "confirm", payment: p })}>Confirm<span className="visually-hidden"> {p.number}</span></button>
                  <button type="button" className="row-action row-button" onClick={() => onAct({ kind: "reject", payment: p })}>Reject<span className="visually-hidden"> {p.number}</span></button>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

// ---------- dialogs ----------

function useSubmit(run, onClose, message) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError("");
    const result = await run();
    setBusy(false);
    if (result.error) { setError(result.error.message); return result; }
    onClose(true, typeof message === "function" ? message(result.data) : message);
    return result;
  };
  return { error, setError, busy, submit };
}

function Actions({ busy, label, onClose, disabled }) {
  return (
    <div className="dialog-actions">
      <button className="btn btn-primary" type="submit" disabled={busy || disabled}>{busy ? "Saving" : label}</button>
      <button className="btn btn-outline" type="button" onClick={() => onClose()}>Cancel</button>
    </div>
  );
}

// The selling price the Manager has set for a produce and grade, in force today (null if none).
function sellingNow(item, grade) {
  const today = todayIso();
  const hits = (item?.selling_prices || []).filter((p) => p.grade === grade && p.effective_from <= today)
    .sort((a, b) => (a.effective_from === b.effective_from ? b.id - a.id : a.effective_from < b.effective_from ? 1 : -1));
  return hits[0]?.price_per_kg ?? null;
}

function PriceLine({ price }) {
  return price
    ? <p className="dialog-note">Selling price: <strong>{fmt(price)} RWF per kg</strong>, set by the Manager. It cannot be changed here.</p>
    : <p className="dialog-note">No selling price is set for this produce and grade. Ask the Manager to set it on the Produce page.</p>;
}

function AcceptDialog({ order, onClose }) {
  const { acceptOrder, produce } = useLedger();
  const price = sellingNow(produce.find((p) => p.name === order.produce_name), order.grade);
  const value = Math.round(order.weight_kg * (price || 0));
  const { error, busy, submit } = useSubmit(() => acceptOrder(order.id, {}), onClose, `${order.number} accepted. The sale is in the Sales list.`);
  const go = (e) => { e.preventDefault(); if (price) submit(); };
  return (
    <Dialog title="Accept this request?" onClose={() => onClose()}>
      <p className="dialog-lead">{order.number}: {order.buyer_name} wants {kgText(order.weight_kg)} of {order.produce_name}, grade {order.grade}.</p>
      <p className="dialog-note">Tell the buyer the price before you accept. The sale takes that stock off the shelf.</p>
      <form onSubmit={go} noValidate>
        <Alert>{error}</Alert>
        <PriceLine price={price} />
        {price > 0 && <p className="dialog-note">About {fmt(value)} RWF in total. The server works out the exact amount.</p>}
        <Actions busy={busy || !price} label="Accept and record sale" onClose={onClose} />
      </form>
    </Dialog>
  );
}

function DeclineDialog({ order, onClose }) {
  const { declineOrder } = useLedger();
  return (
    <ReasonDialog title="Decline this request?" danger={false}
      summary={`${order.number}: ${order.buyer_name}, ${kgText(order.weight_kg)} ${order.produce_name.toLowerCase()}, grade ${order.grade}.`}
      note="The buyer is not told automatically. Call them if you can."
      submitLabel="Decline request" onConfirm={(reason) => declineOrder(order.id, reason)}
      onClose={(done) => onClose(done, done ? `${order.number} declined.` : "")} />
  );
}

function VoidSaleDialog({ sale, onClose }) {
  const { voidSale } = useLedger();
  return (
    <ReasonDialog title="Void this sale?"
      summary={`${sale.number}: ${sale.buyer_name}, ${kgText(sale.weight_kg)} ${sale.produce_name.toLowerCase()}, ${fmt(sale.value)} RWF.`}
      note="The sale stays on record, marked as voided, and the produce goes back into stock. A sale with buyer payments cannot be voided until a Payment Officer rejects them."
      submitLabel="Void sale" onConfirm={(reason) => voidSale(sale.id, reason)}
      onClose={(done) => onClose(done, done ? `${sale.number} voided.` : "")} />
  );
}

function SaleDialog({ onClose }) {
  const { activeProduce, recordSale } = useLedger();
  const [v, setV] = useState({ name: "", phone: "", produce: "", grade: "A", kg: "" });
  const [errors, setErrors] = useState({});
  const [clientId] = useState(newClientId);
  const { error, busy, submit } = useSubmit(() => recordSale({
    buyer_name: v.name.trim(), buyer_phone: v.phone, produce_id: Number(v.produce), grade: v.grade,
    weight_kg: v.kg.replace(/[,\s]/g, ""), client_id: clientId,
  }), onClose, "Sale recorded.");
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const price = sellingNow(activeProduce.find((x) => String(x.id) === String(v.produce)), v.grade);
  const go = (e) => {
    e.preventDefault();
    const next = {
      name: personNameError("Enter the buyer's name.")(v.name), phone: phoneError(v.phone),
      produce: v.produce ? "" : "Choose the produce.", kg: kgError(v.kg),
    };
    setErrors(next);
    if (!Object.values(next).some(Boolean)) submit();
  };
  return (
    <Dialog title="Record a sale" onClose={() => onClose()}>
      <p className="dialog-note">For a buyer at the counter. For a request from the Buy page, use Accept on the request.</p>
      <form onSubmit={go} noValidate>
        <Alert>{error}</Alert>
        <Field id="s-name" label="Buyer's name" error={errors.name}>{(p) => <input {...p} type="text" value={v.name} onChange={set("name")} />}</Field>
        <Field id="s-phone" label="Buyer's phone" error={errors.phone}>{(p) => <PhoneInput {...p} value={v.phone} onChange={set("phone")} />}</Field>
        <Field id="s-produce" label="Produce" error={errors.produce}>
          {(p) => <select {...p} value={v.produce} onChange={set("produce")}><option value="">Choose produce</option>{activeProduce.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
        </Field>
        <Field id="s-grade" label="Grade">{(p) => <select {...p} value={v.grade} onChange={set("grade")}>{GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}</select>}</Field>
        <Field id="s-kg" label="Weight (kg)" error={errors.kg}>{(p) => <input {...p} type="text" inputMode="decimal" value={v.kg} onChange={set("kg")} />}</Field>
        {v.produce && <PriceLine price={price} />}
        {price > 0 && Number(v.kg) > 0 && <p className="dialog-note">About {fmt(Math.round(Number(v.kg.replace(/[,\s]/g, "")) * price))} RWF in total.</p>}
        <Actions busy={busy || (Boolean(v.produce) && !price)} label="Record sale" onClose={onClose} />
      </form>
    </Dialog>
  );
}

function ReceiveDialog({ sale, onClose }) {
  const { recordBuyerPayment } = useLedger();
  const room = sale.owed - sale.pending;
  const [amount, setAmount] = useState(String(room));
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [problem, setProblem] = useState("");
  const [clientId] = useState(newClientId);
  const { error, busy, submit } = useSubmit(() => recordBuyerPayment(sale.id, {
    amount: Number(amount.replace(/[,\s]/g, "")), method, reference: reference.trim(), client_id: clientId,
  }), onClose, "Payment recorded. A Payment Officer will confirm it.");
  const go = (e) => {
    e.preventDefault();
    const n = Number(amount.replace(/[,\s]/g, ""));
    if (!Number.isInteger(n) || n <= 0) { setProblem("Enter the amount in whole francs."); return; }
    if (n > room) { setProblem(`Only ${fmt(room)} RWF can still be recorded.`); return; }
    setProblem(""); submit();
  };
  return (
    <Dialog title="Record a buyer payment" onClose={() => onClose()}>
      <p className="dialog-lead">{sale.number}: {sale.buyer_name}, {fmt(sale.value)} RWF. Still open: {fmt(room)} RWF.</p>
      <p className="dialog-note">It counts only after a Payment Officer confirms it.</p>
      <form onSubmit={go} noValidate>
        <Alert>{error}</Alert>
        <Field id="r-amount" label="Amount (RWF)" error={problem}>{(p) => <input {...p} type="text" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
        <Field id="r-method" label="Paid by">{(p) => <select {...p} value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Cash</option><option value="momo">Mobile money</option></select>}</Field>
        <Field id="r-ref" label="Reference (mobile money transaction id, optional)">{(p) => <input {...p} type="text" maxLength={60} value={reference} onChange={(e) => setReference(e.target.value)} />}</Field>
        <Actions busy={busy} label="Record payment" onClose={onClose} />
      </form>
    </Dialog>
  );
}

function ConfirmDialog({ payment, onClose }) {
  const { decideBuyerPayment } = useLedger();
  const [note, setNote] = useState("");
  const { error, busy, submit } = useSubmit(() => decideBuyerPayment(payment.id, "confirm", note.trim()), onClose, `${payment.number} confirmed.`);
  return (
    <Dialog title="Confirm this payment?" onClose={() => onClose()}>
      <p className="dialog-lead">{payment.number}: {fmt(payment.amount)} RWF from {payment.buyer_name} for {payment.sale_no}, {METHOD_LABEL[payment.method].toLowerCase()}{payment.reference && `, ref ${payment.reference}`}.</p>
      <p className="dialog-note">Confirm only after you have seen the money or the mobile money message.</p>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Alert>{error}</Alert>
        <Field id="c-note" label="Note (optional)">{(p) => <input {...p} type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        <Actions busy={busy} label="Confirm payment" onClose={onClose} />
      </form>
    </Dialog>
  );
}

function RejectDialog({ payment, onClose }) {
  const { decideBuyerPayment } = useLedger();
  return (
    <ReasonDialog title="Reject this payment?"
      summary={`${payment.number}: ${fmt(payment.amount)} RWF from ${payment.buyer_name} for ${payment.sale_no}.`}
      note="It will not count towards the sale. The Clerk can record it again if it was a mistake."
      submitLabel="Reject payment" onConfirm={(reason) => decideBuyerPayment(payment.id, "reject", reason)}
      onClose={(done) => onClose(done, done ? `${payment.number} rejected.` : "")} />
  );
}
