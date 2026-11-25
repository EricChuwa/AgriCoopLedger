import { useEffect, useRef, useState } from "react";
import { SAMPLE_MESSAGE, isSample, plainCoopName } from "./CoopName.jsx";
import InfoTip from "./InfoTip.jsx";
import useExpandableRows from "../lib/useExpandableRows.js";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { BOTTOM_TABS, ROLE_LABEL, navForRole } from "../lib/nav.js";
import { LedgerProvider, useLedger } from "../context/LedgerContext.jsx";
import { OfflineProvider } from "../context/OfflineContext.jsx";
import { DeliveryDialogProvider, useDeliveryDialog } from "../context/DeliveryDialogContext.jsx";
import { PaymentDialogProvider, usePaymentDialog } from "../context/PaymentDialogContext.jsx";
import OfflineStatus from "./OfflineStatus.jsx";
import Icon from "./Icon.jsx";
import Wordmark from "./Wordmark.jsx";
import useTheme from "../lib/theme.js";
import "../styles/app.css";
import "../styles/polish.css";
import "../styles/responsive.css";
import "../styles/dark.css";
import "../styles/print.css";

// The frame around every signed-in page: sidebar on desktop, a drawer on phones.
function Shell() {
  const { user, logout } = useAuth();
  const { coop, status, loadError, reload, corrections } = useLedger();
  const { openDelivery } = useDeliveryDialog();
  const { openPayment } = usePaymentDialog();
  const openDialog = (kind) => (kind === "payment" ? openPayment() : openDelivery());
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const mainRef = useRef(null);
  useExpandableRows(mainRef);
  // Desktop sidebar: expanded or an icons-only rail. Remembered; first visit on a narrow window starts collapsed.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const v = localStorage.getItem("acl.sidebar");
      if (v === "collapsed") return true;
      if (v === "expanded") return false;
    } catch { /* storage unavailable */ }
    return typeof window !== "undefined" && window.innerWidth < 1100;
  });
  function toggleCollapsed() {
    setCollapsed((c) => {
      try { localStorage.setItem("acl.sidebar", c ? "expanded" : "collapsed"); } catch { /* ignore */ }
      return !c;
    });
  }
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";

  // Close the drawer when the page changes, and on Escape.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const groups = navForRole(user.role);

  const initials = user.full_name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  const waiting = user.role === "manager" ? corrections.filter((c) => c.status === "pending").length : 0;
  const tabs = BOTTOM_TABS[user.role] ?? [];

  const handleSignOut = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className={`app${dark ? " theme-dark" : ""}${collapsed ? " rail" : ""}`}>
      <a className="skip-link" href="#main">Skip to content</a>

      <header className="app-topbar">
        <Wordmark to="/dashboard" />
        <div className="app-topbar-profile">
          <Link className="app-topbar-chip" to="/account" aria-label={`${user.full_name}, my account`}>
            <span className="app-avatar" aria-hidden="true">{initials}</span>
            <span className="app-topbar-name">{user.full_name.split(" ")[0]}</span>
          </Link>
        </div>
      </header>

      {open && <div className="app-overlay" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside id="app-sidebar" className={`app-sidebar${open ? " is-open" : ""}${collapsed ? " is-collapsed" : ""}`}>
        <Wordmark to="/dashboard" className="app-brand" />

        <nav aria-label="Main">
          {groups.map((group) => (
            <div className="app-group" key={group.id}>
              {group.label && <p className="app-group-label">{group.label}</p>}
              <ul>
                {group.items.map((item) => (
                  <li key={item.to + item.label}>
                    {item.dialog ? (
                      <button type="button" className="app-link" title={item.label} onClick={() => { setOpen(false); openDialog(item.dialog); }}>
                        <Icon name={item.icon} />
                        <span>{item.label}</span>
                      </button>
                    ) : (
                      <NavLink to={item.to} end={item.end ?? false} className="app-link" title={item.label}>
                        <Icon name={item.icon} />
                        <span>{item.label}</span>
                        {item.to === "/corrections" && waiting > 0 && <span className="app-link-count" aria-label={`${waiting} waiting`}>{waiting}</span>}
                      </NavLink>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="app-user">
          <div className="app-profile">
            <NavLink to="/account" className="app-profile-link" title="My account">
              <span className="app-avatar" aria-hidden="true">{initials}</span>
              <span className="app-profile-text">
                <span className="app-profile-name">{user.full_name}</span>
                <span className="app-profile-role">{ROLE_LABEL[user.role] ?? user.role}</span>
              </span>
            </NavLink>
            {isSample(coop.name) && <InfoTip className="info-tip--side" text={SAMPLE_MESSAGE} label="About this sample data" />}
          </div>
          {isSample(coop.name) && (
            <p className="app-coop-row">
              <span>{plainCoopName(coop.name)}</span>
              <InfoTip className="info-tip--side" text={SAMPLE_MESSAGE} label="About this sample data" />
            </p>
          )}
          <button type="button" className="app-theme-row" onClick={toggle} aria-pressed={dark}>
            <Icon name={dark ? "sun" : "moon"} size={20} />
            <span>{dark ? "Light mode" : "Dark mode"}</span>
          </button>
          <div className="app-user-actions">
            <button type="button" className="app-signout" onClick={handleSignOut} title="Sign out">
              <Icon name="logout" size={18} />
              <span className="app-signout-text">Sign out</span>
            </button>
            <button type="button" className="app-collapse" onClick={toggleCollapsed}
              aria-expanded={!collapsed} aria-controls="app-sidebar"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              <Icon name={collapsed ? "expand" : "collapse"} size={18} />
            </button>
          </div>
        </div>
      </aside>

      <div className="app-body">
      <div className="app-top no-print">
        <button type="button" className="theme-toggle" onClick={toggle} aria-pressed={dark}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}>
          <span className="theme-icon" key={dark ? "sun" : "moon"}><Icon name={dark ? "sun" : "moon"} size={20} /></span>
        </button>
        {user.role === "manager" && (
          <Link className="app-bell" to="/corrections"
            aria-label={waiting > 0 ? `${waiting} correction ${waiting === 1 ? "request" : "requests"} waiting` : "Corrections"}>
            <Icon name="bell" size={20} />
            {waiting > 0 && <span className="app-bell-count" aria-hidden="true">{waiting}</span>}
          </Link>
        )}
        <Link className="app-chip" to="/account">
          <span className="app-avatar" aria-hidden="true">{initials}</span>
          <span className="app-chip-text">
            <span className="app-chip-name">{user.full_name}</span>
            <span className="app-chip-role">{ROLE_LABEL[user.role] ?? user.role}</span>
          </span>
        </Link>
      </div>

      <main className="app-main" id="main" tabIndex={-1} ref={mainRef}>
        {user.role === "clerk" && status === "ready" && <OfflineStatus />}
        {status === "loading" && <p className="empty" role="status">Loading the cooperative's records.</p>}
        {status === "error" && (
          <div className="empty-block">
            <p>{loadError || "Could not load the records."}</p>
            <button className="btn btn-primary" type="button" onClick={reload}>Try again</button>
          </div>
        )}
        {status === "ready" && <div className="page-enter" key={pathname}><Outlet /></div>}
      </main>
      </div>

      <nav className="app-tabs no-print" aria-label="Shortcuts">
        {tabs.map((t) => (t.dialog ? (
          <button key={t.to} type="button" className="app-tab" onClick={() => openDialog(t.dialog)}>
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
          </button>
        ) : (
          <NavLink key={t.to} to={t.to} end className="app-tab">
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
          </NavLink>
        )))}
        <button type="button" className="app-tab" aria-expanded={open} aria-controls="app-sidebar" onClick={() => setOpen((o) => !o)}>
          <Icon name="menu" size={22} />
          <span>Menu</span>
        </button>
      </nav>
    </div>
  );
}

export default function AppShell() {
  return (
    <LedgerProvider>
      <OfflineProvider>
        <DeliveryDialogProvider>
          <PaymentDialogProvider>
            <Shell />
          </PaymentDialogProvider>
        </DeliveryDialogProvider>
      </OfflineProvider>
    </LedgerProvider>
  );
}
