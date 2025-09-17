import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const calendarId = searchParams.get("calendarId");

    if (!calendarId) {
      return NextResponse.json(
        { error: "calendarId query parameter is required" },
        { status: 400 }
      );
    }

    const version = process.env.LC_API_VERSION || "2021-07-28";
    const locationId = process.env.LC_LOCATION_ID;

    const url = `${process.env.LC_BASE_URL}/calendars/${encodeURIComponent(
      calendarId
    )}`;
    const headers = {
      Authorization: `Bearer ${process.env.LC_PRIVATE_TOKEN}`,
      Version: version,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(locationId && { "Location-Id": locationId }),
    };

    // debug removed

    const response = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    let body: any = null;
    try {
      body = await response.json();
    } catch {}

    // debug removed

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body,
      traceId: body?.traceId,
      locationIdUsed: !!locationId,
      version,
    });
  } catch (error: any) {
    console.error("[diag/calendar] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Calendar diagnostic failed",
        locationIdUsed: !!process.env.LC_LOCATION_ID,
      },
      { status: 500 }
    );
  }
}
