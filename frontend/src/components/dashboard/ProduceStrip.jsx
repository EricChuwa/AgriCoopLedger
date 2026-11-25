import { Link } from "react-router-dom";
import Icon from "../Icon.jsx";

// A "Produce" button at the top of every dashboard. Hovering it (or focusing it, or tapping it on a phone)
// lists every kind of produce the cooperative takes in. Only a Manager can add or change produce.
export default function ProduceStrip({ produce, canEdit }) {
  return (
    <div className="produce-menu">
      <button type="button" className="produce-btn" aria-haspopup="true" aria-describedby="produce-pop">
        <Icon name="package" size={18} />Produce
      </button>
      <div id="produce-pop" role="group" aria-label="Produce we take in" className="produce-pop">
        <p className="produce-pop-title">Produce we take in</p>
        <ul>
          {produce.length === 0 && <li className="produce-pop-empty">No produce set up yet</li>}
          {produce.map((p) => (
            <li key={p.id} className={p.is_active ? "" : "is-off"}>{p.name}{!p.is_active && <span> (not in use)</span>}</li>
          ))}
        </ul>
        {canEdit
          ? <><Link to="/produce?add=1" className="produce-pop-link"><Icon name="plus" size={16} />Add produce</Link>
              <Link to="/produce" className="produce-pop-link">Change prices</Link></>
          : <Link to="/produce" className="produce-pop-link">See prices</Link>}
      </div>
    </div>
  );
}
