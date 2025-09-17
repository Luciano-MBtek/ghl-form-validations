import { NextResponse } from "next/server";
import { verifyRecaptchaV2 } from "@/lib/recaptcha";

export async function POST(req: Request) {
  try {
    const { token } = await req.json();
    const ipHeader = (req.headers.get("x-forwarded-for") || "")
      .split(",")[0]
      .trim();
    const ip = ipHeader || undefined;
    const out = await verifyRecaptchaV2(token, ip);
    return NextResponse.json(
      { ok: out.ok, reason: out.ok ? undefined : out.reason },
      { status: out.ok ? 200 : 400 }
    );
  } catch {
    return NextResponse.json(
      { ok: false, reason: "bad-request" },
      { status: 400 }
    );
  }
}
