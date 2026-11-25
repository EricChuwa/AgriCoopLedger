import { Link } from "react-router-dom";
import Wordmark from "./Wordmark.jsx";
import portrait from "../assets/images/farmer-in-bean-field.webp";

export default function BrandPanel() {
  return (
    <aside className="brand">
      <img className="brand-photo" src={portrait} alt="" width="900" height="1200" />
      <Wordmark />

      <div className="pitch">
        <h2>One ledger for every delivery and payment.</h2>
        <p className="lede">
          Record what each farmer delivers, see what is owed, and keep a payment history your
          members can trust.
        </p>
      </div>

    </aside>
  );
}
