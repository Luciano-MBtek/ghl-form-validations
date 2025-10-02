// src/lib/zerobounce.ts
import { getCache, setCache } from "./cache";

type ZBResponse = {
  address?: string;
  status?: string; // valid | invalid | catch-all | unknown | spamtrap | abuse | do_not_mail
  sub_status?: string; // disposable | role_based | mailbox_not_found | no_dns_entries | ...
  did_you_mean?: string | null;
  mx_found?: string | boolean;
  free_email?: boolean;
  processed_at?: string;
};

const REGION = (process.env.ZB_API_REGION ?? "").toLowerCase().trim();
const ZB_BASE =
  REGION === "us"
    ? "https://api-us.zerobounce.net"
    : REGION === "eu"
    ? "https://api-eu.zerobounce.net"
    : "https://api.zerobounce.net";

const ZB_API = `${ZB_BASE}/v2/validate`;

const REASON_MAP: Record<string, string> = {
  disposable: "Disposable email addresses aren't allowed.",
  toxic: "This email appears risky or toxic.",
  role_based: "Role-based addresses (info@, sales@, support@) aren't allowed.",
  mailbox_not_found: "Mailbox doesn't exist.",
  mailbox_full: "Mailbox is full.",
  no_dns_entries: "Domain has no DNS records.",
  possible_trap: "Possible spam trap.",
  antispam_system: "Mail server is using an anti-spam system.",
  greylisted: "Mailbox is temporarily refusing messages.",
  mail_server_temporary_error: "Mail server returned a temporary error.",
  mail_server_did_not_respond: "Mail server didn't respond.",
  timeout_exceeded: "Verification timed out.",
  failed_smtp_connection: "Could not connect to mail server.",
  failed_syntax_check: "Email format looks invalid.",
  accept_all: "This domain accepts all emails (risky).",
  processing_error: "We couldn't verify this email right now.",
};

function friendlyReason(status?: string, sub?: string, did?: string | null) {
  if (status === "valid") return undefined;
  if (did) return `Did you mean ${did}?`;
  if (sub && REASON_MAP[sub]) return REASON_MAP[sub];

  switch (status) {
    case "invalid":
      return "This email is undeliverable.";
    case "catch-all":
      return "This domain accepts all emails; please use a different address.";
    case "unknown":
      return "We couldn't verify this email right now.";
    case "do_not_mail":
      return "We can't accept this email address.";
    case "spamtrap":
      return "This email looks like a spam trap.";
    case "abuse":
      return "This email has abuse reports.";
    default:
      return "Invalid email address.";
  }
}

export type ZBCheck = {
  valid: boolean;
  status?: string;
  sub_status?: string;
  reason?: string;
  score?: number;
  suggestion?: string;
};

export async function zerobounceCheck(
  email?: string,
  rawIp?: string | null
): Promise<ZBCheck> {
  const raw = (email ?? "").trim();
  if (!raw)
    return { valid: false, reason: "Please enter your email.", score: 0 };

  const key = `zb:${REGION}:${raw}`;
  const cached = getCache<ZBCheck>(key);
  if (cached) return cached;

  const apiKey = process.env.ZB_API_KEY;
  if (!apiKey)
    return {
      valid: false,
      reason: "Email verification is not configured.",
      score: 0,
    };

  // ZB requires ip_address param to exist (can be empty)
  const ip = (rawIp ?? "").trim();

  const apiTimeoutSec = Math.min(
    60,
    Math.max(3, Number(process.env.ZB_API_TIMEOUT_SECONDS ?? 8))
  );
  const localTimeoutMs = Math.max(
    apiTimeoutSec * 1000,
    Number(process.env.ZB_LOCAL_TIMEOUT_MS ?? 10000)
  );

  const activity = String(process.env.ZB_ACTIVITY_DATA ?? "false") === "true";
  const verifyPlus = String(process.env.ZB_VERIFY_PLUS ?? "false") === "true";

  const url = new URL(ZB_API);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("email", raw);
  url.searchParams.set("ip_address", ip); // required by API, may be blank
  url.searchParams.set("timeout", String(apiTimeoutSec));
  if (activity) url.searchParams.set("activity_data", "true");
  if (verifyPlus) url.searchParams.set("verify_plus", "true");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), localTimeoutMs);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    const data = (await res.json()) as ZBResponse;

    const status = String(data.status || "").toLowerCase();
    const sub = String(data.sub_status || "").toLowerCase();
    const did = data.did_you_mean ?? null;

    // accept only "valid" unless flags are set
    const acceptCatchAll =
      String(process.env.ZB_ACCEPT_CATCHALL || "false") === "true";
    const acceptUnknown =
      String(process.env.ZB_ACCEPT_UNKNOWN || "false") === "true";

    const isValid =
      status === "valid" ||
      (status === "catch-all" && acceptCatchAll) ||
      (status === "unknown" && acceptUnknown);

    const out: ZBCheck = {
      valid: status === "valid",
      status,
      sub_status: sub,
      reason: friendlyReason(status, sub, did),
      score: status === "valid" ? 1 : 0,
      suggestion: did || undefined,
    };

    // cache: 15m for valid, 5m for others
    setCache(key, out, out.valid ? 15 * 60 * 1000 : 5 * 60 * 1000);
    return out;
  } catch {
    return {
      valid: false,
      reason: "We couldn't verify this email right now.",
      score: 0,
    };
  } finally {
    clearTimeout(timer);
  }
}
