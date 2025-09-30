import {
  EMAIL_SCORE_GOOD,
  EMAIL_SCORE_MED,
  VALIDATION_TIMEOUT_MS,
  BLOCK_ROLE_EMAILS,
  BLOCK_DISPOSABLE,
} from "./config";
import type { EmailResult, Confidence } from "./validationTypes";

const API = "https://apilayer.net/api/check";
const KEY = process.env.MAILBOXLAYER_API_KEY;

export async function mailboxlayerCheck(
  email: string
): Promise<{ raw?: any; result: EmailResult }> {
  if (!KEY) {
    return {
      result: {
        valid: null,
        reason: "provider_missing",
        confidence: "unknown",
      },
    };
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
    console.log("[validate] Mailboxlayer result", data);

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
      return {
        raw: data,
        result: {
          valid: null,
          reason: "provider_error",
          confidence: "unknown",
        },
      };
    }

    // Compute confidence from score
    const computeConfidence = (score?: number): Confidence => {
      if (typeof score !== "number") return "unknown";
      if (score >= EMAIL_SCORE_GOOD) return "good";
      if (score >= EMAIL_SCORE_MED) return "medium";
      return "low";
    };

    // Hard blocking conditions only
    const badFormat = format_valid !== true;
    const noMx = mx_found !== true;
    const smtpFail = smtp_check === false;
    const disposableBlocked = disposable && BLOCK_DISPOSABLE;
    const roleBlocked = role && BLOCK_ROLE_EMAILS;

    // Only block on definitive undeliverable signals
    if (badFormat || noMx || smtpFail || disposableBlocked || roleBlocked) {
      const reason = badFormat
        ? "bad_format"
        : noMx
        ? "no_mx"
        : smtpFail
        ? "smtp_fail"
        : disposableBlocked
        ? "disposable"
        : "role";

      return {
        raw: data,
        result: {
          valid: false,
          reason,
          confidence: "low",
          score,
          disposable,
          role,
          catchAll: catch_all,
          domain: email.split("@")[1],
        },
      };
    }

    // Everything else is valid (including low scores, catch-all, etc.)
    const confidence = computeConfidence(score);
    return {
      raw: data,
      result: {
        valid: true,
        reason: "",
        confidence,
        score,
        disposable,
        role,
        catchAll: catch_all,
        domain: email.split("@")[1],
      },
    };
  } catch (e: any) {
    return {
      result: {
        valid: null,
        reason: "timeout_soft_pass",
        confidence: "unknown",
      },
    };
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
