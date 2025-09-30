// src/lib/emailBlocklist.ts
export const BLOCKED_EMAIL_PREFIXES = [
  // local-part startsWith(...) match (case-insensitive)
  "motivation.usa",
] as const;

export const BLOCKED_EMAIL_DOMAINS = new Set<string>([
  "mailinator.com",
  "tempmail.com",
  "guerrillamail.com",
  "10minutemail.com",
  "yopmail.com",
  "dayrep.com",
  "rhyta.com",
  "armyspy.com",
  "tiffincrane.com",
]);

export type BlockCheck = {
  blocked: boolean;
  reason?: "blocked_prefix" | "blocked_domain";
};

function getDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const d = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return d || null;
}

export function isBlockedEmailPrefix(email?: string): BlockCheck {
  if (!email) return { blocked: false };
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at <= 0) return { blocked: false }; // let normal format validators handle it
  const local = trimmed.slice(0, at);
  const blocked = BLOCKED_EMAIL_PREFIXES.some((p) =>
    local.startsWith(p.toLowerCase())
  );
  return blocked
    ? { blocked: true, reason: "blocked_prefix" }
    : { blocked: false };
}

export function isBlockedEmailDomain(email?: string): BlockCheck {
  if (!email) return { blocked: false };
  const d = getDomain(email);
  if (!d) return { blocked: false };

  // Exact match or subdomain of any blocked domain
  const blocked =
    BLOCKED_EMAIL_DOMAINS.has(d) ||
    Array.from(BLOCKED_EMAIL_DOMAINS).some(
      (b) => d === b || d.endsWith("." + b)
    );

  return blocked
    ? { blocked: true, reason: "blocked_domain" }
    : { blocked: false };
}
