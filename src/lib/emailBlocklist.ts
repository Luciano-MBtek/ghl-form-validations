// src/lib/emailBlocklist.ts
// Env-driven email blocklist with sensible defaults and client/server support.

export type BlockCheck = {
  blocked: boolean;
  reason?: "blocked_prefix" | "blocked_domain";
};

/**
 * Defaults (keep your current seeds as a safety net when env is empty).
 * NOTE: These are lowercased. All user inputs are normalized to lowercase as well.
 */
const DEFAULT_PREFIXES = [
  // local-part startsWith(...) match (case-insensitive)
  "motivation.usa",
] as const;

const DEFAULT_DOMAINS = [
  "mailinator.com",
  "tempmail.com",
  "guerrillamail.com",
  "10minutemail.com",
  "yopmail.com",
  "dayrep.com",
  "rhyta.com",
  "armyspy.com",
  "tiffincrane.com",
  "mv6.com",
  "acmecorp.com",
];

/**
 * Robust parser that accepts:
 * - JSON arrays: '["a","b"]'
 * - CSV / newline / semicolon / space separated
 */
function parseListEnv(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  // Try JSON array first
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    trimmed.startsWith('"')
  ) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        return arr.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
      }
    } catch {
      // fall through to delimiter parsing
    }
  }
  // Delimiter-based parsing
  return trimmed
    .split(/[\n,; \t]+/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Read env lists for both client and server contexts.
 * On client builds, NEXT_PUBLIC_* will be inlined by Next.js.
 * On server, we also check non-public variants for convenience.
 */
function getEnvLists() {
  // Client-safe (also available on server)
  const pubPrefixes = parseListEnv(
    process.env.NEXT_PUBLIC_BLOCKED_EMAIL_PREFIXES
  );
  const pubDomains = parseListEnv(
    process.env.NEXT_PUBLIC_BLOCKED_EMAIL_DOMAINS
  );

  // Server-only (ignored in client bundle unless you explicitly expose them)
  const srvPrefixes = parseListEnv(process.env.BLOCKED_EMAIL_PREFIXES);
  const srvDomains = parseListEnv(process.env.BLOCKED_EMAIL_DOMAINS);

  // Combine public + server + defaults (union, deduped)
  const prefixes = dedupeLower([
    ...pubPrefixes,
    ...srvPrefixes,
    ...DEFAULT_PREFIXES.map(String),
  ]);

  const domains = dedupeLower([
    ...pubDomains,
    ...srvDomains,
    ...DEFAULT_DOMAINS,
  ]);

  return { prefixes, domains };
}

function dedupeLower(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const v = it.trim().toLowerCase();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function getDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const d = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return d || null;
}

// Cached blocklists (computed once at module load)
const { prefixes: BLOCKED_EMAIL_PREFIXES, domains: BLOCKED_EMAIL_DOMAINS_ARR } =
  getEnvLists();
const BLOCKED_EMAIL_DOMAINS = new Set<string>(BLOCKED_EMAIL_DOMAINS_ARR);

export function isBlockedEmailPrefix(email?: string): BlockCheck {
  if (!email) return { blocked: false };
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at <= 0) return { blocked: false }; // let normal format validators handle it
  const local = trimmed.slice(0, at);
  const blocked = BLOCKED_EMAIL_PREFIXES.some((p) => local.startsWith(p));
  return blocked
    ? { blocked: true, reason: "blocked_prefix" }
    : { blocked: false };
}

export function isBlockedEmailDomain(email?: string): BlockCheck {
  if (!email) return { blocked: false };
  const d = getDomain(email);
  if (!d) return { blocked: false };

  // Exact match or subdomain of any blocked domain
  if (BLOCKED_EMAIL_DOMAINS.has(d)) {
    return { blocked: true, reason: "blocked_domain" };
  }
  for (const b of BLOCKED_EMAIL_DOMAINS) {
    if (d === b || d.endsWith("." + b)) {
      return { blocked: true, reason: "blocked_domain" };
    }
  }
  return { blocked: false };
}

// Optional convenience exports (handy for debugging/telemetry)
export const __BLOCKED_PREFIXES = BLOCKED_EMAIL_PREFIXES;
export const __BLOCKED_DOMAINS = Array.from(BLOCKED_EMAIL_DOMAINS);
