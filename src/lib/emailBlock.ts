export const BLOCKED_EMAIL_PREFIXES = ["motivation.usa"]; // case-insensitive

export type BlockCheck = { blocked: boolean; reason?: string };

export function isBlockedEmailPrefix(email?: string): BlockCheck {
  if (!email) return { blocked: false };
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at <= 0) return { blocked: false }; // let normal validators catch bad format
  const local = trimmed.slice(0, at);
  const blocked = BLOCKED_EMAIL_PREFIXES.some((p) =>
    local.startsWith(p.toLowerCase())
  );
  return blocked
    ? { blocked: true, reason: "blocked_prefix" }
    : { blocked: false };
}
