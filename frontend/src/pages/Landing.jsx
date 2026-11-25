import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import LedgerDemo from "../components/LedgerDemo.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import FeatureTiles from "../components/FeatureTiles.jsx";
import Icon from "../components/Icon.jsx";
import Wordmark from "../components/Wordmark.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import useTheme from "../lib/theme.js";
import "../styles/dark.css";
import useApiData from "../lib/useApiData.js";
import weighing from "../assets/images/weighing-at-the-shed.webp";
import receipt from "../assets/images/receipt-handover.webp";
import "../styles/landing.css";

const ON_PAPER = [
  "Weekly total, added up by hand on Friday",
  "A farmer says the weight was higher and all you have is a pencil mark",
  "Payments get written in a separate book",
  "Finding one farmer's history means flipping through months of pages",
];

const IN_APP = [
  "The value is worked out as soon as the delivery is recorded",
  "Each entry shows who made it and when",
  "What a farmer is owed and what they've been paid sit in one balance",
  "Tap a farmer to see everything they've delivered and been paid",
];

const STEPS = [
  {
    title: "Record each delivery",
    body: "Pick the farmer and enter the kilograms. The amount is worked out from your price per kg.",
  },
  {
    title: "Record each payment",
    body: "Enter what you paid and how, in cash or by mobile money. The balance updates straight away.",
  },
  {
    title: "Share a statement",
    body: "Open any farmer to see every delivery and payment with a running balance, ready to print.",
  },
];

const nf = (n) => n.toLocaleString("en-US");

// Live totals from the system. A dash shows while they load, and the strip is left out if they cannot be fetched.
function factsFrom(stats) {
  const v = (x) => (stats ? nf(x) : "\u2013");
  return [
    { n: v(stats?.cooperatives), label: stats?.cooperatives === 1 ? "Cooperative" : "Cooperatives" },
    { n: v(stats?.farmers), label: stats?.farmers === 1 ? "Farmer on record" : "Farmers on record" },
    { n: v(stats?.deliveries), label: stats?.deliveries === 1 ? "Delivery recorded" : "Deliveries recorded" },
    { n: v(stats?.total_kg), label: "Kilograms weighed" },
  ];
}

