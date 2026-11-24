import { Link } from "react-router-dom";

export default function AccessDenied() {
  return (
    <div>
      <header className="page-head">
        <div>
          <h1>You do not have access to this page</h1>
          <p>Ask your cooperative's manager if you need it.</p>
        </div>
      </header>
      <Link className="btn btn-outline" to="/dashboard">Back to dashboard</Link>
    </div>
  );
}
