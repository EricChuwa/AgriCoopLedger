// Rwandan mobile numbers: 07X XXX XXX (MTN 78 and 79, Airtel 72 and 73)
const PHONE = /^7[2389][0-9]{7}$/;

export function phoneError(value) {
  const digits = value.replace(/[\s-]/g, "").replace(/^(\+?250|0)/, "");
  return PHONE.test(digits) ? "" : "Enter a Rwandan mobile number, for example 788 123 456.";
}

export const textError = (message, min = 2) => (value) =>
  value.trim().length < min ? message : "";

// Same shapes the server accepts. A person's name has letters, spaces, dots, apostrophes and dashes only.
const PERSON = /^[\p{L}][\p{L} .'\u2019-]*$/u;
const PLACE = /^[\p{L}\p{N}][\p{L}\p{N} .,'\u2019()/&-]*$/u;
export const personNameError = (message = "Enter the full name.") => (value) => {
  const v = value.trim();
  if (v.length < 2) return message;
  return PERSON.test(v) ? "" : "Use letters, spaces, dots, apostrophes and dashes only.";
};
export const placeNameError = (message = "Enter a name.", required = true) => (value) => {
  const v = value.trim();
  if (v === "") return required ? message : "";
  if (v.length < 2) return message;
  return PLACE.test(v) ? "" : "Use letters, digits, spaces and . , ' ( ) / & - only.";
};

// "0788 123 456", "788123456" or "+250788123456" -> "+250788123456"
export function normalizePhone(value) {
  const digits = value.replace(/[\s-]/g, "").replace(/^(\+?250|0)/, "");
  return `+250${digits}`;
}

// A username: 3 to 30 letters, digits, dot, dash or underscore. Optional fields pass an empty string.
export function usernameError(value, required = false) {
  const v = value.trim();
  if (v === "") return required ? "Enter a username." : "";
  return /^[A-Za-z0-9._-]{3,30}$/.test(v) ? "" : "Use 3 to 30 letters, digits, dot, dash or underscore, with no spaces.";
}

// A Rwandan national ID has 16 digits. Spaces are ignored.
export const nationalIdDigits = (value) => value.replace(/[\s-]/g, "");

export function nationalIdError(value) {
  const digits = nationalIdDigits(value);
  if (digits === "") return "Enter the farmer's 16 digit national ID number.";
  if (!/^[0-9]+$/.test(digits)) return "Use digits only.";
  if (digits.length !== 16) return `A national ID has 16 digits. You entered ${digits.length}.`;
  return "";
}

// Weight in kg: positive, at most 3 decimals, at most 100,000 kg (same limits as the server).
export function kgError(value) {
  const text = String(value).replace(/[,\s]/g, "");
  if (text === "") return "Enter the weight in kilograms.";
  const n = Number(text);
  if (!Number.isFinite(n)) return "Enter a number, for example 120 or 12.5.";
  if (n <= 0) return "Weight must be more than 0.";
  if (!/^[0-9]{1,6}(\.[0-9]{1,3})?$/.test(text)) return "Use at most 3 decimal places, for example 12.345.";
  if (n > 100000) return "That is more than 100,000 kg. Check the weight.";
  return "";
}
