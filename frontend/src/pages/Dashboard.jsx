import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import Donut from "../components/dashboard/Donut.jsx";
import LargestBalances from "../components/dashboard/LargestBalances.jsx";
import ProduceMix from "../components/dashboard/ProduceMix.jsx";
import QuickActions from "../components/dashboard/QuickActions.jsx";
import Timeline from "../components/dashboard/Timeline.jsx";
import WeeklyChart from "../components/dashboard/WeeklyChart.jsx";
import Icon from "../components/Icon.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLedger } from "../context/LedgerContext.jsx";
import { getDashboardData } from "../lib/dashboardData.js";
import useApiData from "../lib/useApiData.js";
import Alert from "../components/Alert.jsx";
import { fmt, greeting, kgText, longDate, plural } from "../lib/format.js";

function Stat({ label, value, unit, note, icon }) {
  return (
    <div className="stat dstat">
      <div className="stat-top">
        <p className="stat-label">{label}</p>
        <span className="chip-icon"><Icon name={icon} size={18} /></span>
      </div>
      <p className="stat-value">
        {value}
        {unit && <span className="stat-unit"> {unit}</span>}
      </p>
      <p className="stat-note">{note}</p>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const ledger = useLedger();
  const waitingToJoin = ledger.staff.filter((s) => s.approval === "pending").length;
  const { data: raw, error } = useApiData("/dashboard", null, ledger.version);
  const data = useMemo(() => (raw ? getDashboardData(raw) : null), [raw]);
  const now = useMemo(() => new Date(), []);
  const firstName = user.full_name.split(" ")[0];
  const role = user.role;

  useEffect(() => { document.title = "Dashboard | AgriCoopLedger"; }, []);

  if (!data) {
    return (
      <div className="dash">
        <header className="page-head"><div><h1>{greeting(now)}, {firstName}</h1><p>{ledger.coop.name} &middot; {longDate(now)}</p></div></header>
        {error ? <Alert>{error}</Alert> : <p className="results" aria-live="polite">Loading</p>}
      </div>
    );
  }

  const weekKg = data.week.reduce((s, d) => s + d.kg, 0);
  const isOfficer = role === "payment_officer";
  const isClerk = role === "clerk";

  // What each role sees first. Everything is the same palette and layout, only the content differs.
  const tiles = {
    manager: [
      { to: "/corrections", label: "Corrections", icon: "check", badge: data.pendingCorrections },
      { to: "/reports", label: "Reports", icon: "chart" },
      { to: "/staff", label: "Staff", icon: "user", badge: waitingToJoin },
      { to: "/audit", label: "Audit log", icon: "info" },
    ],
    clerk: [
      { to: "/deliveries/new", label: "Record delivery", icon: "plus" },
      { to: "/farmers/new", label: "Add farmer", icon: "users" },
      { to: "/farmers", label: "Farmers", icon: "list" },
      { to: "/deliveries", label: "Deliveries", icon: "package" },
    ],
    payment_officer: [
      { to: "/payments/new", label: "Record payment", icon: "plus" },
      { to: "/payments", label: "Payments", icon: "cash" },
      { to: "/reports", label: "Reports", icon: "chart" },
      { to: "/farmers", label: "Farmers", icon: "users" },
    ],
  }[role];

  const stats = {
    manager: [
      { label: "Received today", value: fmt(data.deliveredTodayKg), unit: "kg", icon: "scale", note: `${data.deliveriesToday} ${plural(data.deliveriesToday, "delivery", "deliveries")}` },
      { label: "Paid today", value: fmt(data.paidToday), unit: "RWF", icon: "cash", note: "to farmers" },
      { label: "Farmers this week", value: data.farmersThisWeek, icon: "users", note: "delivered produce" },
    ],
    clerk: [
      { label: "Deliveries today", value: data.deliveriesToday, icon: "package", note: "recorded so far" },
      { label: "Received this week", value: fmt(weekKg), unit: "kg", icon: "scale", note: "last 7 days" },
      { label: "Farmers this week", value: data.farmersThisWeek, icon: "users", note: "delivered produce" },
    ],
    payment_officer: [
      { label: "Paid today", value: fmt(data.paidToday), unit: "RWF", icon: "cash", note: "to farmers" },
      { label: "Farmers owed", value: data.farmersOwed, icon: "users", note: "with a balance" },
      { label: "Received today", value: fmt(data.deliveredTodayKg), unit: "kg", icon: "scale", note: `${data.deliveriesToday} ${plural(data.deliveriesToday, "delivery", "deliveries")}` },
    ],
  }[role];

  const attention = [];
  if (data.pendingCorrections > 0) attention.push({ to: "/corrections", text: `${data.pendingCorrections} correction ${plural(data.pendingCorrections, "request", "requests")} to decide` });
  if (waitingToJoin > 0) attention.push({ to: "/staff", text: `${waitingToJoin} ${plural(waitingToJoin, "person", "people")} asking to join` });

  return (
    <div className="dash">
      <header className="page-head">
        <div>
          <h1>{greeting(now)}, {firstName}</h1>
          <p>{ledger.coop.name} &middot; {longDate(now)}</p>
        </div>
      </header>

      <div className="dgrid">
        <div className="dcol dcol-left">
          {isClerk ? (
            <section className="dcard-hero" aria-labelledby="hero-title">
              <div className="stat-top">
                <p className="stat-label" id="hero-title">Received today</p>
                <span className="chip-icon"><Icon name="scale" size={18} /></span>
              </div>
              <p className="stat-value">{fmt(data.deliveredTodayKg)}<span className="stat-unit"> kg</span></p>
              <p className="stat-note">{data.deliveriesToday} {plural(data.deliveriesToday, "delivery", "deliveries")} today</p>
              <div className="hero-sub"><span>This week</span><strong>{fmt(weekKg)} kg</strong></div>
            </section>
          ) : (
            <section className="dcard-hero" aria-labelledby="owed-title">
              <div className="stat-top">
                <p className="stat-label" id="owed-title">Owed to farmers</p>
                <span className="chip-icon"><Icon name="wallet" size={18} /></span>
              </div>
              <p className="stat-value">{fmt(data.totalOwed)}<span className="stat-unit"> RWF</span></p>
              <p className="stat-note">across {data.farmersOwed} {plural(data.farmersOwed, "farmer", "farmers")}</p>
              <LargestBalances balances={data.largestBalances} compact />
            </section>
          )}

          <QuickActions items={tiles} />

          {role === "manager" && (
            <section className="dpanel" aria-labelledby="attn-title">
              <div className="panel-head"><h2 id="attn-title">Needs your attention</h2></div>
              {attention.length === 0 ? <p className="empty">Nothing is waiting for you.</p> : (
                <ul className="attn">
                  {attention.map((a) => (
                    <li key={a.to}><Link to={a.to}>{a.text}<Icon name="check" size={16} /></Link></li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {isOfficer && (
            <section className="dpanel" aria-labelledby="today-title">
              <div className="panel-head"><h2 id="today-title">Today</h2></div>
              <dl className="mini-list">
                <div><dt>Paid out</dt><dd>{fmt(data.paidToday)} RWF</dd></div>
                <div><dt>Received</dt><dd>{fmt(data.deliveredTodayKg)} kg</dd></div>
                <div><dt>Still owed</dt><dd>{fmt(data.totalOwed)} RWF</dd></div>
              </dl>
            </section>
          )}
          {isClerk && (
            <section className="dpanel" aria-labelledby="week-title">
              <div className="panel-head"><h2 id="week-title">This week</h2></div>
              <dl className="mini-list">
                <div><dt>Received</dt><dd>{fmt(weekKg)} kg</dd></div>
                <div><dt>Farmers who delivered</dt><dd>{data.farmersThisWeek}</dd></div>
                <div><dt>Deliveries today</dt><dd>{data.deliveriesToday}</dd></div>
              </dl>
            </section>
          )}
        </div>

        <div className="dcol dcol-mid">
          <div className="dstats">
            {stats.map((st) => <Stat key={st.label} {...st} />)}
          </div>

          <WeeklyChart week={data.week} />

          {isOfficer ? (
            <section className="dpanel" aria-labelledby="recent-payments">
              <div className="panel-head">
                <h2 id="recent-payments">Recent payments</h2>
                <Link className="btn btn-outline btn-small" to="/payments">View all<span className="visually-hidden"> payments</span></Link>
              </div>
              {data.recentPayments.length === 0 ? <p className="empty">No payments yet.</p> : (
                <table className="table table-numbers table-flat">
                  <thead><tr>
                    <th scope="col">Farmer</th><th scope="col" className="num">Amount</th><th scope="col" className="num">Date</th>
                  </tr></thead>
                  <tbody>
                    {data.recentPayments.map((p) => (
                      <tr key={p.id}>
                        <th scope="row" className="cell-main">{p.farmer}<span className="cell-sub">{p.methodLabel}</span></th>
                        <td data-label="Amount" className="num num-strong">{fmt(p.amount)} RWF</td>
                        <td data-label="Date" className="num">{p.when}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ) : (
            <section className="dpanel" aria-labelledby="recent-deliveries">
              <div className="panel-head">
                <h2 id="recent-deliveries">Recent deliveries</h2>
                <Link className="btn btn-outline btn-small" to="/deliveries">View all<span className="visually-hidden"> deliveries</span></Link>
              </div>
              {data.recentDeliveries.length === 0 ? <p className="empty">No deliveries yet.</p> : (
                <table className="table table-numbers table-flat">
                  <thead><tr>
                    <th scope="col">Farmer</th><th scope="col" className="num">Weight</th>
                    <th scope="col" className="num">Value</th><th scope="col" className="num">Date</th>
                  </tr></thead>
                  <tbody>
                    {data.recentDeliveries.map((d) => (
                      <tr key={d.id}>
                        <th scope="row" className="cell-main">{d.farmer}<span className="cell-sub">{d.produce}</span></th>
                        <td data-label="Weight" className="num">{kgText(d.kg)}</td>
                        <td data-label="Value" className="num num-strong">{fmt(d.value)} RWF</td>
                        <td data-label="Date" className="num">{d.when}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </div>

        <div className="dcol dcol-right">
          {isOfficer ? (
            <Donut id="mix-title" title="Who is owed most" unit=" RWF"
              items={data.largestBalances.map((b) => ({ label: b.name, value: b.owed }))}
              centerLabel="Top 5 owed" centerValue={fmt(data.largestBalances.reduce((s, b) => s + b.owed, 0))}
              emptyText="No balances are owed." />
          ) : (
            <ProduceMix version={ledger.version} />
          )}
          <Timeline id="activity-title" title="Recent activity" groups={data.activity}
            emptyText="Nothing recorded yet." viewAllTo={isOfficer ? "/payments" : "/deliveries"}
            viewAllLabel="View all" />
        </div>
      </div>
    </div>
  );
}
