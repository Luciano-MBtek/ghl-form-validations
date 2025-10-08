// src/lib/phonevalidator.ts
import { setCache, getCache } from "./cache";

export type PhonePrecheckResult = {
  ok: boolean;
  reason?: string;
  normalized?: string; // digits-only, 10-digit NANP after stripping leading 1 if present
};

const DIGIT_RE = /\d/g;

export function normalizeDigits(input: string): string {
  return (input.match(DIGIT_RE) ?? []).join("");
}

export function nanpPrecheckUS(input: string): PhonePrecheckResult {
  let digits = normalizeDigits(input);

  // Strip exactly one leading '1' if present (US country code)
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }

  if (digits.length !== 10) {
    return {
      ok: false,
      reason:
        "US numbers must have 10 digits (area code + number). If you included +1, remove it.",
    };
  }

  // Light NANP rules
  const areaFirst = digits.charCodeAt(0) - 48; // 0-9
  const exchangeFirst = digits.charCodeAt(3) - 48;
  const exchangeMid = digits.charCodeAt(4) - 48;

  if (areaFirst < 2 || areaFirst > 9) {
    return { ok: false, reason: "Invalid area code format." };
  }
  if (exchangeFirst < 2 || exchangeFirst > 9) {
    return { ok: false, reason: "Invalid central office code format." };
  }
  // Disallow N11 for central office (e.g., 211, 311, ..., 911)
  if (exchangeMid === 1 && exchangeFirst >= 2 && exchangeFirst <= 9) {
    return { ok: false, reason: "Central office code cannot be an N11 code." };
  }

  return { ok: true, normalized: digits };
}

// Convenience helper to gate before calling external API
export function mustBeValidUSLength(input: string): {
  ok: boolean;
  message?: string;
  tenDigit?: string;
} {
  const pre = nanpPrecheckUS(input);
  if (!pre.ok) return { ok: false, message: pre.reason };
  return { ok: true, tenDigit: pre.normalized };
}

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

  // Apply NANP precheck for US numbers
  const country = (input?.country ?? "").toUpperCase();
  if (country === "US" || country === "CA" || !country) {
    const precheck = mustBeValidUSLength(phoneRaw);
    if (!precheck.ok) {
      return { ok: true, valid: false, reason: precheck.message };
    }
    // Use the normalized 10-digit number for PhoneValidator
    const norm = `+1${precheck.tenDigit}`;
    return await callPhoneValidator(norm, input?.timeoutMs);
  }

  // For non-US numbers, use existing logic
  const norm = normalizeToUSDigits(phoneRaw, input?.country ?? undefined);
  if (norm.length < 10) {
    return { ok: true, valid: false, reason: "Number looks too short." };
  }
  return await callPhoneValidator(norm, input?.timeoutMs);
}

async function callPhoneValidator(
  normalizedPhone: string,
  timeoutMs?: number
): Promise<PhoneCheckOutcome> {
  const cacheKey = `phonevalidator:${normalizedPhone}`;
  const cached = getCache<PhoneCheckOutcome>(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? 5000);

  try {
    const url = new URL(API_BASE);
    url.searchParams.set("apikey", API_KEY);
    url.searchParams.set("phone", normalizedPhone);
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
