import { Link, useParams } from "react-router-dom";
import { useLedger } from "../context/LedgerContext.jsx";
import useApiData from "../lib/useApiData.js";
import { METHOD_LABEL, dateTime, fmt, kgText, shortDate } from "../lib/format.js";

// A printable receipt for one delivery or payment (FR 4.2, FR 5.4). "Print" lets the browser save it as a PDF.
export default function Receipt() {
  const { kind, id } = useParams();
  const { coop, balanceOf } = useLedger();
  const valid = (kind === "delivery" || kind === "payment") && /^\d+$/.test(id);
  const { data: entry, loading } = useApiData(valid ? `/${kind === "delivery" ? "deliveries" : "payments"}/${id}` : null);

  if (loading && !entry) return <p className="results" aria-live="polite">Loading</p>;

  if (!entry || !valid) {
    return (
      <div>
        <header className="page-head"><div><h1>Receipt not found</h1><p>This receipt does not exist.</p></div></header>
        <Link className="btn btn-outline" to="/dashboard">Back to dashboard</Link>
      </div>
    );
  }

  const isDelivery = kind === "delivery";
  const rows = isDelivery
    ? [
      ["Date", shortDate(entry.delivery_date)],
      ["Farmer", entry.farmer_name],
      ["Produce", `${entry.produce_name}, grade ${entry.grade}`],
      ["Weight", kgText(entry.weight_kg)],
      ["Price per kg", `${fmt(entry.price_per_kg)} RWF`],
      ["Value", `${fmt(entry.value)} RWF`],
      ["Recorded by", entry.recorded_by],
    ]
    : [
      ["Date", shortDate(entry.payment_date)],
      ["Farmer", entry.farmer_name],
      ["Amount paid", `${fmt(entry.amount)} RWF`],
      ["Paid by", METHOD_LABEL[entry.method]],
      ...(entry.reference ? [["Reference", entry.reference]] : []),
      ["Recorded by", entry.recorded_by],
    ];

  return (
    <div className="report">
      <header className="page-head no-print">
        <div>
          <h1>{isDelivery ? "Delivery receipt" : "Payment receipt"}</h1>
          <p>Give a copy to the farmer. Print it, or choose Save as PDF in the print window.</p>
        </div>
        <div className="quick-actions">
          <button className="btn btn-primary" type="button" onClick={() => window.print()}>Print or save as PDF</button>
          <Link className="btn btn-outline" to={isDelivery ? "/deliveries" : "/payments"}>Back to list</Link>
        </div>
      </header>

      <article className="dpanel receipt" aria-label="Receipt">
        <header className="receipt-head">
          <div>
            <p className="print-coop">{coop.name}</p>
            <p className="receipt-kind">{isDelivery ? "Delivery receipt" : "Payment receipt"}</p>
          </div>
          <div className="receipt-no"><span>Receipt no.</span><strong>{entry.receipt_no}</strong></div>
        </header>
        {entry.voided && <p className="alert" role="note">VOIDED by {entry.voided.by} on {dateTime(entry.voided.at)}. Reason: {entry.voided.reason}</p>}
        <dl className="slip-rows details">
          {rows.map(([label, value]) => (
            <div className="slip-row" key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
        <div className="receipt-total"><span>Owed to farmer now</span><strong>{fmt(balanceOf(entry.farmer_id))} RWF</strong></div>
        <p className="receipt-foot">Recorded {dateTime(entry.created_at)}</p>
      </article>
    </div>
  );
}
