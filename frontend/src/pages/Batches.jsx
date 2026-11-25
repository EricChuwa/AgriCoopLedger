import { useEffect } from "react";
import { Link } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import Icon from "../components/Icon.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { BATCH_LABEL } from "../lib/batch.js";
import { fmt, plural, dateTime } from "../lib/format.js";
import useApiData from "../lib/useApiData.js";

// Payment batches: the Payment Officer plans who to pay, a Manager approves, then payments are recorded against it.
export default function Batches() {
  const { user } = useAuth();
  const { version } = useLedger();
  const { data, loading, error } = useApiData("/batches", null, version);
  const rows = data ?? [];
  useEffect(() => { document.title = "Payment batches | AgriCoopLedger"; }, []);

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Payment batches</h1>
          <p>A group of farmers to pay together. A Manager approves it before any money is paid.</p>
        </div>
        {user.role === "payment_officer" && (
          <div className="quick-actions">
            <Link className="btn btn-primary" to="/batches/new"><Icon name="plus" size={18} />New batch</Link>
          </div>
        )}
      </header>
      <Alert>{error}</Alert>
      {!loading && rows.length === 0 ? (
        <div className="empty-block"><p>No payment batches yet.</p></div>
      ) : (
        <div className="table-scroll"><table className="table">
          <thead>
            <tr>
              <th scope="col">Batch</th>
              <th scope="col">Made by</th>
              <th scope="col">Farmers</th>
              <th scope="col">Planned</th>
              <th scope="col">Paid</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <th scope="row" className="cell-main">
                  <Link className="cell-name cell-link" to={`/batches/${b.id}`}>{b.note || b.number}</Link>
                  <span className="cell-sub">{b.note ? `${b.number}, ` : ""}{dateTime(b.created_at)}</span>
                </th>
                <td data-label="Made by">{b.created_by}</td>
                <td data-label="Farmers">{b.farmers} {plural(b.farmers, "farmer", "farmers")}</td>
                <td data-label="Planned">{fmt(b.planned)} RWF</td>
                <td data-label="Paid">{fmt(b.paid)} RWF</td>
                <td data-label="Status"><span className={`pill ${b.status === "paid" ? "pill-paid" : "pill-muted"}`}>{BATCH_LABEL[b.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
