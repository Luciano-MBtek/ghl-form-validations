export const VALIDATION_TIMEOUT_MS = 5000;

// Email policy
export const EMAIL_SCORE_THRESHOLD = 0.85;
export const BLOCK_ROLE_EMAILS = true;

// Phone policy
export const BLOCK_VOIP = true;
export const ALLOW_LANDLINE = true; // set to false if you want only mobile

// Email fallback policy
export const ENABLE_TRUSTED_EMAIL_FALLBACK = true;
export const ENABLE_MX_FALLBACK = true;

export const config = {
  mailboxlayerApiKey: process.env.MAILBOXLAYER_API_KEY || "",
  numverifyApiKey: process.env.NUMVERIFY_API_KEY || "",
  validationScoreThreshold: Number(
    process.env.VALIDATION_SCORE_THRESHOLD ?? EMAIL_SCORE_THRESHOLD
  ),
  blockRoleEmails:
    (process.env.BLOCK_ROLE_EMAILS ?? "true").toLowerCase() === "true",
  blockVoip: (process.env.BLOCK_VOIP ?? "true").toLowerCase() === "true",
  validationTimeoutMs: Number(
    process.env.VALIDATION_TIMEOUT_MS ?? VALIDATION_TIMEOUT_MS
  ),
  cacheTtlMs: 15 * 60 * 1000,
  rateLimitPerMin: 10,
};
