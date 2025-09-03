import { getCache, setCache } from "./cache";
import { mailboxlayerCheck } from "./mailboxlayer";
import { numverifyCheck } from "./numverify";
import type { EmailResult, PhoneResult } from "./validationTypes";

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
  setCache(
    cacheKey,
    {
      emailValid: result.valid,
      emailReason: result.reason,
    },
    15 * 60 * 1000
  ); // 15 minutes

  return result;
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
