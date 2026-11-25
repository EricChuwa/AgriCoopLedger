import { Link } from "react-router-dom";
import mark from "../assets/images/logo-mark.png";

// Logo mark beside the AgriCoopLedger name. The mark sits on a small linen tile so it reads in both themes.
export default function Wordmark({ to = "/", className = "" }) {
  return (
    <Link className={`wordmark ${className}`.trim()} to={to}>
      <img className="wordmark-mark" src={mark} alt="" width="26" height="26" />
      <span className="wordmark-text">Agri<span>Coop</span>Ledger</span>
    </Link>
  );
}
