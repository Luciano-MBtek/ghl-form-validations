import {
  EMAIL_SCORE_THRESHOLD,
  VALIDATION_TIMEOUT_MS,
  BLOCK_ROLE_EMAILS,
} from "./config";
import type { EmailResult } from "./validationTypes";

const API = "https://apilayer.net/api/check";
const KEY = process.env.MAILBOXLAYER_API_KEY;

export async function mailboxlayerCheck(
  email: string
): Promise<{ raw?: any; result: EmailResult }> {
  if (!KEY) {
    return { result: { valid: null, reason: "provider_missing" } };
  }
  const url = new URL(API);
  url.searchParams.set("access_key", KEY);
  url.searchParams.set("email", email);
  url.searchParams.set("smtp", "1");
  // url.searchParams.set("catch_all", "1");
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

    // expected fields: format_valid, mx_found, smtp_check, catch_all, score, disposable, role
    const {
      format_valid,
      mx_found,
      smtp_check,
      catch_all,
      score,
      disposable,
      role,
      // sometimes api returns 'success:false' with error
      error,
    } = data || {};

    if (error) {
      return { raw: data, result: { valid: null, reason: "provider_missing" } };
    }

    // strong pass policy
    const meetsScore =
      typeof score === "number" ? score >= EMAIL_SCORE_THRESHOLD : true;
    const roleBlocked = !!role && BLOCK_ROLE_EMAILS;

    const strongPass =
      format_valid === true &&
      mx_found === true &&
      smtp_check === true &&
      catch_all === false &&
      !disposable &&
      !roleBlocked &&
      meetsScore;

    if (strongPass) return { raw: data, result: { valid: true, reason: "" } };

    // derive best reason
    const reason = roleBlocked
      ? "role"
      : disposable
      ? "disposable"
      : catch_all === true
      ? "catch_all"
      : smtp_check === false
      ? "smtp_fail"
      : mx_found === false
      ? "mx_not_found"
      : !meetsScore
      ? "low_score"
      : "verification_failed";

    return { raw: data, result: { valid: false, reason } };
  } catch (e: any) {
    return { result: { valid: null, reason: "timeout_soft_pass" } };
  }
}

// Legacy function for backward compatibility
export async function validateEmail(email: string) {
  const { result } = await mailboxlayerCheck(email);
  return {
    emailValid: result.valid,
    emailReason: result.reason,
    raw: result,
  };
}
