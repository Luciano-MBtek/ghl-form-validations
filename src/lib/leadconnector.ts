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
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[LC]", ...args);
  }
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
  return lcFetch<any>(`/contacts/?${params.toString()}`); // expect {contacts:[{id,...}]}
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
