import { NextResponse } from "next/server";
import { validateEmail, validatePhone } from "@/lib/validate";
import { validateHumanName } from "@/lib/name";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

function getClientIp(req: Request) {
  // Try common proxy headers; fall back to empty string
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";
  return ip;
}

export async function POST(req: Request) {
  try {
    // Rate limiting
    const ip =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rateLimitResult = await rateLimit(ip, 10, 60 * 1000); // 10 requests per minute

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const { email, phone, country, firstName, lastName } = await req
      .json()
      .catch(() => ({}));

    // Get client IP for ZeroBounce
    const clientIp = getClientIp(req);

    // Original email/phone validation (unchanged)
    let emailResp = undefined;
    if (typeof email === "string") {
      const r = await validateEmail(email, clientIp);
      emailResp = {
        emailValid: r.valid,
        emailReason: r.reason,
        emailConfidence: r.confidence,
        echoEmail: email,
      };
    }

    let phoneResp = undefined;
    if (typeof phone === "string") {
      const r = await validatePhone(phone, country);
      phoneResp = {
        phoneValid: r.valid,
        phoneReason: r.reason,
        phoneConfidence: r.confidence,
        phoneLineType: r.lineType,
        echoPhone: phone,
      };
    }

    const payload: any = {
      ...(emailResp ?? {}),
      ...(phoneResp ?? {}),
    };

    // ===== Name validation (non-destructive; do not alter email/phone logic) =====
    if (typeof firstName === "string") {
      const r = validateHumanName(firstName);
      payload.firstNameValid = r.valid;
      payload.firstNameReason = r.reason ?? "";
      payload.firstNameScore = r.score;
      payload.echoFirstName = firstName;
      if (r.suggestion) payload.firstNameSuggestion = r.suggestion;
    }

    if (typeof lastName === "string") {
      const r = validateHumanName(lastName);
      payload.lastNameValid = r.valid;
      payload.lastNameReason = r.reason ?? "";
      payload.lastNameScore = r.score;
      payload.echoLastName = lastName;
      if (r.suggestion) payload.lastNameSuggestion = r.suggestion;
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Validation error:", error);
    return NextResponse.json(
      { error: "Validation service temporarily unavailable" },
      { status: 500 }
    );
  }
}
