import { useState } from "react";
import { fmt, plural } from "../../lib/format.js";
import useApiData from "../../lib/useApiData.js";

export const PERIODS = [
  ["day", "Today"],
  ["week", "This week"],
  ["month", "This month"],
  ["last_month", "Last month"],
  ["quarter", "This quarter"],
  ["last_quarter", "Last quarter"],
];

// What each tile adds up. The server adds up the chosen period (see /api/dashboard/totals).
const METRICS = {
  received: { label: "Received", icon: "scale", unit: "kg", value: (t) => fmt(t.received_kg), note: (t) => `${t.deliveries} ${plural(t.deliveries, "delivery", "deliveries")}` },
  paid: { label: "Paid", icon: "cash", unit: "RWF", value: (t) => fmt(t.paid), note: () => "to farmers" },
  farmers: { label: "Farmers", icon: "users", value: (t) => t.farmers, note: () => "delivered produce" },
  deliveries: { label: "Deliveries", icon: "package", value: (t) => t.deliveries, note: () => "recorded" },
};

// A dashboard tile with its own period menu, so the person can read the same figure for a day, a week or a quarter.
export default function PeriodStat({ metric, defaultPeriod = "day", version }) {
  const [period, setPeriod] = useState(defaultPeriod);
  const { data, error } = useApiData("/dashboard/totals", { period }, version);
  const m = METRICS[metric];
  const periodLabel = PERIODS.find(([v]) => v === period)[1];

  return (
    <div className="stat dstat period-stat">
      <div className="stat-top">
        <div className="stat-heading">
          <p className="stat-label">{m.label}</p>
          <select className="period-select stat-period" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label={`Period for ${m.label.toLowerCase()}`}>
            {PERIODS.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
          </select>
        </div>
      </div>
      <p className="stat-value" aria-live="polite">
        {data ? m.value(data) : "..."}
        {m.unit && <span className="stat-unit"> {m.unit}</span>}
      </p>
      <p className="stat-note">{error || (data ? `${m.note(data)}, ${periodLabel.toLowerCase()}` : "Loading")}</p>
    </div>
  );
}
