import { getCache, setCache } from "./cache";
import { validateEmail } from "./mailboxlayer";
import { validatePhone } from "./numverify";
import { config } from "./config";

export type CombinedValidation = {
  emailValid?: boolean;
  emailReason?: string;
  phoneValid?: boolean;
  phoneReason?: string;
  normalizedPhone?: string;
  echoEmail?: string;
  echoPhone?: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  return phone.trim();
}

export async function validateEmailAndPhone(
  email?: string,
  phone?: string,
  country?: string
): Promise<CombinedValidation> {
  const result: CombinedValidation = {};

  if (email) {
    const e = normalizeEmail(email);
    const emailKey = `email:${e}`;
    let emailVerdict = getCache<{ emailValid: boolean; emailReason: string }>(
      emailKey
    );
    if (!emailVerdict) {
      const v = await validateEmail(e);
      emailVerdict = { emailValid: v.emailValid, emailReason: v.emailReason };
      setCache(emailKey, emailVerdict, config.cacheTtlMs);
    }
    result.emailValid = emailVerdict.emailValid;
    result.emailReason = emailVerdict.emailReason;
    result.echoEmail = email;
  }

  if (phone) {
    const p = normalizePhone(phone);
    const digits = p.replace(/[^\d+]/g, "");
    const cc = (country || "").toUpperCase();
    const phoneKey = `phone:${cc}:${digits}`;
    let phoneVerdict = getCache<{
      phoneValid: boolean;
      phoneReason: string;
      normalized: string;
    }>(phoneKey);
    if (!phoneVerdict) {
      const v = await validatePhone(digits, cc || undefined);
      phoneVerdict = {
        phoneValid: v.phoneValid,
        phoneReason: v.phoneReason,
        normalized: v.normalized,
      };
      setCache(phoneKey, phoneVerdict, config.cacheTtlMs);
    }
    result.phoneValid = phoneVerdict.phoneValid;
    result.phoneReason = phoneVerdict.phoneReason;
    result.normalizedPhone = phoneVerdict.normalized;
    result.echoPhone = phone;
  }

  return result;
}
