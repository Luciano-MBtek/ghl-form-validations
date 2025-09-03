import { NextResponse } from "next/server";
import { validateEmail, validatePhone } from "@/lib/validate";
import { rateLimit } from "@/lib/rateLimit";

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

    const { email, phone, country } = await req.json().catch(() => ({}));

    let emailResp = undefined;
    if (typeof email === "string") {
      const r = await validateEmail(email);
      emailResp = {
        emailValid: r.valid,
        emailReason: r.reason,
        echoEmail: email,
      };
    }

    let phoneResp = undefined;
    if (typeof phone === "string") {
      const r = await validatePhone(phone, country);
      phoneResp = {
        phoneValid: r.valid,
        phoneReason: r.reason,
        echoPhone: phone,
      };
    }

    return NextResponse.json({
      ...(emailResp ?? {}),
      ...(phoneResp ?? {}),
    });
  } catch (error) {
    console.error("Validation error:", error);
    return NextResponse.json(
      { error: "Validation service temporarily unavailable" },
      { status: 500 }
    );
  }
}
