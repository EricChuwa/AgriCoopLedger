import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CorrectDialog from "../components/CorrectDialog.jsx";
import Icon from "../components/Icon.jsx";
import ReasonDialog from "../components/ReverseDialog.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { useDeliveryDialog } from "../context/DeliveryDialogContext.jsx";
import Alert from "../components/Alert.jsx";
import Pager from "../components/Pager.jsx";
import useApiData, { useDebounced } from "../lib/useApiData.js";
import { fmt, kgText, plural, shortDate, whenLabel } from "../lib/format.js";

const PAY_PILL = {
  paid: { cls: "pill-paid", label: "Paid" },
  part_paid: { cls: "pill-owed", label: "Part paid" },
  in_batch: { cls: "pill-muted", label: "In batch" },
  unpaid: { cls: "pill-owed", label: "Unpaid" },
};

export default function Deliveries() {
  const { user } = useAuth();
  const { openDelivery } = useDeliveryDialog();
  const role = user.role;
  const { produce, version, voidDelivery, correctDelivery, requestCorrection, raiseDispute } = useLedger();
  const [dialog, setDialog] = useState(null); // { kind: "void" | "correct" | "request" | "dispute", delivery }
  const [query, setQuery] = useState("");
  const [produceId, setProduceId] = useState("all");
  const [grade, setGrade] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sent, setSent] = useState("");
  const [page, setPage] = useState(1);
  const typed = useDebounced(query);

  useEffect(() => { document.title = "Deliveries | AgriCoopLedger"; }, []);

  // The server filters, sorts (newest first) and cuts the list into pages.
  useEffect(() => { setPage(1); }, [typed, produceId, grade, from, to]);
  const { data, loading, error } = useApiData("/deliveries", {
    q: typed, produce_id: produceId === "all" ? "" : produceId, grade: grade === "all" ? "" : grade,
    date_from: from, date_to: to, page, page_size: 25,
  }, version);
  const shown = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalKg = data?.live_kg ?? 0;
  const totalValue = data?.live_value ?? 0;
  const voidedInFilter = total - (data?.live_count ?? 0);
  const filtered = query !== "" || produceId !== "all" || grade !== "all" || from !== "" || to !== "";
  const clear = () => { setQuery(""); setProduceId("all"); setGrade("all"); setFrom(""); setTo(""); };

  const close = (data) => {
    if (data && dialog?.kind === "request") setSent(`Your request for ${dialog.delivery.receipt_no} was sent to a Manager.`);
    if (data && dialog?.kind === "dispute") setSent(`Dispute raised on ${dialog.delivery.receipt_no}. A Manager will decide it.`);
    setDialog(null);
  };

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Deliveries</h1>
          <p>
            Every delivery of produce, newest first. Deliveries are never deleted.
            {role === "manager" && " A Manager can correct or void one, with a reason."}
            {role === "clerk" && " If a delivery is wrong, ask a Manager to correct it."}
          </p>
        </div>
        {role === "clerk" && (
          <div className="quick-actions">
            <button className="btn btn-primary" type="button" onClick={() => openDelivery()}><Icon name="plus" size={18} />Record delivery</button>
          </div>
        )}
      </header>

      {sent && <p className="notice" role="status"><Icon name="check" size={18} /><span>{sent}</span></p>}

      <div className="filters">
        <div className="filter filter-grow">
          <label htmlFor="q">Search by farmer or receipt</label>
          <input id="q" type="search" placeholder="Farmer's name or D-000123" value={query}
            onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        </div>
        <div className="filter">
          <label htmlFor="produce">Produce</label>
          <select id="produce" value={produceId} onChange={(e) => setProduceId(e.target.value)}>
            <option value="all">All produce</option>
            {produce.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="filter">
          <label htmlFor="grade">Grade</label>
          <select id="grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="all">All grades</option>
            {["A", "B", "C"].map((g) => <option key={g} value={g}>Grade {g}</option>)}
          </select>
        </div>
        <div className="filter"><label htmlFor="from">From</label><input id="from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="filter"><label htmlFor="to">To</label><input id="to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></div>
      </div>

      <Alert>{error}</Alert>
      <p className="results" aria-live="polite">
        {loading && !data ? "Loading" : <>
          {total} {plural(total, "delivery", "deliveries")}
          {total > 0 && <> &middot; {kgText(totalKg)} &middot; {fmt(totalValue)} RWF{voidedInFilter > 0 && " (voided entries not counted)"}</>}
        </>}
      </p>

      {data && shown.length === 0 ? (
        <div className="empty-block">
          <p>{filtered ? "No deliveries match your filters." : "No deliveries yet."}</p>
          {filtered
            ? <button className="btn btn-outline" type="button" onClick={clear}>Clear filters</button>
            : role === "clerk" && <button className="btn btn-primary" type="button" onClick={() => openDelivery()}>Record the first delivery</button>}
        </div>
      ) : (
        <div className="table-scroll"><table className="table table-numbers">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Farmer</th>
              <th scope="col">Produce</th>
              <th scope="col" className="num">Weight</th>
              <th scope="col" className="num">Price per kg</th>
              <th scope="col" className="num">Value</th>
              <th scope="col">Status</th>
              <th scope="col"><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.id} className={d.voided ? "row-reversed" : undefined}>
                <th scope="row" className="cell-main">
                  <span className="cell-name">{whenLabel(d.delivery_date) || shortDate(d.delivery_date)}</span>
                  <span className="cell-sub">{d.receipt_no}</span>
                </th>
                <td data-label="Farmer">
                  <div className="cell-stack">
                    <span className="cell-name">{d.farmer_name}</span>
                    <span className="cell-sub">Recorded by {d.recorded_by}</span>
                    {d.voided && <span className="cell-sub reversed-note">Voided by {d.voided.by}: {d.voided.reason}</span>}
                  </div>
                </td>
                <td data-label="Produce">{d.produce_name}, grade {d.grade}</td>
                <td data-label="Weight" className="num">{kgText(d.weight_kg)}</td>
                <td data-label="Price per kg" className="num">{fmt(d.price_per_kg)} RWF</td>
                <td data-label="Value" className="num num-strong">{fmt(d.value)} RWF</td>
                <td data-label="Status">
                  <div className="cell-stack">
                    {d.voided ? <span className="pill pill-muted">Voided</span> : <span className={`pill ${PAY_PILL[d.payment_status]?.cls}`}>{PAY_PILL[d.payment_status]?.label}</span>}
                    {d.status === "disputed" && <span className="cell-sub"><span className="pill pill-owed">Disputed</span></span>}
                    {d.status === "correction_pending" && <span className="cell-sub"><span className="pill pill-muted">Correction requested</span></span>}
                    {d.corrected && !d.voided && <span className="cell-sub">Corrected, see Corrections</span>}
                  </div>
                </td>
                <td className="cell-actions">
                  <Link className="row-action" to={`/receipts/delivery/${d.id}`}>Receipt<span className="visually-hidden"> {d.receipt_no}</span></Link>
                  {!d.voided && role === "manager" && (
                    <>
                      <button type="button" className="row-action row-button" onClick={() => setDialog({ kind: "correct", delivery: d })}>
                        Correct<span className="visually-hidden"> {d.receipt_no}</span>
                      </button>
                      <button type="button" className="row-action row-button" onClick={() => setDialog({ kind: "void", delivery: d })}>
                        Void<span className="visually-hidden"> {d.receipt_no}</span>
                      </button>
                    </>
                  )}
                  {!d.voided && (role === "manager" || role === "clerk") && d.status !== "disputed" && (
                    <button type="button" className="row-action row-button" onClick={() => setDialog({ kind: "dispute", delivery: d })}>
                      Dispute<span className="visually-hidden"> {d.receipt_no}</span>
                    </button>
                  )}
                  {!d.voided && role === "clerk" && !d.pending_correction && (
                    <button type="button" className="row-action row-button" onClick={() => setDialog({ kind: "request", delivery: d })}>
                      Request correction<span className="visually-hidden"> for {d.receipt_no}</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      <Pager page={page} pageSize={25} total={total} onPage={setPage} />

      {dialog?.kind === "void" && (
        <ReasonDialog
          title="Void this delivery?"
          summary={`${dialog.delivery.receipt_no}: ${dialog.delivery.farmer_name}, ${kgText(dialog.delivery.weight_kg)} ${dialog.delivery.produce_name.toLowerCase()}, worth ${fmt(dialog.delivery.value)} RWF.`}
          note="The entry stays on record, marked as voided, and stops counting towards balances. This cannot be undone."
          submitLabel="Void delivery"
          onConfirm={(reason) => voidDelivery(dialog.delivery.id, reason)}
          onClose={close} />
      )}
      {dialog?.kind === "dispute" && (
        <ReasonDialog
          title="Dispute this delivery?"
          summary={`${dialog.delivery.receipt_no}: ${dialog.delivery.farmer_name}, ${kgText(dialog.delivery.weight_kg)} ${dialog.delivery.produce_name.toLowerCase()}, grade ${dialog.delivery.grade}, worth ${fmt(dialog.delivery.value)} RWF.`}
          note="Use this when someone challenges the record. Nothing changes yet. A Manager reads your reason and upholds or dismisses it."
          submitLabel="Raise dispute"
          danger={false}
          onConfirm={(reason) => raiseDispute({ delivery_id: dialog.delivery.id, reason })}
          onClose={close} />
      )}
      {dialog?.kind === "correct" && (
        <CorrectDialog delivery={dialog.delivery} mode="correct" onClose={close}
          onSubmit={(body) => correctDelivery(dialog.delivery.id, body)} />
      )}
      {dialog?.kind === "request" && (
        <CorrectDialog delivery={dialog.delivery} mode="request" onClose={close}
          onSubmit={(body) => requestCorrection({ ...body, delivery_id: dialog.delivery.id })} />
      )}
    </div>
  );
}
