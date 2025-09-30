// src/lib/name.ts
const BLACKLIST = new Set([
  "test",
  "tester",
  "testing",
  "na",
  "n/a",
  "none",
  "unknown",
  "asdf",
  "qwerty",
  "zxcv",
  "no name",
  "noname",
  "anonymous",
  "bot",
  "null",
  "undefined",
]);

// simple keyboard-smash fragments
const GIBBERISH_FRAG = /(asdf|qwer|zxcv|poiuy|lkjh|mnbv|dfgh|hjkl|1234|4321)/i;

function hasTooManyRepeats(s: string) {
  // 4+ same char in a row or a 2-char pattern repeating 3+ times
  if (/(.)\1{3,}/i.test(s)) return true;
  if (/([a-z]{2})\1{2,}/i.test(s)) return true;
  return false;
}

function vowelConsonantWeirdnessRatio(s: string) {
  const letters = s.replace(/[^A-Za-z\u00C0-\u024F]/g, "");
  if (!letters) return 1; // weird
  const vowels = (letters.match(/[AEIOUYaeiouy\u00C0-\u024F]/g) ?? []).length;
  const ratio = vowels / letters.length; // ~0.35–0.65 is common in EN
  return ratio; // we'll flag extremes on long strings
}

export type NameCheck = {
  valid: boolean;
  reason?: string;
  score: number; // 0–1 confidence
  suggestion?: string; // Title-cased, trimmed
};

export function validateHumanName(
  raw: string,
  opts?: { min?: number; max?: number }
): NameCheck {
  const min = opts?.min ?? 2;
  const max = opts?.max ?? 40;

  const s = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
  const suggestion = s
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");

  if (!s)
    return {
      valid: false,
      reason: "Name cannot be empty",
      score: 0,
      suggestion,
    };

  // Allow letters (any script), spaces, hyphen, apostrophe
  if (!/^[\p{L}\p{M}][\p{L}\p{M}'\- ]*$/u.test(s))
    return {
      valid: false,
      reason: "Name contains invalid characters",
      score: 0.1,
      suggestion,
    };

  if (s.length < min)
    return {
      valid: false,
      reason: "Name is too short",
      score: 0.1,
      suggestion,
    };
  if (s.length > max)
    return { valid: false, reason: "Name is too long", score: 0.1, suggestion };

  if (/[0-9_@#$%^&*+=/\\]/.test(s))
    return {
      valid: false,
      reason: "Name can't include numbers or symbols",
      score: 0.1,
      suggestion,
    };

  if (BLACKLIST.has(s.toLowerCase()))
    return {
      valid: false,
      reason: "That looks like a placeholder, not a real name",
      score: 0.05,
      suggestion,
    };

  if (GIBBERISH_FRAG.test(s))
    return {
      valid: false,
      reason: "That name looks random or gibberish",
      score: 0.2,
      suggestion,
    };

  if (hasTooManyRepeats(s))
    return {
      valid: false,
      reason: "Name has too many repeating characters",
      score: 0.25,
      suggestion,
    };

  const vcr = vowelConsonantWeirdnessRatio(s);
  if (s.length >= 7 && (vcr < 0.2 || vcr > 0.85))
    return {
      valid: false,
      reason: "That name doesn't look natural",
      score: 0.3,
      suggestion,
    };

  const words = s.split(" ").filter(Boolean);
  if (words.length > 4)
    return {
      valid: false,
      reason: "Name has too many words",
      score: 0.2,
      suggestion,
    };

  // Looks good
  return { valid: true, score: 0.95, suggestion };
}
