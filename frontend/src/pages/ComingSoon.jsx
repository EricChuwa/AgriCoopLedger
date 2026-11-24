import { Link } from "react-router-dom";

// Stands in for pages that are planned but not built yet, so navigation never dead-ends.
export default function ComingSoon({ title }) {
  return (
    <div>
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          <p>This page is not built yet.</p>
        </div>
      </header>
      <Link className="btn btn-outline" to="/dashboard">Back to dashboard</Link>
    </div>
  );
}
