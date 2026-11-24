// The "ledger slip": a small paper summary beside a form that updates as the person types.
export function Slip({ title, children }) {
  return (
    <aside className="slip" aria-live="polite">
      <h2>{title}</h2>
      {children}
    </aside>
  );
}

export function SlipRows({ children }) {
  return <dl className="slip-rows">{children}</dl>;
}

export function SlipRow({ label, value, strong }) {
  return (
    <div className={strong ? "slip-row slip-row-strong" : "slip-row"}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
