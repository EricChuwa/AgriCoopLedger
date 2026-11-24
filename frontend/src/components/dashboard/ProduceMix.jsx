import { useState } from "react";
import { fmt } from "../../lib/format.js";
import useApiData from "../../lib/useApiData.js";
import Donut from "./Donut.jsx";

const PERIODS = [
  ["week", "This week"],
  ["month", "This month"],
  ["last_month", "Last month"],
  ["quarter", "This quarter"],
  ["last_quarter", "Last quarter"],
];

// The produce split as a ring. The person picks the period and the server adds up that period.
export default function ProduceMix({ version }) {
  const [period, setPeriod] = useState("week");
  const { data, error } = useApiData("/reports/produce-mix", { period }, version);
  const label = PERIODS.find(([v]) => v === period)[1].toLowerCase();

  const picker = (
    <select className="period-select" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period for produce received">
      {PERIODS.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
    </select>
  );

  return (
    <Donut id="mix-title" title="Produce received" unit=" kg" action={picker}
      items={(data?.items ?? []).map((m) => ({ label: m.name, value: m.kg }))}
      centerLabel="Received" centerValue={`${fmt(data?.total_kg ?? 0)} kg`}
      emptyText={error || (data ? `No produce received ${label}.` : "Loading...")} />
  );
}
