import farmer from "../assets/images/farmer-in-bean-field.webp";

function TileIcon({ name }) {
  const paths = {
    lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
    sum: <><path d="M6 5h12l-6 7 6 7H6" /></>,
    coin: <><circle cx="12" cy="12" r="8" /><path d="M12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" /></>,
    page: <><path d="M7 3h8l4 4v14H7z" /><path d="M15 3v4h4M10 12h6M10 16h6" /></>,
  };
  return (
    <span className="lp-tile-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
    </span>
  );
}

export default function FeatureTiles() {
  return (
    <div className="lp-bento">
      <article className="lp-tile lp-tile--tall">
        <TileIcon name="lock" />
        <h3>Nothing is ever deleted</h3>
        <p>A mistake is corrected or voided by a Manager, with a reason. The original entry stays, and a tamper-evident audit log keeps who did what, and when.</p>
      </article>

      <article className="lp-tile lp-tile--wide">
        <TileIcon name="sum" />
        <h3>Balances worked out, not typed</h3>
        <p>Each amount is calculated the moment a delivery is recorded, and deliveries and payments sit together in one running balance per farmer.</p>
      </article>

      <article className="lp-tile lp-tile--lime">
        <TileIcon name="coin" />
        <h3>Never overpay</h3>
        <p>A payment can't be more than the balance owed.</p>
      </article>

      <figure className="lp-tile lp-tile--photo">
        <img src={farmer} width="900" height="1200" loading="lazy"
          alt="A farmer stands in a bean field holding a handful of pods." />
        <figcaption>Every farmer, one running balance.</figcaption>
      </figure>

      <article className="lp-tile lp-tile--wide lp-tile--soft">
        <TileIcon name="page" />
        <h3>Receipts and statements</h3>
        <p>Print a receipt for each delivery or payment, and a full statement for any farmer, with a running balance down the page.</p>
      </article>
    </div>
  );
}
