import { fmt } from "../../lib/format.js";

const W = 420;
const H = 240;
const PAD = { top: 24, right: 8, bottom: 30, left: 40 };

// Round the top of the scale up to a tidy number so gridlines land on round values.
function niceMax(v) {
  if (v <= 0) return 100;
  const step = v <= 200 ? 50 : v <= 500 ? 100 : 250;
  return Math.ceil(v / step) * step;
}

// Kilograms delivered per day for the last seven days, as inline SVG bars.
export default function WeeklyChart({ week }) {
  const total = week.reduce((s, d) => s + d.kg, 0);
  const max = niceMax(Math.max(...week.map((d) => d.kg)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / week.length;
  const barW = slot * 0.62;
  const y = (v) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);

  return (
    <section className="dpanel" aria-labelledby="chart-title">
      <div className="panel-head">
        <h2 id="chart-title">Produce received this week</h2>
        <p>{fmt(total)} kg in 7 days</p>
      </div>

      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="chart-svg-title chart-svg-desc">
        <title id="chart-svg-title">Kilograms of produce received each day, last 7 days</title>
        <desc id="chart-svg-desc">
          {week.map((d) => `${d.label}: ${d.kg} kilograms`).join(". ")}.
        </desc>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="chart-axis">{fmt(t)}</text>
          </g>
        ))}

        {week.map((d, i) => {
          const x = PAD.left + slot * i + (slot - barW) / 2;
          const h = Math.max(plotH - (y(d.kg) - PAD.top), d.kg > 0 ? 2 : 0);
          return (
            <g key={d.label}>
              <rect x={x} y={PAD.top + plotH - h} width={barW} height={h} rx="3"
                className={d.isToday ? "chart-bar chart-bar-today" : "chart-bar"} />
              <text x={x + barW / 2} y={PAD.top + plotH - h - 6} textAnchor="middle" className="chart-value">
                {d.kg}
              </text>
              <text x={x + barW / 2} y={H - 10} textAnchor="middle"
                className={d.isToday ? "chart-axis chart-axis-today" : "chart-axis"}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      <table className="visually-hidden">
        <caption>Kilograms received per day</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">Kilograms</th></tr></thead>
        <tbody>
          {week.map((d) => (
            <tr key={d.label}><th scope="row">{d.label}</th><td>{d.kg}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
