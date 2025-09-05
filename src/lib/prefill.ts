// src/lib/prefill.ts
export type Prefill = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string; // national format (no +country)
  country?: "US" | "CA" | string;
  calendar?: string;
  apptStart?: string;
  apptTz?: string;
};

export function parsePrefillFromSearchParams(sp: URLSearchParams): Prefill {
  const t = (s?: string | null) => (s ?? "").trim() || undefined;

  let country = t(sp.get("country"))?.toUpperCase();
  if (country && country.length > 2) {
    // Normalize common country names to ISO2 if GHL sends full names
    if (country.includes("UNITED STATES")) country = "US";
    if (country.includes("UNITED STATES OF AMERICA")) country = "US";
    if (country.includes("CANADA")) country = "CA";
  }

  // Strip everything except digits; trim leading 1 for NANP countries
  const rawPhone = t(sp.get("phone"))?.replace(/[^\d]/g, "");
  let phone = rawPhone;
  if (phone && (country === "US" || country === "CA")) {
    if (phone.length === 11 && phone.startsWith("1")) phone = phone.slice(1);
  }

  return {
    firstName: t(sp.get("firstName")),
    lastName: t(sp.get("lastName")),
    email: t(sp.get("email")),
    phone,
    country,
    calendar: t(sp.get("calendar")),
    apptStart: t(sp.get("apptStart")),
    apptTz: t(sp.get("apptTz")),
  };
}
