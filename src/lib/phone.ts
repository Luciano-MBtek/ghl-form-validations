// src/lib/phone.ts
const COUNTRY_TO_CC: Record<string, string> = {
  US: "1",
  CA: "1",
  GB: "44",
  AU: "61",
  // extend as needed
};

export function onlyDigits(s: string | undefined): string {
  return (s || "").replace(/\D+/g, "");
}

/**
 * Convert a possibly E.164 string (+1305...), or raw ("1305..."), to national digits
 * given an ISO country (US, CA, GB...). For NANP (US/CA), strip leading '1' if present.
 */
export function toNationalDigits(
  input: string | undefined,
  country?: string
): string {
  const digits = onlyDigits(input);
  if (!digits) return "";

  const cc = COUNTRY_TO_CC[(country || "").toUpperCase()];
  if (!cc) return digits; // Unknown country → show raw digits

  // If starts with country calling code, strip it.
  if (digits.startsWith(cc)) {
    return digits.slice(cc.length);
  }
  return digits;
}

/**
 * Build E.164 string from national digits + country. Returns "+<cc><national>" or "".
 */
export function toE164(
  nationalDigits: string | undefined,
  country?: string
): string {
  const nd = onlyDigits(nationalDigits);
  if (!nd) return "";
  const cc = COUNTRY_TO_CC[(country || "").toUpperCase()];
  if (!cc) return ""; // Unknown country → let validator fail gracefully
  return `+${cc}${nd}`;
}
