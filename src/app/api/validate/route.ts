import { NextRequest, NextResponse } from "next/server";
import { validateEmailAndPhone } from "@/lib/validate";
import { rateLimit } from "@/lib/rateLimit";
import { config } from "@/lib/config";

function getIp(req: NextRequest): string {
  // Common headers in Vercel/Next
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getIp(req);
  const rl = await rateLimit(ip, config.rateLimitPerMin, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { message: "Too many requests. Please try again in a moment." },
      {
        status: 429,
        headers: { "X-RateLimit-Remaining": String(rl.remaining) },
      }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email : undefined;
  const phone = typeof body.phone === "string" ? body.phone : undefined;
  const country = typeof body.country === "string" ? body.country : undefined;

  try {
    // quick heuristic for obviously bad email to avoid API calls
    if (email) {
      const e = String(email).trim();
      if (!e.includes("@") || /\.$/.test(e)) {
        return NextResponse.json({
          emailValid: false,
          emailReason: "bad_format",
          echoEmail: email,
          phoneValid: phone ? undefined : undefined,
          phoneReason: phone ? undefined : undefined,
        });
      }
    }
    const res = await validateEmailAndPhone(email, phone, country);
    return NextResponse.json({
      emailValid: res.emailValid ?? undefined,
      emailReason: res.emailReason ?? undefined,
      phoneValid: res.phoneValid ?? undefined,
      phoneReason: res.phoneReason ?? undefined,
      echoEmail: res.echoEmail,
      echoPhone: res.echoPhone,
    });
  } catch (e) {
    // Soft pass on unexpected errors
    return NextResponse.json({
      emailValid: email ? true : undefined,
      emailReason: email ? "timeout_soft_pass" : undefined,
      phoneValid: phone ? true : undefined,
      phoneReason: phone ? "timeout_soft_pass" : undefined,
    });
  }
}
