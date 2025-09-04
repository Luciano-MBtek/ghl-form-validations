import { config } from "./config";

const BASE = process.env.LC_BASE_URL || "https://services.leadconnectorhq.com";
const API_VERSION = process.env.LC_API_VERSION || "2021-07-28";
const TOKEN = process.env.LC_PRIVATE_TOKEN;

type UpsertArgs = {
  locationId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  tags?: string[];
  source?: string;
  customFieldsArray?: Array<{ id: string; value: string }>;
};

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function lcFetch(
  path: string,
  init: RequestInit & { locationId: string }
) {
  if (!TOKEN) throw new Error("Missing env: LC_PRIVATE_TOKEN");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${TOKEN}`,
    Version: API_VERSION,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Location-Id": init.locationId,
    ...(init.headers as any),
  };

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // ignore non-JSON
  }
  if (!res.ok) {
    const err: any = new Error(
      `LeadConnector ${res.status} ${res.statusText} on ${path}`
    );
    err.status = res.status;
    err.path = path;
    err.body = body;
    throw err;
  }
  return body;
}

export async function upsertContact(args: UpsertArgs) {
  const {
    locationId,
    firstName,
    lastName,
    email,
    phone,
    tags,
    source,
    customFieldsArray = [],
  } = args;

  const body = {
    locationId,
    firstName,
    lastName,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(tags?.length ? { tags } : {}),
    ...(source ? { source } : {}),
    ...(customFieldsArray.length ? { customFields: customFieldsArray } : {}),
  };

  if (process.env.NODE_ENV !== "production") {
    const scrubbed = {
      ...body,
      email: email ? "<redacted>" : undefined,
      phone: phone ? "<redacted>" : undefined,
    };
    console.log("[LC upsert] payload (array shape)", scrubbed);
  }

  const res = await lcFetch("/contacts/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Location-Id": locationId,
    },
    body: JSON.stringify(body),
  });

  return res;
}

export async function addContactToWorkflow(
  contactId: string,
  workflowId: string,
  locationId: string
) {
  return lcFetch(`/contacts/${contactId}/workflow/${workflowId}`, {
    method: "POST",
    locationId,
    body: JSON.stringify({}),
  });
}
