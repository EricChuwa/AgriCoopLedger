import { fmt, shortDate } from "../lib/format.js";

// A farmer's statement as a ledger: what was delivered (owed), what was paid, and the running balance.
export default function StatementTable({ statement }) {
  const { rows, opening, balance, voidedCount, showOpening } = statement;

  if (rows.length === 0 && !showOpening) return <p className="empty">No deliveries or payments yet.</p>;

  return (
    <>
      <div className="table-scroll"><table className="table table-numbers statement">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Details</th>
            <th scope="col" className="num">Added to balance</th>
            <th scope="col" className="num">Paid</th>
            <th scope="col" className="num">Balance owed</th>
          </tr>
        </thead>
        <tbody>
          {showOpening && (
            <tr>
              <th scope="row" className="cell-main" />
              <td data-label="Details">Opening balance (everything before this period)</td>
              <td className="num" /><td className="num" />
              <td data-label="Balance owed" className="num num-strong">{fmt(opening)} RWF</td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="cell-main">{shortDate(r.date)}</th>
              <td data-label="Details">{r.description}</td>
              <td data-label="Added to balance" className="num">{r.owed ? `${fmt(r.owed)} RWF` : ""}</td>
              <td data-label="Paid" className="num">{r.paid ? `${fmt(r.paid)} RWF` : ""}</td>
              <td data-label="Balance owed" className="num num-strong">{fmt(r.balance)} RWF</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={4}>Balance owed at the end</th>
            <td className="num num-strong">{fmt(balance)} RWF</td>
          </tr>
        </tfoot>
      </table></div>
      {voidedCount > 0 && (
        <p className="results">{voidedCount} voided {voidedCount === 1 ? "entry is" : "entries are"} left out of this statement.</p>
      )}
    </>
  );
}
