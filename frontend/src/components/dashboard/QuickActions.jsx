import { Link } from "react-router-dom";
import Icon from "../Icon.jsx";

// A row of large tap targets for what this role does most. items: [{ to, label, icon, badge? }]
export default function QuickActions({ items }) {
  return (
    <nav className="quick-tiles" aria-label="Quick actions">
      {items.map((it) => (
        <Link key={it.to + it.label} to={it.to} className="quick-tile">
          <span className="quick-tile-icon"><Icon name={it.icon} size={20} />
            {it.badge > 0 && <span className="quick-badge" aria-label={`${it.badge} waiting`}>{it.badge}</span>}
          </span>
          <span>{it.label}</span>
        </Link>
      ))}
    </nav>
  );
}
