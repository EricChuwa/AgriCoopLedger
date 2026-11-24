// Small display helpers shared by pages.

// Whole Rwandan francs with thousands separators: 181300 -> "181,300".
export function fmt(n) {
  return Math.round(n).toLocaleString("en-US");
}

export function plural(n, one, many) {
  return n === 1 ? one : many;
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function longDate(now = new Date()) {
  return now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function weekdayShort(date) {
  return date.toLocaleDateString("en-GB", { weekday: "short" });
}

export const METHOD_LABEL = { cash: "Cash", momo: "Mobile money" };
export const GRADES = ["A", "B", "C"];

// "12.5" -> 12.5, "1,200" -> 1200, "" or text -> NaN. Commas and spaces are ignored.
export function parseNumber(text) {
  const clean = String(text).replace(/[,\s]/g, "");
  return clean === "" ? NaN : Number(clean);
}

// Today in Kigali as "YYYY-MM-DD" (the server uses the same day).
export function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kigali" });
}

// "2026-11-04" -> a Date at local midday, so the day never shifts with the time zone.
const parseIso = (iso) => new Date(`${iso}T12:00:00`);

// "Wed 4 Nov 2026"
export function shortDate(iso) {
  return parseIso(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

// "Today", "Yesterday", or "" for anything older.
export function whenLabel(iso) {
  const today = todayIso();
  if (iso === today) return "Today";
  const y = parseIso(today);
  y.setDate(y.getDate() - 1);
  return iso === y.toLocaleDateString("en-CA") ? "Yesterday" : "";
}

// ISO date n days before today.
export function isoDaysAgo(n) {
  const d = parseIso(todayIso());
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA");
}

// "2026-11-04T09:12:00Z" -> "4 Nov 2026, 11:12" in Kigali time.
export function dateTime(value) {
  if (!value) return "";
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
  return d.toLocaleString("en-GB", { timeZone: "Africa/Kigali", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// "+250788410231" -> "0788 410 231"
export function formatPhone(phone) {
  const m = /^\+250(\d{3})(\d{3})(\d{3})$/.exec(phone || "");
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : phone || "";
}

// Weight as shown on screen: 12.5 -> "12.5 kg", 150 -> "150 kg".
export const kgText = (kg) => `${Number(kg.toFixed(3))} kg`;
