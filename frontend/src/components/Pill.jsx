import { fmt } from "../lib/format.js";

// Owed balances are cayenne outlined, paid up is lime, matching the ledger look.
// The wording carries the meaning, so the colour is never the only signal.
export default function BalancePill({ owed }) {
  return owed > 0
    ? <span className="pill pill-owed">{fmt(owed)} RWF owed</span>
    : <span className="pill pill-paid">Paid up</span>;
}
