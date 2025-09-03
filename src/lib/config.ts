export const config = {
  mailboxlayerApiKey: process.env.MAILBOXLAYER_API_KEY || "",
  numverifyApiKey: process.env.NUMVERIFY_API_KEY || "",
  validationScoreThreshold: Number(
    process.env.VALIDATION_SCORE_THRESHOLD ?? 0.65
  ),
  blockRoleEmails:
    (process.env.BLOCK_ROLE_EMAILS ?? "true").toLowerCase() === "true",
  blockVoip: (process.env.BLOCK_VOIP ?? "false").toLowerCase() === "true",
  validationTimeoutMs: Number(process.env.VALIDATION_TIMEOUT_MS ?? 5000),
  cacheTtlMs: 15 * 60 * 1000,
  rateLimitPerMin: 10,
};
