import { BLOCK_VOIP, ALLOW_LANDLINE, VALIDATION_TIMEOUT_MS } from "./config";
import type { PhoneResult } from "./validationTypes";

const API = "http://apilayer.net/api/validate";
const KEY = process.env.NUMVERIFY_API_KEY;

export function isPlausiblePhoneBare(input: string): boolean {
  if (!input) return false;
  const digits = input.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15; // ITU E.164 range
}

export async function numverifyCheck(
  number: string,
  country?: string
): Promise<{ raw?: any; result: PhoneResult }> {
  if (!KEY) {
    return { result: { valid: null, reason: "provider_missing" } };
  }

  const url = new URL(API);
  url.searchParams.set("access_key", KEY);
  url.searchParams.set("number", number);
  if (country) url.searchParams.set("country_code", country);
  url.searchParams.set("format", "1");

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(to);
    const data = await res.json();

    // expected fields: valid, international_format, country_code, line_type, carrier
    const { valid, international_format, country_code, line_type } = data || {};

    if (valid !== true) {
      return { raw: data, result: { valid: false, reason: "invalid_number" } };
    }

    if (
      country &&
      country_code &&
      country_code.toUpperCase() !== country.toUpperCase()
    ) {
      return {
        raw: data,
        result: { valid: false, reason: "country_mismatch" },
      };
    }

    const lt = (line_type || "").toLowerCase(); // 'mobile' | 'landline' | 'voip' | '' (unknown on free plan)
    if (BLOCK_VOIP && lt === "voip") {
      return {
        raw: data,
        result: {
          valid: false,
          reason: "voip_blocked",
          normalized: international_format,
        },
      };
    }
    if (!ALLOW_LANDLINE && lt === "landline") {
      return {
        raw: data,
        result: {
          valid: false,
          reason: "line_type_blocked",
          normalized: international_format,
        },
      };
    }

    // Strong pass if numverify says valid and above checks pass
    return {
      raw: data,
      result: { valid: true, reason: "", normalized: international_format },
    };
  } catch (e: any) {
    return { result: { valid: null, reason: "timeout_soft_pass" } };
  }
}

// Legacy function for backward compatibility
export async function validatePhone(phone: string, country?: string) {
  const { result } = await numverifyCheck(phone, country);
  return {
    phoneValid: result.valid,
    phoneReason: result.reason,
    normalized: result.normalized,
    raw: result,
  };
}
