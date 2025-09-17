export type RecaptchaResult = { ok: true } | { ok: false; reason: string };

export async function verifyRecaptchaV2(
  token: string,
  ip?: string
): Promise<RecaptchaResult> {
  try {
    if (!token) return { ok: false, reason: "missing-token" };
    const secret = process.env.RECAPTCHA_SECRET;
    if (!secret) return { ok: false, reason: "missing-secret" };

    const params = new URLSearchParams();
    params.set("secret", secret);
    params.set("response", token);
    if (ip) params.set("remoteip", ip);

    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      cache: "no-store",
    });

    const data: any = await res.json().catch(() => ({}));
    if (data?.success === true) return { ok: true };
    const code = Array.isArray(data?.["error-codes"])
      ? data["error-codes"].join(",")
      : "unknown";
    return { ok: false, reason: `provider:${code}` };
  } catch (e: any) {
    return { ok: false, reason: `exception:${e?.message ?? "error"}` };
  }
}
