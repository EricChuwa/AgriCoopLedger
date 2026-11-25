import { METHOD_LABEL, fmt, kgText, shortDate, whenLabel } from "./format.js";

// Reshapes the server's dashboard answer (GET /dashboard) for the screen. All the adding up happens on the server.
const weekdayOf = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short" });

const initialsOf = (name) => name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

// Deliveries and payments mixed into one list, newest first, grouped by day.
function buildActivity(d) {
  const rows = [
    ...d.recent_deliveries.map((x) => ({ id: `d${x.id}`, kind: "delivery", date: x.delivery_date, at: x.created_at, who: x.recorded_by,
      what: `recorded ${kgText(x.weight_kg)} of ${x.produce_name.toLowerCase()} from ${x.farmer_name}` })),
    ...d.recent_payments.map((x) => ({ id: `p${x.id}`, kind: "payment", date: x.payment_date, at: x.created_at, who: x.recorded_by,
      what: `paid ${fmt(x.amount)} RWF to ${x.farmer_name}` })),
  ].sort((a, b) => (a.date === b.date ? (a.at < b.at ? 1 : -1) : a.date < b.date ? 1 : -1)).slice(0, 7);
  const groups = [];
  for (const r of rows) {
    const label = whenLabel(r.date) || shortDate(r.date);
    let g = groups.find((x) => x.label === label);
    if (!g) { g = { label, rows: [] }; groups.push(g); }
    g.rows.push({ ...r, initials: initialsOf(r.who) });
  }
  return groups;
}

export function getDashboardData(d) {
  return {
    totalOwed: d.total_owed,
    farmersOwed: d.farmers_owed,
    deliveredTodayKg: d.delivered_today_kg,
    deliveriesToday: d.deliveries_today,
    paidToday: d.paid_today,
    farmersThisWeek: d.farmers_this_week,
    pendingCorrections: d.pending_corrections,
    farmersWaiting: d.farmers_waiting ?? 0,
    batchesWaiting: d.batches_waiting ?? 0,
    week: d.week.map((w, i) => ({ label: i === d.week.length - 1 ? "Today" : weekdayOf(w.date), kg: w.kg, isToday: i === d.week.length - 1 })),
    produceWeek: d.produce_week ?? [],
    largestBalances: d.largest_balances,
    activity: buildActivity(d),
    recentDeliveries: d.recent_deliveries.map((x) => ({
      id: x.id, farmer: x.farmer_name, produce: `${x.produce_name} (grade ${x.grade})`, kg: x.weight_kg, value: x.value,
      when: whenLabel(x.delivery_date) || shortDate(x.delivery_date),
    })),
    recentPayments: d.recent_payments.map((x) => ({
      id: x.id, farmer: x.farmer_name, methodLabel: METHOD_LABEL[x.method] ?? "Paid", amount: x.amount,
      when: whenLabel(x.payment_date) || shortDate(x.payment_date),
    })),
  };
}
