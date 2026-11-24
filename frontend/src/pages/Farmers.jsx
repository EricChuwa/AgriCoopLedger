import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import BalancePill from "../components/Pill.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { fmt, formatPhone, shortDate } from "../lib/format.js";
import { matchesText } from "../lib/filters.js";

const STATUS = [
  { id: "all", label: "All" },
  { id: "owed", label: "Owed money" },
  { id: "paid", label: "Paid up" },
  { id: "inactive", label: "Inactive" },
];

export default function Farmers() {
  const { user } = useAuth();
  const role = user.role;
  const { farmers } = useLedger();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState("all");
  useEffect(() => { setQuery(params.get("q") ?? ""); }, [params]);
  const [sort, setSort] = useState("name");

  const rows = farmers;
  const q = query.replace(/^0/, "");
  // The Payment Officer sees the ID masked, so it is not searchable for them (same rule as the server).
  const shown = rows
    .filter((r) => matchesText([r.full_name, r.phone, r.village, role === "payment_officer" ? "" : r.national_id], q))
    .filter((r) => (status === "inactive" ? !r.is_active : r.is_active))
    .filter((r) => status === "all" || status === "inactive" || (status === "owed" ? r.balance > 0 : r.balance <= 0))
    .sort((a, b) => (sort === "owed" ? b.balance - a.balance || a.full_name.localeCompare(b.full_name) : 0));

  const activeCount = rows.filter((r) => r.is_active).length;
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
            <Link className="btn btn-primary" to="/farmers/new"><Icon name="plus" size={18} />Add farmer</Link>
          </div>
        )}
      </header>

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
                {s.label}
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
        Showing {shown.length} of {status === "inactive" ? rows.length - activeCount : activeCount} farmers
        {shown.length > 0 && <> &middot; {fmt(owedTotal)} RWF owed to these farmers</>}
      </p>

      {shown.length === 0 ? (
        <div className="empty-block">
          <p>{filtered ? "No farmers match your search." : "No farmers yet."}</p>
          {filtered
            ? <button className="btn btn-outline" type="button" onClick={clear}>Clear search and filters</button>
            : role !== "payment_officer" && <Link className="btn btn-primary" to="/farmers/new">Add the first farmer</Link>}
        </div>
      ) : (
        <table className="table">
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
                <td data-label="Balance">{r.is_active ? <BalancePill owed={r.balance} /> : <span className="pill pill-muted">Inactive</span>}</td>
                <td className="cell-actions">
                  {r.is_active && role === "clerk" && (
                    <Link className="row-action" to={`/deliveries/new?farmer=${r.id}`}>
                      Record delivery<span className="visually-hidden"> for {r.full_name}</span>
                    </Link>
                  )}
                  {r.is_active && role === "payment_officer" && r.balance > 0 && (
                    <Link className="row-action" to={`/payments/new?farmer=${r.id}`}>
                      Record payment<span className="visually-hidden"> for {r.full_name}</span>
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
