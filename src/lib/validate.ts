import { getCache, setCache } from "./cache";
import { zerobounceCheck } from "./zerobounce";
import { phonevalidatorCheck } from "./phonevalidator";
import type { EmailResult, PhoneResult } from "./validationTypes";
import {
  ENABLE_TRUSTED_EMAIL_FALLBACK,
  ENABLE_MX_FALLBACK,
  BLOCK_ROLE_EMAILS,
} from "./config";
import dns from "node:dns";

// NEW: import the blocklist helpers
import { isBlockedEmailPrefix, isBlockedEmailDomain } from "./emailBlocklist";

// --- Name validation helpers ---
const NAME_SAFE_RE =
  /^[\p{L}](?:[\p{L}\p{M}]|[ '\-](?=[\p{L}\p{M}]))*[\p{L}]$/u;
// count ALL vowels (Latin + some diacritics)
const VOWELS_GLOBAL_RE = /[aeiouyáàâäãåéèêëíìîïóòôöõúùûüýÿ]/gi;
const BAD_NAME_TOKENS = new Set([
  "test",
  "tester",
  "testing",
  "asdf",
  "qwerty",
  "lorem",
  "ipsum",
  "na",
  "n/a",
  "none",
  "unknown",
  "xyz",
  "abc",
  "aaaa",
  "zzzz",
  "rzzzz",
]);

export type NameResult = { valid: boolean; reason?: string };

export function validateNameHeuristic(input?: string | null): NameResult {
  const raw = (input ?? "").trim();
  if (!raw) return { valid: false, reason: "Please enter your name." };
  if (raw.length < 2 || raw.length > 40)
    return { valid: false, reason: "Name must be 2–40 characters." };

  // Allowed chars & placement (letters + optional diacritics, spaces, - and ')
  if (!NAME_SAFE_RE.test(raw))
    return {
      valid: false,
      reason: "Use letters only (you may include - or ').",
    };

  if (/ {2,}|--|''/.test(raw))
    return {
      valid: false,
      reason: "Please remove repeated punctuation/spaces.",
    };

  const lower = raw.toLowerCase();
  if (BAD_NAME_TOKENS.has(lower))
    return { valid: false, reason: "Please enter a real name." };

  // Vowel sanity for long strings (avoid "Rzzzzzz")
  if (raw.length >= 7) {
    const letters = raw.replace(/[^A-Za-zÀ-ÿ]/g, "");
    const vowels = (letters.match(VOWELS_GLOBAL_RE) ?? []).length;
    const ratio = vowels / Math.max(letters.length, 1);
    if (ratio < 0.2)
      return { valid: false, reason: "That name looks mistyped." };
  }
  return { valid: true };
}

const TRUSTED_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
]);

function getDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const d = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return d || null;
}

async function hasMx(domain: string, timeoutMs = 1500): Promise<boolean> {
  const p = dns.promises
    .resolveMx(domain)
    .then((recs) => Array.isArray(recs) && recs.length > 0)
    .catch(() => false);
  return await Promise.race([
    p,
    new Promise<boolean>((r) => setTimeout(() => r(false), timeoutMs)),
  ]);
}

function isRoleEmail(email: string): boolean {
  if (!BLOCK_ROLE_EMAILS) return false;
  const local = email.split("@")[0]?.toLowerCase() || "";
  const rolePrefixes = [
    "info",
    "sales",
    "support",
    "admin",
    "contact",
    "help",
    "noreply",
    "no-reply",
  ];
  return rolePrefixes.some(
    (prefix) => local === prefix || local.startsWith(prefix + ".")
  );
}

export function isPlausibleEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  // minimal RFC-lite
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!re.test(email)) return false;
  const [local, domain] = email.split("@");
  if (!local || !domain) return false;
  if (local.length > 64) return false;
  if (domain.includes("..")) return false;
  return true;
}

export function isPlausiblePhoneBare(input: string): boolean {
  if (!input) return false;
  const digits = input.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15; // ITU E.164 range
}