const NAV = [
  { href: "#try", label: "Try it" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#roles", label: "Roles" },
];

const MANAGER = [
  "Set produce types and prices",
  "Correct or void an entry, with a reason",
  "Add staff, approve join requests, reset passwords",
  "Read reports and the audit log",
  "Never records a delivery or payment",
];

const CLERK = [
  "Record deliveries and print receipts",
  "Add and edit farmers",
  "Ask a Manager to correct a delivery",
  "See farmer balances and statements",
];

const OFFICER = [
  "Record payments and print receipts",
  "Cannot pay more than the balance owed",
  "See reports and farmer statements",
  "National ID numbers are hidden",
];

function Actions({ onDark = false, showBuy = true }) {
  const { user } = useAuth();
  const mod = onDark ? " lp-btn--dark" : "";

  if (user) {
    return <Link className={`lp-btn${mod}`} to="/dashboard">Open dashboard</Link>;
  }
  return (
    <>
      <Link className={`lp-btn${mod}`} to="/signup">Join or register your cooperative</Link>
      {showBuy && <Link className="lp-link" to="/buy">Buy</Link>}
    </>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  // Arriving from another page with #how-it-works or #roles: scroll once the sections exist.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return undefined;
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView(), 150);
    return () => clearTimeout(t);
  }, [hash]);
  const { data: stats, error: statsError } = useApiData("/public/stats");
  const facts = factsFrom(stats);

  // The page behind the sections follows the theme too, so overscroll never flashes the other colour.
  useEffect(() => {
    document.body.style.background = dark ? "#001a1a" : "";
    return () => { document.body.style.background = ""; };
  }, [dark]);

  return (
    <div className={`lp-page${dark ? " theme-dark" : ""}`}>
      <div className="lp-nav-bar">
        <div className="lp-wrap">
          <header className="lp-nav">
            <Wordmark />

            <nav className="lp-nav-links" aria-label="Sections">
              {NAV.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
            </nav>

            <div className="lp-nav-end">
              <button type="button" className="theme-toggle lp-theme" onClick={toggle} aria-pressed={dark}
                aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
                title={dark ? "Light mode" : "Dark mode"}>
                <span className="theme-icon" key={dark ? "sun" : "moon"}>
                  <Icon name={dark ? "sun" : "moon"} size={20} />
                </span>
              </button>
              {user ? (
                <Link className="lp-btn lp-btn--small" to="/dashboard">Open dashboard</Link>
              ) : (
                <Link className="lp-btn lp-btn--small" to="/login">Sign in</Link>
              )}
            </div>
          </header>
        </div>
      </div>

      <section className="lp-dark lp-hero">
        <img className="lp-hero-bg" src={weighing} width="1600" height="900" fetchpriority="high"
          alt="A collection clerk in a green apron weighs a sack of maize on a hanging scale while a farmer watches." />

        <div className="lp-wrap lp-hero-body">
          <div className="lp-hero-copy">
            <h1>Know what every farmer is owed.</h1>
            <p className="lp-lede">
              AgriCoopLedger records each delivery and payment at your cooperative, so every
              farmer's balance is always up to date.
            </p>
            <div className="lp-cta">
              <Actions onDark />
            </div>
          </div>

          <a className="lp-float" href="#how-it-works">
            <img src={receipt} width="1200" height="900" alt="" />
            <div>
              <strong>A receipt for every entry</strong>
              <span>Printed on A4, ready to hand over.</span>
            </div>
            <svg className="lp-float-go" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
          </a>
        </div>

        {!(statsError && !stats) && (
          <div className="lp-facts">
            <div className="lp-wrap">
              <dl aria-label="Totals across all cooperatives">
                {facts.map((f) => (
                  <div key={f.label}>
                    <dt>{f.n}</dt>
                    <dd>{f.label}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </section>

      <main>
        <section className="lp-section" id="features" aria-labelledby="features-title">
          <div className="lp-wrap">
            <div className="lp-intro">
              <div>
                <p className="lp-tag">What it does</p>
                <h2 id="features-title">Keep the books honest, one delivery at a time.</h2>
              </div>
              <p className="lp-intro-text">
                Built for cooperatives that buy produce from many smallholders and pay them later.
                Every kilogram and every franc has a record, and every balance can be checked.
              </p>
            </div>

            <FeatureTiles />
          </div>
        </section>

        <section className="lp-section lp-section--paper" id="try" aria-labelledby="try-title">
          <div className="lp-wrap lp-try">
            <div>
              <p className="lp-tag">Try it</p>
              <h2 id="try-title">Record a delivery.</h2>
              <p className="lp-lede lp-lede--ink">
                Change the kilograms and see the amount worked out straight away, the way it works for every farmer at your cooperative.
              </p>
            </div>
            <LedgerDemo />
          </div>
        </section>

        <section className="lp-section" aria-labelledby="problem-title">
          <div className="lp-wrap">
            <div className="lp-intro">
              <div>
                <p className="lp-tag">Why not paper</p>
                <h2 id="problem-title">Where the paper book lets you down</h2>
              </div>
            </div>

            <div className="lp-compare">
              <div className="lp-paper">
                <h3>The paper book</h3>
                <ul>
                  <li>
                    <span>
                      {ON_PAPER[0]}: <s className="lp-struck">66,500</s> <strong>67,500</strong>
                    </span>
                  </li>
                  {ON_PAPER.slice(1).map((t) => <li key={t}><span>{t}</span></li>)}
                </ul>
              </div>

              <div className="lp-clean">
                <h3>In AgriCoopLedger</h3>
                <ul>
                  {IN_APP.map((t) => <li key={t}><span>{t}</span></li>)}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section lp-section--paper" id="how-it-works" aria-labelledby="how-title">
          <div className="lp-wrap">
            <div className="lp-intro">
              <div>
                <p className="lp-tag">How it works</p>
                <h2 id="how-title">Three steps, every collection day.</h2>
              </div>
            </div>

            <div className="lp-how">
            <figure className="lp-photo lp-photo--wide">
              <img src={receipt} width="1200" height="900" loading="lazy"
                alt="A clerk hands a printed receipt to a farmer across the counter at a collection point." />
            </figure>

            <ol className="lp-steps">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="lp-step-num" aria-hidden="true">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
            </div>
          </div>
        </section>

        <section className="lp-section" id="roles" aria-labelledby="roles-title">
          <div className="lp-wrap">
            <div className="lp-intro">
              <div>
                <p className="lp-tag">Roles</p>
                <h2 id="roles-title">Three roles, clear limits.</h2>
              </div>
            </div>

            <div className="lp-roles">
              <article className="lp-role lp-role--manager">
                <h3>Manager</h3>
                <p>Runs the cooperative's ledger.</p>
                <ul>{MANAGER.map((t) => <li key={t}><span>{t}</span></li>)}</ul>
              </article>
              <article className="lp-role lp-role--clerk">
                <h3>Collection Clerk</h3>
                <p>Works at the collection point.</p>
                <ul>{CLERK.map((t) => <li key={t}><span>{t}</span></li>)}</ul>
              </article>
              <article className="lp-role lp-role--officer">
                <h3>Payment Officer</h3>
                <p>Pays the farmers.</p>
                <ul>{OFFICER.map((t) => <li key={t}><span>{t}</span></li>)}</ul>
              </article>
            </div>

            <p className="lp-note">
              Only the Manager can correct or void an entry, and nobody records the entry they approve, so every change has a second pair of eyes.
            </p>
          </div>
        </section>
      </main>

      <section className="lp-dark lp-end" aria-labelledby="closing-title">
        <div className="lp-wrap">
          <h2 id="closing-title">Register your cooperative.</h2>
          <p className="lp-lede">
            A new cooperative name makes you its Manager. If your cooperative is already registered, its Manager approves your request first.
          </p>
          <div className="lp-cta">
            <Actions onDark showBuy={false} />
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
