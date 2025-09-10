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
    const base =
      process.env.LC_BASE_URL || "https://services.leadconnectorhq.com";
    const version = process.env.LC_API_VERSION || "2021-07-28";
    const calendarVersion = process.env.LC_CALENDAR_API_VERSION || "2021-04-15";
    const token = process.env.LC_PRIVATE_TOKEN || "YOUR_TOKEN_HERE";
    const locationId = process.env.LC_LOCATION_ID || "YOUR_LOCATION_ID_HERE";

    // Headers for calendar operations (free-slots)
    const calendarHeaders = {
      Authorization: `Bearer ${token}`,
      Version: calendarVersion,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Location-Id": locationId,
    };

    // Headers for appointment operations
    const appointmentHeaders = {
      Authorization: `Bearer ${token}`,
      Version: version,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Location-Id": locationId,
    };

    // Headers for location operations
    const locationHeaders = {
      Authorization: `Bearer ${token}`,
      Version: version,
      Accept: "application/json",
      "Location-Id": locationId,
    };

    return NextResponse.json({
      ok: true,
      baseUrl: base,
      versions: {
        main: version,
        calendar: calendarVersion,
      },
      headers: {
        calendar: {
          description:
            "Headers for free-slots requests (GET /calendars/:id/free-slots)",
          headers: calendarHeaders,
        },
        appointment: {
          description:
            "Headers for appointment creation (POST /calendars/events/appointments)",
          headers: appointmentHeaders,
        },
        location: {
          description: "Headers for location requests (GET /locations/me)",
          headers: locationHeaders,
        },
      },
      environment: {
        hasToken: !!process.env.LC_PRIVATE_TOKEN,
        hasBaseUrl: !!process.env.LC_BASE_URL,
        hasLocationId: !!process.env.LC_LOCATION_ID,
        tokenLength: process.env.LC_PRIVATE_TOKEN?.length || 0,
        locationIdLength: process.env.LC_LOCATION_ID?.length || 0,
      },
    });
  } catch (error: any) {
    console.error("[diag/echo-headers] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Echo headers diagnostic failed",
      },
      { status: 500 }
    );
  }
}