export async function validateEmail(
  email?: string,
  ip?: string | null
): Promise<EmailResult> {
  if (!email?.trim())
    return { valid: false, reason: "empty", confidence: "low" };
  if (!isPlausibleEmail(email))
    return { valid: false, reason: "bad_format", confidence: "low" };

  // Early block checks (prefix/domain)
  const prefixCheck = isBlockedEmailPrefix(email);
  if (prefixCheck.blocked) {
    return {
      valid: false,
      reason: "This email address isn't allowed (prefix).",
      score: 0.0,
      confidence: "low",
    };
  }

  const domainCheck = isBlockedEmailDomain(email);
  if (domainCheck.blocked) {
    return {
      valid: false,
      reason: "This email domain isn't allowed.",
      score: 0.0,
      confidence: "low",
    };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const cacheKey = `email:${normalizedEmail}`;

  const cached = getCache(cacheKey);
  if (cached) {
    return {
      valid: cached.emailValid,
      reason: cached.emailReason,
      confidence: cached.emailConfidence || "unknown",
      score: cached.emailScore,
      disposable: cached.emailDisposable,
      role: cached.emailRole,
      catchAll: cached.emailCatchAll,
      domain: cached.emailDomain,
    };
  }

  const zbResult = await zerobounceCheck(normalizedEmail, ip);

  // Map ZeroBounce result to EmailResult format
  const result: EmailResult = {
    valid: zbResult.valid,
    reason: zbResult.reason,
    confidence: zbResult.valid ? "good" : "low",
    score: zbResult.score || 0,
    disposable: zbResult.sub_status === "disposable",
    role: zbResult.sub_status === "role_based",
    catchAll: zbResult.status === "catch-all",
    domain: getDomain(normalizedEmail) || undefined,
  };

  // Apply fallback logic if ZeroBounce returned unknown/timeout
  let finalResult = result;
  if (
    result.valid === null &&
    (result.reason === "We couldn't verify this email right now." ||
      result.reason === "Email verification is not configured.")
  ) {
    const domain = getDomain(normalizedEmail);

    if (domain) {
      // Check trusted domains first
      if (ENABLE_TRUSTED_EMAIL_FALLBACK && TRUSTED_EMAIL_DOMAINS.has(domain)) {
        finalResult = {
          valid: true,
          reason: "provisional_trusted",
          confidence: "good",
          domain,
        };
      }
      // Check MX records for other domains
      else if (ENABLE_MX_FALLBACK && !isRoleEmail(normalizedEmail)) {
        const hasMxRecords = await hasMx(domain);
        if (hasMxRecords) {
          finalResult = {
            valid: true,
            reason: "provisional_mx",
            confidence: "medium",
            domain,
          };
        }
      }
    }
  }

  setCache(
    cacheKey,
    {
      emailValid: finalResult.valid,
      emailReason: finalResult.reason,
      emailConfidence: finalResult.confidence,
      emailScore: finalResult.score,
      emailDisposable: finalResult.disposable,
      emailRole: finalResult.role,
      emailCatchAll: finalResult.catchAll,
      emailDomain: finalResult.domain,
    },
    15 * 60 * 1000
  ); // 15 minutes

  return finalResult;
}

export async function validatePhone(
  phone?: string,
  country?: string
): Promise<PhoneResult> {
  if (!phone?.trim())
    return { valid: false, reason: "empty", confidence: "low" };
  if (!isPlausiblePhoneBare(phone))
    return { valid: false, reason: "bad_format", confidence: "low" };

  const normalizedPhone = phone.trim();
  const digits = normalizedPhone.replace(/[^\d+]/g, "");
  const countryCode = (country || "").toUpperCase();
  const cacheKey = `phone:${countryCode}:${digits}`;

  const cached = getCache(cacheKey);
  if (cached) {
    return {
      valid: cached.phoneValid,
      reason: cached.phoneReason,
      confidence: cached.phoneConfidence || "unknown",
      lineType: cached.phoneLineType,
      country: cached.phoneCountry,
      normalized: cached.normalizedPhone,
    };
  }

  // Use PhoneValidator instead of Numverify
  const phoneResult = await phonevalidatorCheck({
    phone: normalizedPhone,
    country: countryCode,
    timeoutMs: 5000,
  });

  // Map PhoneValidator result to existing PhoneResult shape
  const result: PhoneResult = {
    valid: phoneResult.valid,
    reason: phoneResult.reason,
    confidence: phoneResult.ok ? "good" : "unknown",
    lineType: phoneResult.lineType,
    country: countryCode,
    normalized: normalizedPhone,
  };

  setCache(
    cacheKey,
    {
      phoneValid: result.valid,
      phoneReason: result.reason,
      phoneConfidence: result.confidence,
      phoneLineType: result.lineType,
      phoneCountry: result.country,
      normalizedPhone: result.normalized,
    },
    15 * 60 * 1000
  ); // 15 minutes

  return result;
}

// Combined validation function that includes name validation
export type CombinedResult = {
  emailValid?: boolean;
  emailReason?: string;
  emailConfidence?: "good" | "medium" | "low" | "unknown";
  echoEmail?: string;
  phoneValid?: boolean;
  phoneReason?: string;
  phoneConfidence?: "good" | "medium" | "low" | "unknown";
  phoneLineType?: string;
  echoPhone?: string;
  firstNameValid?: boolean;
  firstNameReason?: string;
  echoFirstName?: string;
  lastNameValid?: boolean;
  lastNameReason?: string;
  echoLastName?: string;
};

export async function validateCombined(input: {
  email?: string;
  phone?: string;
  country?: string;
  firstName?: string;
  lastName?: string;
  ip?: string | null;
}): Promise<CombinedResult> {
  const out: CombinedResult = {};

  // Email validation
  if (typeof input.email === "string") {
    const emailResult = await validateEmail(input.email, input.ip);
    out.emailValid =
      emailResult.valid === true
        ? true
        : emailResult.valid === false
        ? false
        : undefined;
    out.emailReason = emailResult.reason;
    out.emailConfidence = emailResult.confidence;
    out.echoEmail = input.email;
  }

  // Phone validation
  if (typeof input.phone === "string") {
    const phoneResult = await validatePhone(input.phone, input.country);
    out.phoneValid =
      phoneResult.valid === true
        ? true
        : phoneResult.valid === false
        ? false
        : undefined;
    out.phoneReason = phoneResult.reason;
    out.phoneConfidence = phoneResult.confidence;
    out.phoneLineType = phoneResult.lineType;
    out.echoPhone = input.phone;
  }

  // First name validation
  if (typeof input.firstName === "string") {
    const r = validateNameHeuristic(input.firstName);
    out.firstNameValid = r.valid;
    if (!r.valid) out.firstNameReason = r.reason;
    out.echoFirstName = input.firstName;
  }

  // Last name validation
  if (typeof input.lastName === "string") {
    const r = validateNameHeuristic(input.lastName);
    out.lastNameValid = r.valid;
    if (!r.valid) out.lastNameReason = r.reason;
    out.echoLastName = input.lastName;
  }

  return out;
}

// Legacy function for backward compatibility
export async function validateEmailAndPhone(
  email?: string,
  phone?: string,
  country?: string,
  ip?: string | null
) {
  const result: any = {};

  if (email) {
    const emailResult = await validateEmail(email, ip);
    result.emailValid = emailResult.valid;
    result.emailReason = emailResult.reason;
    result.emailConfidence = emailResult.confidence;
    result.echoEmail = email;
  }

  if (phone) {
    const phoneResult = await validatePhone(phone, country);
    result.phoneValid = phoneResult.valid;
    result.phoneReason = phoneResult.reason;
    result.phoneConfidence = phoneResult.confidence;
    result.phoneLineType = phoneResult.lineType;
    result.normalizedPhone = phoneResult.normalized;
    result.echoPhone = phone;
  }

  return result;
}
