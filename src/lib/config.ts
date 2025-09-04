export const VALIDATION_TIMEOUT_MS = 5000;

// Email confidence thresholds
export const EMAIL_SCORE_GOOD = Number(process.env.EMAIL_SCORE_GOOD ?? 0.8);
export const EMAIL_SCORE_MED = Number(process.env.EMAIL_SCORE_MED ?? 0.5);

// Email blocking policy
export const BLOCK_ROLE_EMAILS = true;
export const BLOCK_DISPOSABLE =
  (process.env.BLOCK_DISPOSABLE ?? "false") === "true";
// IMPORTANT: Score is NOT a hard gate now
export const EMAIL_BLOCK_ON_SCORE = false;

// Phone policy
export const BLOCK_VOIP = (process.env.BLOCK_VOIP ?? "false") === "true";
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
