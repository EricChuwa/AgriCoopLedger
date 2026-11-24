// The server builds a farmer's statement (GET /farmers/:id/statement). This only reshapes its answer for the
// table and the CSV.
export function fromApi(s) {
  return { rows: s.rows, opening: s.opening, balance: s.balance, voidedCount: s.voided_count, showOpening: s.show_opening };
}

// Everything in a statement as CSV rows.
export function statementCsv(statement) {
  const rows = [["Date", "Details", "Added to balance (RWF)", "Paid (RWF)", "Balance owed (RWF)"]];
  if (statement.showOpening) rows.push(["", "Opening balance", "", "", statement.opening]);
  statement.rows.forEach((r) => rows.push([r.date, r.description, r.owed || "", r.paid || "", r.balance]));
  rows.push(["", "Balance owed", "", "", statement.balance]);
  return rows;
}
