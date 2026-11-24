import { Link } from "react-router-dom";

// Recent entries grouped by day, newest first. groups: [{ label, rows: [{ id, who, what, time }] }]
export default function Timeline({ id, title, groups, emptyText, viewAllTo, viewAllLabel }) {
  return (
    <section className="dpanel" aria-labelledby={id}>
      <div className="panel-head">
        <h2 id={id}>{title}</h2>
        {viewAllTo && <Link className="panel-link" to={viewAllTo}>{viewAllLabel}</Link>}
      </div>
      {groups.length === 0 ? <p className="empty">{emptyText}</p> : groups.map((g) => (
        <div key={g.label} className="tl-group">
          <h3 className="tl-day">{g.label}</h3>
          <ul className="tl">
            {g.rows.map((r) => (
              <li key={r.id}>
                <span className={`tl-dot tl-dot--${r.kind}`} aria-hidden="true">{r.initials}</span>
                <p><strong>{r.who}</strong> {r.what}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
