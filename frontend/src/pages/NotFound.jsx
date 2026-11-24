import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Shown for any address that does not exist, signed in or not.
export default function NotFound() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <main className="notfound">
      <Link className="wordmark" to="/">Agri<span>Coop</span>Ledger</Link>
      <div className="notfound-sheet">
        <h1>Page not found</h1>
        <p>The address you opened does not exist, or the page has moved.</p>
        <Link className="btn btn-primary" to={user ? "/dashboard" : "/"}>
          {user ? "Go to dashboard" : "Go to the home page"}
        </Link>
      </div>
    </main>
  );
}
