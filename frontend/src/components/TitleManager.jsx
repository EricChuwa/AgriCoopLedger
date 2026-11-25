import { useEffect } from "react";
import { matchPath, useLocation } from "react-router-dom";

const SITE = "AgriCoopLedger";

// The browser tab reads "AgriCoopLedger | Page". The home page is just "AgriCoopLedger".
// Order matters: the first pattern that matches wins, so specific paths come before /farmers/:id.
const TITLES = [
  ["/", null],
  ["/login", "Sign in"],
  ["/signup", "Create account"],
  ["/dashboard", "Dashboard"],
  ["/produce", "Produce and prices"],
  ["/farmers", "Farmers"],
  ["/farmers/new", "Add farmer"],
  ["/farmers/:id/edit", "Edit farmer"],
  ["/farmers/:id", "Farmer"],
  ["/deliveries", "Deliveries"],
  ["/deliveries/new", "Record delivery"],
  ["/payments", "Payments"],
  ["/payments/new", "Record payment"],
  ["/receipts/:kind/:id", "Receipt"],
  ["/corrections", "Corrections"],
  ["/batches", "Payment batches"],
  ["/batches/new", "New payment batch"],
  ["/batches/:id", "Payment batch"],
  ["/reports", "Reports"],
  ["/staff", "Staff"],
  ["/staff/new", "Add staff"],
  ["/audit", "Audit log"],
  ["/settings", "Cooperative settings"],
  ["/account", "My account"],
];

export function titleFor(pathname) {
  for (const [pattern, name] of TITLES) {
    if (matchPath({ path: pattern, end: true }, pathname)) return name ? `${SITE} | ${name}` : SITE;
  }
  return `${SITE} | Page not found`;
}

export default function TitleManager() {
  const { pathname } = useLocation();
  useEffect(() => { document.title = titleFor(pathname); }, [pathname]);
  return null;
}
