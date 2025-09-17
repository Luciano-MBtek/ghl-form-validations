export function getRecaptchaEnabled(): boolean {
  const enabled =
    String(process.env.RECAPTCHA_ENABLED || "").toLowerCase() === "true";
  // debug removed
  return enabled;
}

export function getRecaptchaSiteKey(): string | null {
  const key = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || null;
  // debug removed
  return key;
}

export function getRecaptchaSecret(): string | null {
  const v = process.env.RECAPTCHA_SECRET;
  const out = v && v.trim() ? v.trim() : null;
  // debug removed
  return out;
}

export function getRecaptchaSlugs(): string[] {
  const raw = process.env.RECAPTCHA_FOR_SLUGS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => Boolean(s));
}

export function getPublicRecaptchaSlugs(): string[] {
  const raw =
    process.env.NEXT_PUBLIC_RECAPTCHA_FOR_SLUGS ??
    process.env.RECAPTCHA_FOR_SLUGS ??
    "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Safe on server/client
export function isRecaptchaRequiredForSlug(
  slug: string,
  formCaptcha?: boolean
): boolean {
  if (formCaptcha === true) {
    return true;
  }
  const list = getPublicRecaptchaSlugs();
  const required = list.includes(slug);
  // debug removed
  return required;
}
