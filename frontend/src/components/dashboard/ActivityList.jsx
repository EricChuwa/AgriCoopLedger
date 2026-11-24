import { Link } from "react-router-dom";

// A short list of recent entries with a link to the full page.
// rows: [{ id, primary, secondary, amount, when }]
export default function ActivityList({ id, title, rows, emptyText, viewAllTo }) {
  return (
    <section className="dpanel" aria-labelledby={id}>
      <div className="panel-head">
        <h2 id={id}>{title}</h2>
        <Link className="panel-link" to={viewAllTo}>
          View all<span className="visually-hidden"> {title.toLowerCase()}</span>
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : (
        <ul className="activity">
          {rows.map((r) => (
            <li key={r.id}>
              <div>
                <p className="activity-primary">{r.primary}</p>
                <p className="activity-secondary">{r.secondary}</p>
              </div>
              <div className="activity-end">
                <p className="activity-amount">{r.amount}</p>
                <p className="activity-secondary">{r.when}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
