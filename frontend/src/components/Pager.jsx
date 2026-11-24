// Previous and Next for a list the server sends one page at a time.
export default function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav className="pager no-print" aria-label="Pages">
      <button className="btn btn-outline" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <p aria-live="polite">Showing {first} to {last} of {total} &middot; page {page} of {pages}</p>
      <button className="btn btn-outline" type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </nav>
  );
}
