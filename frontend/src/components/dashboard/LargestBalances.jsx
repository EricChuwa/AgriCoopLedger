import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { fmt } from "../../lib/format.js";

// The farmers the cooperative owes the most, each with a bar and a shortcut to pay.
export default function LargestBalances({ balances, compact = false }) {
  const { user } = useAuth();
  const top = balances[0]?.owed ?? 1;

  const Wrap = compact ? "div" : "section";
  return (
    <Wrap className={compact ? "balances-compact" : "dpanel"} aria-labelledby="balances-title">
      <div className="panel-head">
        <h2 id="balances-title">Largest balances owed</h2>
        {!compact && <p>Who is waiting longest for money</p>}
      </div>

      {balances.length === 0 ? (
        <p className="empty">Every farmer is paid up.</p>
      ) : (
        <ol className="balances">
          {balances.map((b) => (
            <li key={b.id}>
              <div className="balance-line">
                <span className="balance-name">{b.name}</span>
                <span className="balance-amount">{fmt(b.owed)}{compact ? "" : " RWF"}</span>
              </div>
              <div className="balance-track" aria-hidden="true">
                <span style={{ width: `${Math.max((b.owed / top) * 100, 4)}%` }} />
              </div>
              {user.role === "payment_officer" && (
                <Link className="balance-pay" to={`/payments/new?farmer=${b.id}`}>
                  Record payment<span className="visually-hidden"> for {b.name}</span>
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </Wrap>
  );
}
