// src/lib/leadconnector.ts
const BASE = process.env.LC_BASE_URL!;
const VERSION = process.env.LC_API_VERSION!;
const TOKEN = process.env.LC_PRIVATE_TOKEN!;

type AnyObj = Record<string, any>;

// --- add near top, after imports ---
export type LCContactIdish =
  | { id?: string; contactId?: string }
  | null
  | undefined;
export const getContactId = (d: LCContactIdish): string | undefined =>
  (d && (d as any).id) || (d && (d as any).contactId) || undefined;

const dbg = (...args: any[]) => {
  // production cleanup: silent debug helper
};

export { dbg };

async function lcFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      Version: VERSION,
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let details: any = null;
    try {
      details = await res.json();
    } catch {}
    const err: any = new Error(
      `LeadConnector ${res.status} ${res.statusText} on ${path}`
    );
    err.status = res.status;
    err.path = path;
    err.details = details;
    throw err;
  }

  const json = await res.json().catch(() => ({}));
  return (json?.data ?? json) as T;
}

/** Convert national digits + ISO country to E.164 for LC matching */
export function toE164FromNational(
  digits?: string,
  country?: string
): string | undefined {
  if (!digits) return undefined;
  const d = String(digits).replace(/[^\d+]/g, "");
  const iso = (country || "").toUpperCase();
  if (d.startsWith("+")) return d;
  if (iso === "US" || iso === "CA") return `+1${d}`;
  return `+${d}`;
}

