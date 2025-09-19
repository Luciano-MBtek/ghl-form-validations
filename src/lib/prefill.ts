// src/lib/prefill.ts
export type Prefill = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  country?: string;
  note?: string;

  // Optional booking context we may want to stash as custom fields/tags
  appointmentId?: string;
  appointmentTime?: string; // ISO
  calendarId?: string;
};

const val = (sp: URLSearchParams, ...keys: string[]) => {
  for (const k of keys) {
    const v = sp.get(k);
    if (v && v.trim()) return v.trim();
  }
  return undefined;
};

export function prefillFromSearchParams(sp: URLSearchParams): Prefill {
  return {
    firstName: val(sp, "firstName", "fname", "first_name"),
    lastName: val(sp, "lastName", "lname", "last_name"),
    email: val(sp, "email"),
    phone: val(sp, "phone", "phone_number"),
    country: val(sp, "country", "countryCode"),

    note: val(sp, "note"),

    appointmentId: val(sp, "appointmentId", "apptId"),
    appointmentTime: val(sp, "appointmentTime", "startTime"),
    calendarId: val(sp, "calendarId"),
  };
}
