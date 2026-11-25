import { Link } from "react-router-dom";
import Icon from "../Icon.jsx";
import { useDeliveryDialog } from "../../context/DeliveryDialogContext.jsx";
import { usePaymentDialog } from "../../context/PaymentDialogContext.jsx";

// A row of large tap targets for what this role does most. items: [{ to, label, icon, badge? }]
export default function QuickActions({ items }) {
  const { openDelivery } = useDeliveryDialog();
  const { openPayment } = usePaymentDialog();
  const inner = (it) => (
    <>
      <span className="quick-tile-icon"><Icon name={it.icon} size={20} />
        {it.badge > 0 && <span className="quick-badge" aria-label={`${it.badge} waiting`}>{it.badge}</span>}
      </span>
      <span>{it.label}</span>
    </>
  );
  return (
    <nav className="quick-tiles" aria-label="Quick actions">
      {items.map((it) => (it.dialog
        ? <button key={it.to + it.label} type="button" className="quick-tile" onClick={() => (it.dialog === "payment" ? openPayment() : openDelivery())}>{inner(it)}</button>
        : <Link key={it.to + it.label} to={it.to} className="quick-tile">{inner(it)}</Link>))}
    </nav>
  );
}
