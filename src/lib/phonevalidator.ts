// src/lib/phonevalidator.ts
import { setCache, getCache } from "./cache";

type PhoneValidatorResponse = {
  PhoneNumber?: string;
  Cost?: number;
  SearchDate?: string;
  StatusCode?: string; // "200" on success
  StatusMessage?: string; // "OK" on success
  PhoneBasic?: {
    PhoneNumber?: string;
    ReportDate?: string;
    LineType?: string; // CELL PHONE | LANDLINE | VOIP | TOLL-FREE | UNKNOWN
    PhoneCompany?: string;
    PhoneLocation?: string;
    ErrorCode?: string;
    ErrorDescription?: string;
  };
  PhoneDetail?: {
    PhoneNumber?: string;
    ReportDate?: string;
    LineType?: string;
    PhoneCompany?: string;
    PhoneLocation?: string;
    Ported?: "YES" | "NO";
    ErrorCode?: string;
    ErrorDescription?: string;
  };
  PhoneDeactivation?: {
    PhoneNumber?: string;
    ReportDate?: string;
    LastDeactivation?: boolean;
    LastDeactivationDate?: string | null;
    LastDeactivationCompany?: string | null;
    ErrorCode?: string;
    ErrorDescription?: string;
  };
};

export type PhoneCheckOutcome = {
  ok: boolean; // overall check executed (not timeout or misconfig)
  valid: boolean; // acceptable to proceed (cell only, not deactivated)
  reason?: string; // user-facing message
  raw?: PhoneValidatorResponse; // for debugging if needed
  lineType?: string;
  carrier?: string;
  deactivated?: boolean;
};

const API_BASE = "https://api.phonevalidator.com/api/v2/phonesearch";
const TYPES_DEFAULT =
  process.env.PHONEVALIDATOR_TYPES || "basic,detail,deactivation";
const API_KEY = process.env.PHONEVALIDATOR_API_KEY;

function normalizeToUSDigits(phone: string, country?: string): string {
  // Keep only digits. If it starts with "1" or is 10 digits, PhoneValidator accepts both.
  const digits = phone.replace(/\D+/g, "");
  // If a country is provided and is "US" but number is 10 digits, leave as-is.
  // If number has leading 1 and then 10 digits, leave as-is.
  return digits;
}

/**
 * Calls PhoneValidator. Soft timeout and caching like our other validators.
 * Accepts only CELL PHONE and rejects VOIP/LANDLINE/TOLL-FREE/UNKNOWN and recently deactivated.
 */
export async function phonevalidatorCheck(input?: {
  phone?: string | null;
  country?: string | null;
  timeoutMs?: number;
}): Promise<PhoneCheckOutcome> {
  const phoneRaw = (input?.phone ?? "").trim();
  if (!phoneRaw) {
    return { ok: true, valid: false, reason: "Enter your phone number." };
  }
  if (!API_KEY) {
    // Soft-pass on missing key (keep UX consistent). We'll validate again on submit if configured.
    return { ok: false, valid: true, reason: undefined };
  }

  const norm = normalizeToUSDigits(phoneRaw, input?.country ?? undefined);
  if (norm.length < 10) {
    return { ok: true, valid: false, reason: "Number looks too short." };
  }

  const cacheKey = `phonevalidator:${norm}`;
  const cached = getCache<PhoneCheckOutcome>(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input?.timeoutMs ?? 5000
  );

  try {
    const url = new URL(API_BASE);
    url.searchParams.set("apikey", API_KEY);
    url.searchParams.set("phone", norm);
    url.searchParams.set("type", TYPES_DEFAULT);

    const res = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    // Network / HTTP guard
    if (!res.ok) {
      // Soft error
      const outcome: PhoneCheckOutcome = {
        ok: false,
        valid: true,
        reason: undefined,
      };
      setCache(cacheKey, outcome, 15 * 60 * 1000);
      return outcome;
    }

    const data = (await res.json()) as PhoneValidatorResponse;

    // API-level success?
    if (data.StatusCode !== "200") {
      const outcome: PhoneCheckOutcome = {
        ok: false,
        valid: true,
        raw: data,
      };
      setCache(cacheKey, outcome, 10 * 60 * 1000);
      return outcome;
    }

    // Prefer detail->basic for line type/carrier
    const lineType =
      data?.PhoneDetail?.LineType || data?.PhoneBasic?.LineType || "UNKNOWN";

    const carrier =
      data?.PhoneDetail?.PhoneCompany ||
      data?.PhoneBasic?.PhoneCompany ||
      undefined;

    const deactivated = Boolean(data?.PhoneDeactivation?.LastDeactivation);

    // Business rules:
    // - must be CELL PHONE
    // - reject VOIP, LANDLINE, TOLL-FREE, UNKNOWN
    // - reject if recently deactivated
    // Note: comparison in UPPERCASE
    const lt = String(lineType || "").toUpperCase();
    const isCell = lt === "CELL PHONE";
    const isRejectedType =
      lt === "VOIP" ||
      lt === "LANDLINE" ||
      lt === "TOLL-FREE" ||
      lt === "UNKNOWN";

    let valid = isCell && !deactivated && !isRejectedType;

    let reason: string | undefined;
    if (!isCell) {
      if (lt === "VOIP") reason = "We need a mobile number (no VoIP).";
      else if (lt === "LANDLINE")
        reason = "We need a mobile number (no landlines).";
      else if (lt === "TOLL-FREE")
        reason = "We need a mobile number (no toll-free).";
      else reason = "Please use a mobile number.";
    }
    if (deactivated) {
      valid = false;
      reason = "This number appears deactivated.";
    }

    const outcome: PhoneCheckOutcome = {
      ok: true,
      valid,
      reason,
      raw: data,
      lineType,
      carrier,
      deactivated,
    };

    // Cache for 15 minutes
    setCache(cacheKey, outcome, 15 * 60 * 1000);
    return outcome;
  } catch {
    // Soft fail -> allow, but no success message
    const outcome: PhoneCheckOutcome = { ok: false, valid: true };
    setCache(cacheKey, outcome, 5 * 60 * 1000);
    return outcome;
  } finally {
    clearTimeout(timeout);
  }
}