// Preferred if enabled on the account
export async function lcUpsertContact(payload: AnyObj) {
  return lcFetch<any>("/contacts/upsert", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function lcCreateContact(payload: AnyObj) {
  return lcFetch<any>("/contacts/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function lcUpdateContact(contactId: string, payload: AnyObj) {
  return lcFetch<any>(`/contacts/${contactId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function addContactToWorkflow(
  contactId: string,
  workflowId: string,
  locationId: string
) {
  return lcFetch<any>(`/contacts/${contactId}/workflow/${workflowId}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function lcUpdateCustomFields(
  contactId: string,
  locationId: string,
  customFields: any[],
  tags?: string[]
) {
  const payload: any = { locationId, customFields };
  if (tags && tags.length) payload.tags = tags;
  return lcUpdateContact(contactId, payload);
}

// add near other helpers
export async function lcGetContactsByQuery(query: string, locationId: string) {
  // GHL "Get Contacts" supports ?query= (email/phone/name) + location filter
  const params = new URLSearchParams({
    locationId,
    query,
    limit: "1",
  });
  return lcFetch<any>(`/contacts/?${params.toString()}`, {}); // expect {contacts:[{id,...}]}
}

// tiny extractor used by route
export function pickContactId(raw: any): string | undefined {
  return (
    raw?.contact?.id ??
    raw?.id ??
    raw?.data?.id ??
    raw?.contactId ??
    raw?.contact?.contactId ??
    raw?.data?.contact?.id
  );
}

// Booking/Calendar types
export type FreeSlot = {
  date: string; // YYYY-MM-DD
  times: string[]; // ['13:30', '14:00', ...]
};

export type AvailabilityResponse = {
  slots: FreeSlot[];
};

export type AppointmentPayload = {
  calendarId: string;
  locationId?: string;
  meetingLocationId?: string;
  serviceId?: string;
  contactId: string;
  startTime: string; // ISO string
  timezone: string;
  title?: string;
  description?: string;
  // Add other required fields as needed
};

export type AppointmentResponse = {
  id: string;
  calendarId: string;
  contactId: string;
  startTime: string;
  timezone: string;
};

// Booking/Calendar API helpers
const CAL_VER = process.env.LC_CALENDAR_API_VERSION || "2021-07-28";

export async function lcGetFreeSlots(args: {
  calendarId: string;
  startDateMs: number; // epoch ms
  endDateMs: number; // epoch ms
  timezone?: string;
}): Promise<{
  slots?: string[];
  _dates_?: Record<string, { slots: string[] }>;
  traceId?: string;
  [key: string]: any;
}> {
  const { calendarId, startDateMs, endDateMs, timezone } = args;

  // Validate arguments
  if (!calendarId) {
    throw new Error("calendarId is required");
  }
  if (!startDateMs || !endDateMs) {
    throw new Error("startDateMs and endDateMs are required");
  }

  // Validate date range (<= 31 days)
  const rangeMs = endDateMs - startDateMs;
  const maxRangeMs = 31 * 24 * 60 * 60 * 1000; // 31 days in ms
  if (rangeMs > maxRangeMs) {
    throw new Error(
      `Date range must be <= 31 days. Got ${Math.round(
        rangeMs / (24 * 60 * 60 * 1000)
      )} days`
    );
  }

  const url = `${BASE}/calendars/${encodeURIComponent(calendarId)}/free-slots`;
  const locationId = process.env.LC_LOCATION_ID;
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    Version: CAL_VER,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(locationId && { "Location-Id": locationId }),
  };

  // debug removed

  const params = new URLSearchParams({
    startDate: startDateMs.toString(),
    endDate: endDateMs.toString(),
    ...(timezone ? { timezone } : {}),
  });

  try {
    const response = await fetch(`${url}?${params.toString()}`, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      let errorData: any = null;
      try {
        errorData = await response.json();
      } catch {}

      console.error("[lcGetFreeSlots] error", {
        status: response.status,
        data: errorData,
        traceId: errorData?.traceId,
        calendarId,
        startDateMs,
        endDateMs,
        timezone,
      });

      const error = new Error(
        `LeadConnector free-slots failed: ${response.status} ${response.statusText}`
      );
      (error as any).status = response.status;
      (error as any).traceId = errorData?.traceId;
      throw error;
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    if (error.status) {
      // Already processed above
      throw error;
    }

    console.error("[lcGetFreeSlots] network error", {
      message: error.message,
      calendarId,
      startDateMs,
      endDateMs,
      timezone,
    });

    throw new Error(`Network error calling LeadConnector: ${error.message}`);
  }
}

export async function lcCreateAppointment(args: {
  locationId: string;
  calendarId: string;
  contactId: string;
  startTimeIso: string; // ISO with TZ
  endTimeIso: string; // ISO with TZ
  timezone: string;
  title?: string;
  notes?: string;
  source?: string;
  appointmentStatus?: string;
  ignoreFreeSlotValidation?: boolean;
}): Promise<any> {
  const {
    locationId,
    calendarId,
    contactId,
    startTimeIso,
    endTimeIso,
    timezone,
    title,
    notes,
    source,
    appointmentStatus,
    ignoreFreeSlotValidation,
  } = args;

  const version = process.env.LC_API_VERSION || "2021-07-28";
  // debug removed

  const url = `${BASE}/calendars/events/appointments`;
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    Version: version,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // Use ISO strings with offsets (not epoch milliseconds)
  const payload: any = {
    calendarId,
    locationId,
    contactId,
    title: title ?? "Booking",
    startTime: startTimeIso, // ISO with offset
    endTime: endTimeIso, // ISO with offset
    // Required/expected meeting location fields:
    meetingLocationType: "custom",
    meetingLocationId: "custom_0",
    overrideLocationConfig: true,
    // Reasonable defaults:
    appointmentStatus: "confirmed",
    toNotify: true,
    ignoreDateRange: false,
    // Optional notes/source passthrough:
    ...(notes ? { address: notes } : {}),
    ...(source ? { source } : {}),
  };

  // Debug log with scrubbed payload
  // debug removed

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      let bodyJson: any = null;
      try {
        bodyJson = JSON.parse(bodyText);
      } catch {}

      console.error("[LC appt] ERROR", {
        status: response.status,
        statusText: response.statusText,
        body: bodyJson || bodyText,
      });

      // Check if this is a 422 with date-related errors and we haven't retried yet
      if (response.status === 422) {
        const errorText = (bodyJson?.message || bodyText || "").toLowerCase();
        if (
          errorText.includes("starttime") ||
          errorText.includes("endtime") ||
          errorText.includes("invalid date")
        ) {
          // debug removed

          // Retry with epoch milliseconds
          const isoToMs = (iso: string) => new Date(iso).getTime();
          const payloadMs = {
            ...payload,
            startTime: isoToMs(startTimeIso),
            endTime: isoToMs(endTimeIso),
          };

          // debug removed

          const retryResponse = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(payloadMs),
            cache: "no-store",
          });

          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            return retryData;
          }

          // If retry also failed, parse the retry error
          const retryBodyText = await retryResponse.text().catch(() => "");
          let retryBodyJson: any = null;
          try {
            retryBodyJson = JSON.parse(retryBodyText);
          } catch {}

          console.error("[LC appt] retry ERROR", {
            status: retryResponse.status,
            statusText: retryResponse.statusText,
            body: retryBodyJson || retryBodyText,
          });

          const retryError = new Error(
            `LeadConnector appointment creation failed: ${retryResponse.status} ${retryResponse.statusText}`
          );
          (retryError as any).status = retryResponse.status;
          (retryError as any).body = retryBodyJson || retryBodyText;
          (retryError as any).retried = true;
          throw retryError;
        }
      }

      const error = new Error(
        `LeadConnector appointment creation failed: ${response.status} ${response.statusText}`
      );
      (error as any).status = response.status;
      (error as any).body = bodyJson || bodyText;
      throw error;
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    if (error.status) {
      // Already processed above
      throw error;
    }

    console.error("[LC appt] network error", {
      message: error.message,
      locationId,
      calendarId,
      contactId,
    });

    throw new Error(`Network error calling LeadConnector: ${error.message}`);
  }
}
