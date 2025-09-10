import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Only allow in development
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Diagnostic endpoint only available in development" },
      { status: 404 }
    );
  }

  try {
    // Check required environment variables
    if (
      !process.env.LC_PRIVATE_TOKEN ||
      !process.env.LC_BASE_URL ||
      !process.env.LC_LOCATION_ID
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing required environment variables",
          hasToken: !!process.env.LC_PRIVATE_TOKEN,
          hasBaseUrl: !!process.env.LC_BASE_URL,
          hasLocationId: !!process.env.LC_LOCATION_ID,
        },
        { status: 500 }
      );
    }

    const base = process.env.LC_BASE_URL!;
    const version = process.env.LC_API_VERSION || "2021-07-28";
    const token = process.env.LC_PRIVATE_TOKEN!;
    const loc = process.env.LC_LOCATION_ID!;

    console.log("[diag/status] testing location access:", {
      version,
      locationId: loc,
    });

    const res = await fetch(`${base}/locations/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: version,
        "Location-Id": loc,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    let body: any = null;
    try {
      body = await res.json();
    } catch {}

    console.log("[diag/status] response:", {
      status: res.status,
      statusText: res.statusText,
      hasBody: !!body,
      traceId: body?.traceId,
    });

    if (res.ok) {
      return NextResponse.json({
        ok: true,
        status: res.status,
        location: body,
        version,
      });
    }

    return NextResponse.json({
      ok: false,
      status: res.status,
      statusText: res.statusText,
      body,
      version,
      traceId: body?.traceId,
    });
  } catch (error: any) {
    console.error("[diag/status] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Status diagnostic failed",
        version: process.env.LC_API_VERSION || "2021-07-28",
      },
      { status: 500 }
    );
  }
}
