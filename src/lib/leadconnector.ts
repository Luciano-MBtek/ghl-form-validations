import { config } from "./config";

const BASE = process.env.LC_BASE_URL || "https://services.leadconnectorhq.com";
const API_VERSION = process.env.LC_API_VERSION || "2021-07-28";
const TOKEN = process.env.LC_PRIVATE_TOKEN;

type UpsertPayload = {
  locationId: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  tags?: string[];
  source?: string;
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

export async function upsertContact(payload: UpsertPayload) {
  const { locationId, ...contact } = payload;
  return lcFetch(`/contacts/`, {
    method: "POST",
    locationId,
    body: JSON.stringify({ ...contact, locationId }),
  });
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
