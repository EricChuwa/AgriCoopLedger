import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import StatementTable from "../components/StatementTable.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { fmt, formatPhone, kgText, shortDate } from "../lib/format.js";
import { fromApi } from "../lib/statement.js";
import useApiData from "../lib/useApiData.js";
import Alert from "../components/Alert.jsx";

export default function FarmerDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { farmers, version } = useLedger();
  const farmer = farmers.find((f) => String(f.id) === id);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: raw, error } = useApiData(farmer ? `/farmers/${farmer.id}/statement` : null,
    { date_from: from, date_to: to }, version);
  const statement = useMemo(() => (raw ? fromApi(raw) : null), [raw]);

  if (!farmer) {
    return (
      <div>
        <header className="page-head"><div><h1>Farmer not found</h1><p>This farmer does not exist.</p></div></header>
        <Link className="btn btn-outline" to="/farmers">Back to farmers</Link>
      </div>
    );
  }

  const role = user.role;
  const deliveredKg = raw?.delivered_kg ?? 0;
  const deliveredValue = raw?.delivered_value ?? 0;
  const paidTotal = raw?.paid_total ?? 0;
  const paymentCount = raw?.payment_count ?? 0;
  const details = [farmer.village, farmer.phone && formatPhone(farmer.phone)].filter(Boolean).join(" · ");

  return (
    <div>
      <p className="crumb"><Link to="/farmers">Farmers</Link></p>
      <header className="page-head">
        <div>
          <h1>{farmer.full_name}{!farmer.is_active && <span className="pill pill-muted title-pill">Inactive</span>}</h1>
          <p>{details || "No phone or village recorded."}</p>
          <p className="muted">National ID {farmer.national_id} &middot; member since {shortDate(farmer.member_since)}</p>
        </div>
        <div className="quick-actions no-print">
          {farmer.is_active && role === "clerk" && (
            <Link className="btn btn-primary" to={`/deliveries/new?farmer=${farmer.id}`}><Icon name="plus" size={18} />Record delivery</Link>
          )}
          {farmer.is_active && role === "payment_officer" && farmer.balance > 0 && (
            <Link className="btn btn-primary" to={`/payments/new?farmer=${farmer.id}`}><Icon name="plus" size={18} />Record payment</Link>
          )}
          <button className="btn btn-outline" type="button" onClick={() => window.print()}>Print statement</button>
          {role !== "payment_officer" && <Link className="btn btn-outline" to={`/farmers/${farmer.id}/edit`}>Edit</Link>}
        </div>
      </header>

      <div className="stats stats-three">
        <div className="stat stat-hero">
          <p className="stat-label">Owed to {farmer.full_name.split(" ")[0]}</p>
          <p className="stat-value">{fmt(farmer.balance)}<span className="stat-unit"> RWF</span></p>
          <p className="stat-note">{farmer.balance > 0 ? "delivered but not yet paid" : "paid up"}</p>
        </div>
        <div className="stat">
          <p className="stat-label">Delivered in total</p>
          <p className="stat-value">{fmt(deliveredKg)}<span className="stat-unit"> kg</span></p>
          <p className="stat-note">worth {fmt(deliveredValue)} RWF</p>
        </div>
        <div className="stat">
          <p className="stat-label">Paid in total</p>
          <p className="stat-value">{fmt(paidTotal)}<span className="stat-unit"> RWF</span></p>
          <p className="stat-note">{paymentCount} {paymentCount === 1 ? "payment" : "payments"}</p>
        </div>
      </div>

      <section className="dpanel" aria-labelledby="statement-title">
        <div className="panel-head">
          <h2 id="statement-title">Statement</h2>
          <p>Oldest first, with the balance after each entry</p>
        </div>
        <div className="filters no-print">
          <div className="filter"><label htmlFor="from">From</label><input id="from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="filter"><label htmlFor="to">To</label><input id="to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></div>
          {(from || to) && <div className="filter"><span className="filter-label">&nbsp;</span><button className="btn btn-outline" type="button" onClick={() => { setFrom(""); setTo(""); }}>Whole history</button></div>}
        </div>
        <Alert>{error}</Alert>
        {statement ? <StatementTable statement={statement} /> : !error && <p className="results" aria-live="polite">Loading</p>}
      </section>
    </div>
  );
}
