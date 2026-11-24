// Builds a CSV file in the browser and downloads it. Cells that start with = + - @ are
// prefixed with an apostrophe so a spreadsheet never runs them as a formula.
const cell = (value) => {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCsv(rows) {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}

export function downloadCsv(filename, rows) {
  const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
