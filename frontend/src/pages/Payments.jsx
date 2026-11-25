import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { usePaymentDialog } from "../context/PaymentDialogContext.jsx";
import Icon from "../components/Icon.jsx";
import ReasonDialog from "../components/ReverseDialog.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import Alert from "../components/Alert.jsx";
import Pager from "../components/Pager.jsx";
import useApiData, { useDebounced } from "../lib/useApiData.js";
import { METHOD_LABEL, fmt, plural, shortDate, whenLabel } from "../lib/format.js";

export default function Payments() {
  const { user } = useAuth();
  const role = user.role;
  const { version, voidPayment, raiseDispute } = useLedger();
  const { openPayment } = usePaymentDialog();
  const [voiding, setVoiding] = useState(null);
  const [disputing, setDisputing] = useState(null);
  const [sent, setSent] = useState("");
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const typed = useDebounced(query);

  useEffect(() => { document.title = "Payments | AgriCoopLedger"; }, []);

  useEffect(() => { setPage(1); }, [typed, method, from, to]);
  const { data, loading, error } = useApiData("/payments", {
    q: typed, method: method === "all" ? "" : method, date_from: from, date_to: to, page, page_size: 25,
  }, version);
  const shown = data?.items ?? [];
  const total = data?.total ?? 0;
  const paidTotal = data?.live_amount ?? 0;
  const voidedInFilter = total - (data?.live_count ?? 0);
  const filtered = query !== "" || method !== "all" || from !== "" || to !== "";
  const clear = () => { setQuery(""); setMethod("all"); setFrom(""); setTo(""); };

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Payments</h1>
          <p>
            Every payment to a farmer, newest first. Payments are never deleted.
            {role === "manager" && " A Manager can void one, with a reason."}
          </p>
        </div>
        {role === "payment_officer" && (
          <div className="quick-actions">
            <button className="btn btn-primary" type="button" onClick={() => openPayment()}><Icon name="plus" size={18} />Record payment</button>
          </div>
        )}
      </header>

      <div className="filters">
        <div className="filter filter-grow">
          <label htmlFor="q">Search by farmer, reference or receipt</label>
          <input id="q" type="search" placeholder="Farmer's name, reference or P-000123" value={query}
            onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        </div>
        <div className="filter">
          <label htmlFor="method">Paid by</label>
          <select id="method" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="all">All methods</option>
            {Object.entries(METHOD_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
        <div className="filter"><label htmlFor="from">From</label><input id="from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="filter"><label htmlFor="to">To</label><input id="to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></div>
      </div>

      {sent && <p className="notice" role="status"><Icon name="check" size={18} /><span>{sent}</span></p>}
      <Alert>{error}</Alert>
      <p className="results" aria-live="polite">
        {loading && !data ? "Loading" : <>
          {total} {plural(total, "payment", "payments")}
          {total > 0 && <> &middot; {fmt(paidTotal)} RWF paid{voidedInFilter > 0 && " (voided entries not counted)"}</>}
        </>}
      </p>

      {data && shown.length === 0 ? (
        <div className="empty-block">
          <p>{filtered ? "No payments match your filters." : "No payments yet."}</p>
          {filtered
            ? <button className="btn btn-outline" type="button" onClick={clear}>Clear filters</button>
            : role === "payment_officer" && <button className="btn btn-primary" type="button" onClick={() => openPayment()}>Record the first payment</button>}
        </div>
      ) : (
        <div className="table-scroll"><table className="table table-numbers">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Farmer</th>
              <th scope="col">Paid by</th>
              <th scope="col" className="num">Amount</th>
              <th scope="col"><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} className={p.voided ? "row-reversed" : undefined}>
                <th scope="row" className="cell-main">
                  <span className="cell-name">{whenLabel(p.payment_date) || shortDate(p.payment_date)}</span>
                  <span className="cell-sub">{p.receipt_no}</span>
                </th>
                <td data-label="Farmer">
                  <div className="cell-stack">
                    <span className="cell-name">{p.farmer_name}</span>
                    <span className="cell-sub">Recorded by {p.recorded_by}</span>
                    {p.disputed && !p.voided && <span className="cell-sub"><span className="pill pill-owed">Disputed</span></span>}
                    {p.voided && (
                      <span className="cell-sub reversed-note">
                        <span className="pill pill-muted">Voided</span> by {p.voided.by}: {p.voided.reason}
                      </span>
                    )}
                  </div>
                </td>
                <td data-label="Paid by">{METHOD_LABEL[p.method]}{p.reference && <span className="cell-sub">Ref {p.reference}</span>}</td>
                <td data-label="Amount" className="num num-strong">{fmt(p.amount)} RWF</td>
                <td className="cell-actions">
                  <Link className="row-action" to={`/receipts/payment/${p.id}`}>Receipt<span className="visually-hidden"> {p.receipt_no}</span></Link>
                  {!p.voided && (role === "manager" || role === "payment_officer") && !p.disputed && (
                    <button type="button" className="row-action row-button" onClick={() => setDisputing(p)}>
                      Dispute<span className="visually-hidden"> {p.receipt_no}</span>
                    </button>
                  )}
                  {!p.voided && role === "manager" && (
                    <button type="button" className="row-action row-button" onClick={() => setVoiding(p)}>
                      Void<span className="visually-hidden"> {p.receipt_no}</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      <Pager page={page} pageSize={25} total={total} onPage={setPage} />

      {disputing && (
        <ReasonDialog
          title="Dispute this payment?"
          summary={`${disputing.receipt_no}: ${fmt(disputing.amount)} RWF to ${disputing.farmer_name}.`}
          note="Use this when someone challenges the record. Nothing changes yet. A Manager reads your reason and upholds or dismisses it."
          submitLabel="Raise dispute"
          danger={false}
          onConfirm={(reason) => raiseDispute({ payment_id: disputing.id, reason })}
          onClose={(done) => { if (done) setSent(`Dispute raised on ${disputing.receipt_no}. A Manager will decide it.`); setDisputing(null); }} />
      )}
      {voiding && (
        <ReasonDialog
          title="Void this payment?"
          summary={`${voiding.receipt_no}: ${fmt(voiding.amount)} RWF to ${voiding.farmer_name}.`}
          note="The entry stays on record, marked as voided, and the amount is owed to the farmer again. This cannot be undone."
          submitLabel="Void payment"
          onConfirm={(reason) => voidPayment(voiding.id, reason)}
          onClose={() => setVoiding(null)} />
      )}
    </div>
  );
}
