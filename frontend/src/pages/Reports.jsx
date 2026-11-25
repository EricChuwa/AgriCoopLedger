import { useEffect, useMemo, useState } from "react";
import StatementTable from "../components/StatementTable.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { downloadCsv } from "../lib/csv.js";
import { fmt, isoDaysAgo, kgText, longDate, plural, shortDate, todayIso } from "../lib/format.js";
import { fromApi, statementCsv } from "../lib/statement.js";
import useApiData from "../lib/useApiData.js";
import Alert from "../components/Alert.jsx";

const VIEWS = [
  { id: "summary", label: "Period summary" },
  { id: "statement", label: "Farmer statement" },
  { id: "outstanding", label: "Outstanding balances" },
];

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const span = (from, to) => (from && to ? `${shortDate(from)} to ${shortDate(to)}` : from ? `From ${shortDate(from)}` : to ? `Up to ${shortDate(to)}` : "All time");

// Reports for the Manager and the Payment Officer (FR 6.1 to 6.4). Print, or choose Save as PDF in
// the print window; CSV opens in a spreadsheet.
export default function Reports() {
  const { coop, farmers, produce, version } = useLedger();
  const [view, setView] = useState("summary");
  const [from, setFrom] = useState(isoDaysAgo(6));
  const [to, setTo] = useState(todayIso());
  const [farmerId, setFarmerId] = useState("");
  const [produceId, setProduceId] = useState("all");
  const today = todayIso();
  const period = span(from, to);

  useEffect(() => { document.title = "Reports | AgriCoopLedger"; }, []);

  // The server adds the period up. Only the report on screen is asked for.
  const sum = useApiData(view === "summary" ? "/reports/summary" : null,
    { date_from: from, date_to: to, produce_id: produceId === "all" ? "" : produceId }, version);
  const summary = useMemo(() => {
    const r = sum.data;
    if (!r) return { deliveries: 0, kg: 0, delivered: 0, paid: 0, byProduce: [], byFarmer: [] };
    return {
      deliveries: r.deliveries, kg: r.kg, delivered: r.delivered, paid: r.paid,
      byProduce: r.by_produce,
      byFarmer: r.by_farmer.map((f) => ({ id: f.id, name: f.name, kg: f.kg, delivered: f.delivered, paid: f.paid, owedNow: f.owed_now })),
    };
  }, [sum.data]);

  const outstanding = useMemo(
    () => farmers.filter((f) => f.balance > 0).sort((a, b) => b.balance - a.balance),
    [farmers]);
  const outstandingTotal = outstanding.reduce((s, f) => s + f.balance, 0);

  const farmer = farmers.find((f) => String(f.id) === farmerId);
  const stm = useApiData(view === "statement" && farmer ? `/farmers/${farmer.id}/statement` : null,
    { date_from: from, date_to: to }, version);
  const statement = useMemo(() => (stm.data ? fromApi(stm.data) : null), [stm.data]);

  const noPrint = (view === "statement" && !statement) || (view === "summary" && !sum.data);

  const exportCsv = () => {
    if (view === "summary") {
      downloadCsv(`summary-${today}.csv`, [
        ["Cooperative", coop.name], ["Report", "Period summary"], ["Period", period], ["Produced on", today], [],
        ["Produce and grade", "Deliveries", "Weight (kg)", "Value (RWF)"],
        ...summary.byProduce.map((r) => [r.name, r.count, r.kg, r.value]),
        ["Total", summary.deliveries, summary.kg, summary.delivered], [],
        ["Farmer", "Weight (kg)", "Delivered (RWF)", "Paid (RWF)", "Balance owed now (RWF)"],
        ...summary.byFarmer.map((r) => [r.name, r.kg, r.delivered, r.paid, r.owedNow]),
      ]);
    } else if (view === "statement") {
      downloadCsv(`statement-${slug(farmer.full_name)}-${today}.csv`, [
        ["Cooperative", coop.name], ["Report", "Farmer statement"], ["Farmer", farmer.full_name], ["Period", period], ["Produced on", today], [],
        ...statementCsv(statement),
      ]);
    } else {
      downloadCsv(`outstanding-balances-${today}.csv`, [
        ["Cooperative", coop.name], ["Report", "Outstanding balances"], ["Produced on", today], [],
        ["Farmer", "Phone", "Balance owed (RWF)"],
        ...outstanding.map((f) => [f.full_name, f.phone, f.balance]),
        ["Total", "", outstandingTotal],
      ]);
    }
  };

  const title = view === "summary" ? `Period summary, ${period}`
    : view === "statement" ? `Statement for ${farmer?.full_name ?? ""}, ${period}` : "Outstanding balances";

  return (
    <div className="report">
      <header className="page-head no-print">
        <div>
          <h1>Reports</h1>
          <p>Summaries for the cooperative, statements to give to farmers, and who is still owed.</p>
        </div>
        <div className="quick-actions">
          <button className="btn btn-outline" type="button" onClick={() => window.print()} disabled={noPrint}>Print or save as PDF</button>
          <button className="btn btn-primary" type="button" onClick={exportCsv} disabled={noPrint}>Download CSV</button>
        </div>
      </header>

      <div className="filters no-print">
        <div className="filter">
          <span className="filter-label" id="view-label">Report</span>
          <div className="seg" role="group" aria-labelledby="view-label">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}>{v.label}</button>
            ))}
          </div>
        </div>
        {view !== "outstanding" && (
          <>
            <div className="filter"><label htmlFor="from">From</label><input id="from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="filter"><label htmlFor="to">To</label><input id="to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></div>
          </>
        )}
        {view === "summary" && (
          <div className="filter">
            <label htmlFor="produce">Produce</label>
            <select id="produce" value={produceId} onChange={(e) => setProduceId(e.target.value)}>
              <option value="all">All produce</option>
              {produce.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        {view === "statement" && (
          <div className="filter filter-grow">
            <label htmlFor="farmer">Farmer</label>
            <select id="farmer" value={farmerId} onChange={(e) => setFarmerId(e.target.value)}>
              <option value="">Choose a farmer</option>
              {farmers.map((f) => <option key={f.id} value={f.id}>{f.full_name}{f.is_active ? "" : " (inactive)"}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="print-only print-head">
        <div>
          <p className="print-coop">{coop.name}</p>
          <p className="print-title">{title}</p>
        </div>
        <p className="print-meta">Printed {longDate(new Date())}</p>
      </div>

      {view === "summary" && sum.error && <Alert>{sum.error}</Alert>}
      {view === "summary" && !sum.data && !sum.error && <p className="results" aria-live="polite">Loading</p>}
      {view === "summary" && sum.data && (
        <>
          <div className="stats stats-four">
            <div className="stat"><p className="stat-label">Deliveries</p><p className="stat-value">{summary.deliveries}</p><p className="stat-note">{kgText(summary.kg)} received</p></div>
            <div className="stat"><p className="stat-label">Value delivered</p><p className="stat-value">{fmt(summary.delivered)}<span className="stat-unit"> RWF</span></p><p className="stat-note">added to balances</p></div>
            <div className="stat"><p className="stat-label">Paid out</p><p className="stat-value">{fmt(summary.paid)}<span className="stat-unit"> RWF</span></p><p className="stat-note">to farmers</p></div>
            <div className="stat stat-hero"><p className="stat-label">Change in amount owed</p><p className="stat-value">{summary.delivered - summary.paid >= 0 ? "+" : "-"}{fmt(Math.abs(summary.delivered - summary.paid))}<span className="stat-unit"> RWF</span></p><p className="stat-note">delivered minus paid</p></div>
          </div>

          <section className="dpanel report-block" aria-labelledby="by-produce">
            <div className="panel-head"><h2 id="by-produce">By produce and grade</h2><p>{period}</p></div>
            {summary.byProduce.length === 0 ? <p className="empty">No deliveries in this period.</p> : (
              <div className="table-scroll"><table className="table table-numbers">
                <thead><tr><th scope="col">Produce</th><th scope="col" className="num">Deliveries</th><th scope="col" className="num">Weight</th><th scope="col" className="num">Value</th></tr></thead>
                <tbody>
                  {summary.byProduce.map((r) => (
                    <tr key={r.key}>
                      <th scope="row" className="cell-main">{r.name}</th>
                      <td data-label="Deliveries" className="num">{r.count}</td>
                      <td data-label="Weight" className="num">{kgText(r.kg)}</td>
                      <td data-label="Value" className="num num-strong">{fmt(r.value)} RWF</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </section>

          <section className="dpanel report-block" aria-labelledby="by-farmer">
            <div className="panel-head"><h2 id="by-farmer">By farmer</h2><p>{summary.byFarmer.length} {plural(summary.byFarmer.length, "farmer", "farmers")} with activity</p></div>
            {summary.byFarmer.length === 0 ? <p className="empty">No activity in this period.</p> : (
              <div className="table-scroll"><table className="table table-numbers">
                <thead><tr><th scope="col">Farmer</th><th scope="col" className="num">Weight</th><th scope="col" className="num">Delivered</th><th scope="col" className="num">Paid</th><th scope="col" className="num">Owed now</th></tr></thead>
                <tbody>
                  {summary.byFarmer.map((r) => (
                    <tr key={r.id}>
                      <th scope="row" className="cell-main">{r.name}</th>
                      <td data-label="Weight" className="num">{kgText(r.kg)}</td>
                      <td data-label="Delivered" className="num">{fmt(r.delivered)} RWF</td>
                      <td data-label="Paid" className="num">{fmt(r.paid)} RWF</td>
                      <td data-label="Owed now" className="num num-strong">{fmt(r.owedNow)} RWF</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </section>
        </>
      )}

      {view === "statement" && (!farmer ? (
        <div className="empty-block"><p>Choose a farmer to see their statement.</p></div>
      ) : (
        <section className="dpanel report-block" aria-labelledby="statement-heading">
          <div className="panel-head"><h2 id="statement-heading">Statement for {farmer.full_name}</h2><p>{period}, oldest first</p></div>
          {stm.error && <Alert>{stm.error}</Alert>}
          {statement ? <StatementTable statement={statement} /> : !stm.error && <p className="results" aria-live="polite">Loading</p>}
        </section>
      ))}

      {view === "outstanding" && (
        <section className="dpanel report-block" aria-labelledby="outstanding-heading">
          <div className="panel-head">
            <h2 id="outstanding-heading">Outstanding balances</h2>
            <p>{outstanding.length} {plural(outstanding.length, "farmer is", "farmers are")} owed {fmt(outstandingTotal)} RWF in total</p>
          </div>
          {outstanding.length === 0 ? <p className="empty">Every farmer is paid up.</p> : (
            <div className="table-scroll"><table className="table table-numbers">
              <thead><tr><th scope="col">Farmer</th><th scope="col">Phone</th><th scope="col" className="num">Owed</th></tr></thead>
              <tbody>
                {outstanding.map((f) => (
                  <tr key={f.id}>
                    <th scope="row" className="cell-main">{f.full_name}</th>
                    <td data-label="Phone">{f.phone || "Not given"}</td>
                    <td data-label="Owed" className="num num-strong">{fmt(f.balance)} RWF</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th scope="row" colSpan={2}>Total owed</th><td className="num num-strong">{fmt(outstandingTotal)} RWF</td></tr></tfoot>
            </table></div>
          )}
        </section>
      )}
    </div>
  );
}
