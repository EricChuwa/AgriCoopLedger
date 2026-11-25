import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "../styles/dialog-form.css";
import Dialog from "../components/Dialog.jsx";
import FarmerForm from "../components/FarmerForm.jsx";
import Icon from "../components/Icon.jsx";
import DecisionButtons from "../components/DecisionButtons.jsx";
import BalancePill from "../components/Pill.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { useDeliveryDialog } from "../context/DeliveryDialogContext.jsx";
import { usePaymentDialog } from "../context/PaymentDialogContext.jsx";
import { fmt, formatPhone, shortDate } from "../lib/format.js";
import { matchesText } from "../lib/filters.js";

const STATUS = [
  { id: "all", label: "All" },
  { id: "owed", label: "Owed money" },
  { id: "paid", label: "Paid up" },
  { id: "inactive", label: "Inactive" },
  { id: "waiting", label: "Waiting" },
];

export default function Farmers() {
  const { user } = useAuth();
  const role = user.role;
  const { farmers, decideFarmer, addFarmer } = useLedger();
  const { openDelivery } = useDeliveryDialog();
  const { openPayment } = usePaymentDialog();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(params.get("add") === "1");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState("all");
  useEffect(() => { setQuery(params.get("q") ?? ""); }, [params]);
  const [sort, setSort] = useState("name");

  const closeAdd = () => {
    setAdding(false);
    if (params.get("add")) { const next = new URLSearchParams(params); next.delete("add"); setParams(next, { replace: true }); }
  };
  // The form sits in a pop up on this page. When it is saved the pop up closes and the list shows the new farmer.
  const handleAdd = async (body) => {
    const result = await addFarmer(body);
    if (result.data) {
      const f = result.data;
      setNotice(f.enrolment === "pending"
        ? `${f.full_name} was sent to a Manager for approval. You can record deliveries once they are approved.`
        : `${f.full_name} was added.`);
      setStatus(f.enrolment === "pending" ? "waiting" : "all");
      closeAdd();
    }
    return result;
  };
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const rows = farmers;
  const q = query.replace(/^0/, "");
  // The Payment Officer sees the ID masked, so it is not searchable for them (same rule as the server).
  const shown = rows
    .filter((r) => matchesText([r.full_name, r.phone, r.village, role === "payment_officer" ? "" : r.national_id], q))
    .filter((r) => (status === "waiting" ? r.enrolment !== "approved"
      : status === "inactive" ? r.enrolment === "approved" && !r.is_active
      : status === "all" ? r.is_active || r.enrolment === "pending"   // farmers waiting for approval show here too
      : r.is_active))
    .filter((r) => ["all", "inactive", "waiting"].includes(status) || (status === "owed" ? r.balance > 0 : r.balance <= 0))
    .sort((a, b) => (sort === "owed" ? b.balance - a.balance || a.full_name.localeCompare(b.full_name) : 0));

  const activeCount = rows.filter((r) => r.is_active).length;
  const waitingCount = rows.filter((r) => r.enrolment === "pending").length;
  const total = status === "waiting" ? rows.filter((r) => r.enrolment !== "approved").length
    : status === "inactive" ? rows.filter((r) => r.enrolment === "approved" && !r.is_active).length
    : status === "all" ? activeCount + waitingCount : activeCount;
  const owedTotal = shown.reduce((s, r) => s + Math.max(r.balance, 0), 0);
  const filtered = query !== "" || status !== "all";
  const clear = () => { setQuery(""); setStatus("all"); };

  useEffect(() => { document.title = "Farmers | AgriCoopLedger"; }, []);

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Farmers</h1>
          <p>Everyone who sells to the cooperative, and what each is owed.</p>
        </div>
        {role !== "payment_officer" && (
          <div className="quick-actions">
            <button className="btn btn-primary" type="button" onClick={() => setAdding(true)}><Icon name="plus" size={18} />{role === "clerk" ? "Propose farmer" : "Add farmer"}</button>
          </div>
        )}
      </header>

      {notice && <p className="notice" role="status"><Icon name="check" size={18} /><span>{notice}</span></p>}

      <div className="filters">
        <div className="filter filter-grow">
          <label htmlFor="q">Search</label>
          <input id="q" type="search" placeholder={role === "payment_officer" ? "Name, phone or village" : "Name, national ID, phone or village"}
            value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        </div>
        <div className="filter">
          <span className="filter-label" id="status-label">Show</span>
          <div className="seg" role="group" aria-labelledby="status-label">
            {STATUS.map((s) => (
              <button key={s.id} type="button" aria-pressed={status === s.id} onClick={() => setStatus(s.id)}>
                {s.label}{s.id === "waiting" && waitingCount > 0 ? ` (${waitingCount})` : ""}
              </button>
            ))}
          </div>
        </div>
        <div className="filter">
          <label htmlFor="sort">Sort by</label>
          <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">Name</option>
            <option value="owed">Most owed</option>
          </select>
        </div>
      </div>

      <p className="results" aria-live="polite">
        Showing {shown.length} of {total} farmers
        {shown.length > 0 && <> &middot; {fmt(owedTotal)} RWF owed to these farmers</>}
      </p>

      {shown.length === 0 ? (
        <div className="empty-block">
          <p>{filtered ? "No farmers match your search." : "No farmers yet."}</p>
          {filtered
            ? <button className="btn btn-outline" type="button" onClick={clear}>Clear search and filters</button>
            : role !== "payment_officer" && <button className="btn btn-primary" type="button" onClick={() => setAdding(true)}>Add the first farmer</button>}
        </div>
      ) : (
        <div className="table-scroll"><table className="table">
          <thead>
            <tr>
              <th scope="col">Farmer</th>
              <th scope="col">National ID</th>
              <th scope="col">Phone</th>
              <th scope="col">Last delivery</th>
              <th scope="col">Balance</th>
              <th scope="col"><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <th scope="row" className="cell-main">
                  <Link className="cell-name cell-link" to={`/farmers/${r.id}`}>{r.full_name}</Link>
                  {r.village && <span className="cell-sub">{r.village}</span>}
                </th>
                <td data-label="National ID">{r.national_id}</td>
                <td data-label="Phone">{r.phone ? formatPhone(r.phone) : <span className="muted">Not given</span>}</td>
                <td data-label="Last delivery">{r.last_delivery_date ? shortDate(r.last_delivery_date) : "None yet"}</td>
                <td data-label="Balance">{r.enrolment === "pending" ? <span className="pill pill-muted">Waiting for a Manager</span>
                  : r.enrolment === "rejected" ? <span className="pill pill-muted">Declined</span>
                  : r.is_active ? <BalancePill owed={r.balance} /> : <span className="pill pill-muted">Inactive</span>}</td>
                <td className="cell-actions">
                  {r.enrolment === "pending" && role === "manager" && (
                    <DecisionButtons subject={r.full_name}
                      approveText="They become an active farmer and deliveries can be recorded."
                      declineText="They stay on record as declined and cannot deliver."
                      onDecide={(d, note) => decideFarmer(r.id, d, note)} />
                  )}
                  {r.is_active && role === "clerk" && (
                    <button className="row-action" type="button" onClick={() => openDelivery(r.id)}>
                      Record delivery<span className="visually-hidden"> for {r.full_name}</span>
                    </button>
                  )}
                  {r.is_active && role === "payment_officer" && r.balance > 0 && (
                    <button className="row-action" type="button" onClick={() => openPayment(r.id)}>
                      Record payment<span className="visually-hidden"> for {r.full_name}</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {adding && (
        <Dialog title={role === "clerk" ? "Propose a farmer" : "Add a farmer"} onClose={closeAdd}>
          <p className="dialog-note">
            {role === "clerk"
              ? "A Manager must approve the farmer before you can record deliveries for them."
              : "The farmer is approved at once and can deliver straight away."}
          </p>
          <FarmerForm initial={{ name: "", national_id: "", phone: "", village: "", member_since: "" }}
            submitLabel={role === "clerk" ? "Propose farmer" : "Add farmer"} onSubmit={handleAdd} />
          <div className="dialog-actions"><button className="btn btn-outline" type="button" onClick={closeAdd}>Cancel</button></div>
        </Dialog>
      )}
    </div>
  );
}
