import { getCache, setCache } from "./cache";
import { mailboxlayerCheck } from "./mailboxlayer";
import { numverifyCheck } from "./numverify";
import type { EmailResult, PhoneResult } from "./validationTypes";
import {
  ENABLE_TRUSTED_EMAIL_FALLBACK,
  ENABLE_MX_FALLBACK,
  BLOCK_ROLE_EMAILS,
} from "./config";
import dns from "node:dns";

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

export async function validateEmail(email?: string): Promise<EmailResult> {
  if (!email?.trim()) return { valid: false, reason: "empty" };
  if (!isPlausibleEmail(email)) return { valid: false, reason: "bad_format" };

  const normalizedEmail = email.trim().toLowerCase();
  const cacheKey = `email:${normalizedEmail}`;

  const cached = getCache(cacheKey);
  if (cached) {
    return { valid: cached.emailValid, reason: cached.emailReason };
  }

  const { result } = await mailboxlayerCheck(normalizedEmail);

  // Apply fallback logic if Mailboxlayer returned null (timeout/error)
  let finalResult = result;
  if (
    result.valid === null &&
    (result.reason === "timeout_soft_pass" ||
      result.reason === "provider_missing")
  ) {
    const domain = getDomain(normalizedEmail);

    if (domain) {
      // Check trusted domains first
      if (ENABLE_TRUSTED_EMAIL_FALLBACK && TRUSTED_EMAIL_DOMAINS.has(domain)) {
        finalResult = { valid: true, reason: "provisional_trusted" };
      }
      // Check MX records for other domains
      else if (ENABLE_MX_FALLBACK && !isRoleEmail(normalizedEmail)) {
        const hasMxRecords = await hasMx(domain);
        if (hasMxRecords) {
          finalResult = { valid: true, reason: "provisional_mx" };
        }
      }
    }
  }

  setCache(
    cacheKey,
    {
      emailValid: finalResult.valid,
      emailReason: finalResult.reason,
    },
    15 * 60 * 1000
  ); // 15 minutes

  return finalResult;
}

export async function validatePhone(
  phone?: string,
  country?: string
): Promise<PhoneResult> {
  if (!phone?.trim()) return { valid: false, reason: "empty" };
  if (!isPlausiblePhoneBare(phone))
    return { valid: false, reason: "bad_format" };

  const normalizedPhone = phone.trim();
  const digits = normalizedPhone.replace(/[^\d+]/g, "");
  const countryCode = (country || "").toUpperCase();
  const cacheKey = `phone:${countryCode}:${digits}`;

  const cached = getCache(cacheKey);
  if (cached) {
    return {
      valid: cached.phoneValid,
      reason: cached.phoneReason,
      normalized: cached.normalizedPhone,
    };
  }

  const { result } = await numverifyCheck(normalizedPhone, countryCode);
  setCache(
    cacheKey,
    {
      phoneValid: result.valid,
      phoneReason: result.reason,
      normalizedPhone: result.normalized,
    },
    15 * 60 * 1000
  ); // 15 minutes

  return result;
}

// Legacy function for backward compatibility
export async function validateEmailAndPhone(
  email?: string,
  phone?: string,
  country?: string
) {
  const result: any = {};

  if (email) {
    const emailResult = await validateEmail(email);
    result.emailValid = emailResult.valid;
    result.emailReason = emailResult.reason;
    result.echoEmail = email;
  }

  if (phone) {
    const phoneResult = await validatePhone(phone, country);
    result.phoneValid = phoneResult.valid;
    result.phoneReason = phoneResult.reason;
    result.normalizedPhone = phoneResult.normalized;
    result.echoPhone = phone;
  }

  return result;
}
