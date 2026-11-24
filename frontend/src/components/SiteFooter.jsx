import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const REPO_URL = "https://github.com/EricChuwa/AgriCoopLedger";

export default function SiteFooter() {
  const { user } = useAuth();

  return (
    <footer className="lp-dark lp-footer">
      <div className="lp-wrap">
        <div className="lp-footer-inner">
          <div className="lp-footer-grid">
            <div>
              <Link className="wordmark" to="/">Agri<span>Coop</span>Ledger</Link>
              <p>Delivery and payment records for agricultural cooperatives in Rwanda.</p>
            </div>

            <nav aria-label="Product">
              <h3>Product</h3>
              <ul>
                <li><a href="#how-it-works">How it works</a></li>
                <li><a href="#roles">Manager and clerk roles</a></li>
                <li>
                  {user
                    ? <Link to="/dashboard">Open dashboard</Link>
                    : <Link to="/signup">Join or register your cooperative</Link>}
                </li>
              </ul>
            </nav>

            <div>
              <h3>About the project</h3>
              <p>
                A software engineering course project at African Leadership University, Kigali.
              </p>
              <ul>
                <li><a href={REPO_URL} target="_blank" rel="noopener noreferrer">Source code on GitHub</a></li>
              </ul>
            </div>
          </div>

          <div className="lp-footer-bottom">
            <p>&copy; {new Date().getFullYear()} AgriCoopLedger. All rights reserved.</p>
            <p>Designed and built by Eric Chuwa.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
