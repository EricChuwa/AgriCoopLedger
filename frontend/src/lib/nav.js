// The app's navigation, in one place. A link shows only for the roles listed.
// Roles follow the SRS: the Manager oversees, the Collection Clerk records deliveries,
// the Payment Officer records payments (BR 2).
export const MANAGER = "manager";
export const CLERK = "clerk";
export const OFFICER = "payment_officer";

const ALL = [MANAGER, CLERK, OFFICER];

export const ROLE_LABEL = { manager: "Manager", clerk: "Collection Clerk", payment_officer: "Payment Officer" };

export const NAV_GROUPS = [
  {
    id: "home",
    label: null,
    items: [{ to: "/dashboard", label: "Dashboard", icon: "grid", roles: ALL }],
  },
  {
    id: "record",
    label: "Record",
    items: [
      { to: "/deliveries/new", label: "Record delivery", icon: "package", roles: [CLERK] },
      { to: "/payments/new", label: "Record payment", icon: "cash", roles: [OFFICER] },
    ],
  },
  {
    id: "browse",
    label: "Browse",
    items: [
      { to: "/farmers", label: "Farmers", icon: "users", roles: ALL },
      { to: "/deliveries", label: "Deliveries", icon: "list", roles: ALL, end: true },
      { to: "/payments", label: "Payments", icon: "receipt", roles: ALL, end: true },
      { to: "/corrections", label: "Corrections", icon: "check", roles: [MANAGER, CLERK] },
    ],
  },
  {
    id: "manage",
    label: "Manage",
    items: [
      { to: "/reports", label: "Reports", icon: "chart", roles: [MANAGER, OFFICER] },
      { to: "/produce", label: "Produce and prices", icon: "tag", roles: [MANAGER] },
      { to: "/produce", label: "Prices", icon: "tag", roles: [CLERK, OFFICER] },
      { to: "/staff", label: "Staff", icon: "user", roles: [MANAGER] },
      { to: "/audit", label: "Audit log", icon: "info", roles: [MANAGER] },
      { to: "/settings", label: "Cooperative settings", icon: "settings", roles: [MANAGER] },
    ],
  },
];

export function navForRole(role) {
  return NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => item.roles.includes(role)) }))
    .filter((group) => group.items.length > 0);
}

// The four shortcuts on the bottom bar of a phone, by role. A fifth button opens the full menu.
export const BOTTOM_TABS = {
  [MANAGER]: [
    { to: "/dashboard", label: "Home", icon: "grid" },
    { to: "/deliveries", label: "Deliveries", icon: "list" },
    { to: "/payments", label: "Payments", icon: "receipt" },
    { to: "/reports", label: "Reports", icon: "chart" },
  ],
  [CLERK]: [
    { to: "/dashboard", label: "Home", icon: "grid" },
    { to: "/deliveries/new", label: "Record", icon: "package" },
    { to: "/farmers", label: "Farmers", icon: "users" },
    { to: "/deliveries", label: "Deliveries", icon: "list" },
  ],
  [OFFICER]: [
    { to: "/dashboard", label: "Home", icon: "grid" },
    { to: "/payments/new", label: "Pay", icon: "cash" },
    { to: "/farmers", label: "Farmers", icon: "users" },
    { to: "/payments", label: "Payments", icon: "receipt" },
  ],
};
