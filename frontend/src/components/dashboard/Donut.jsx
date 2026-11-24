import { fmt } from "../../lib/format.js";

// Segment colours come from the palette (lime, teal, cayenne) and the text colour at two strengths.
const COLORS = ["var(--lime)", "var(--teal)", "var(--cayenne)", "var(--ink)", "var(--line)"];
const OPACITY = [1, 1, 1, 0.7, 0.45];
// Text colour that stays readable on each segment colour in either theme.
const ON = ["var(--evergreen)", "var(--on-teal)", "#fff", "var(--bg)", "var(--bg)"];

// A ring that shows how a total splits. items: [{ label, value }]. unit goes after each value in the list.
export default function Donut({ id, title, items, centerLabel, centerValue, unit = "", action = null, emptyText = "Nothing to show yet." }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const R = 46;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <section className="dpanel donut-panel" aria-labelledby={id}>
      <div className="panel-head"><h2 id={id}>{title}</h2>{action}</div>
      {total === 0 ? <p className="empty">{emptyText}</p> : (
        <>
          <div className="donut">
            <svg viewBox="0 0 120 120" role="img" aria-label={`${title}: ${items.map((i) => `${i.label} ${fmt(i.value)}${unit}`).join(", ")}`}>
              <circle cx="60" cy="60" r={R} className="donut-track" />
              {items.map((it, i) => {
                const len = (it.value / total) * C;
                const seg = (
                  <circle key={it.label} cx="60" cy="60" r={R} className="donut-seg" stroke={COLORS[i % COLORS.length]}
                    strokeOpacity={OPACITY[i % OPACITY.length]} strokeDasharray={`${Math.max(len - 1.5, 0)} ${C}`}
                    strokeDashoffset={-offset} style={{ "--len": len }} />
                );
                offset += len;
                return seg;
              })}
            </svg>
            <div className="donut-center">
              <span>{centerLabel}</span>
              <strong>{centerValue}</strong>
            </div>
          </div>
          <ul className="donut-legend">
            {items.map((it, i) => (
              <li key={it.label}>
                <span className="donut-pct" style={{ background: COLORS[i % COLORS.length], color: ON[i % ON.length] }}>
                  {Math.round((it.value / total) * 100)}%
                </span>
                <span className="donut-name">{it.label}</span>
                <span className="donut-val">{fmt(it.value)}{unit}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
