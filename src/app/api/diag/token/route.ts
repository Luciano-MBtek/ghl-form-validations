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
    if (!process.env.LC_PRIVATE_TOKEN || !process.env.LC_BASE_URL) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing required environment variables",
          hasToken: !!process.env.LC_PRIVATE_TOKEN,
          hasBaseUrl: !!process.env.LC_BASE_URL,
        },
        { status: 500 }
      );
    }

    const version = process.env.LC_API_VERSION || "2021-07-28";
    const locationId = process.env.LC_LOCATION_ID;

    const url = `${process.env.LC_BASE_URL}/users/me`;
    const headers = {
      Authorization: `Bearer ${process.env.LC_PRIVATE_TOKEN}`,
      Version: version,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(locationId && { "Location-Id": locationId }),
    };

    console.log("[diag/token] testing token with headers:", {
      version,
      hasLocationId: !!locationId,
      locationIdHeaderUsed: !!locationId,
    });

    const response = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      let errorData: any = null;
      try {
        errorData = await response.json();
      } catch {}

      console.error("[diag/token] token test failed:", {
        status: response.status,
        data: errorData,
        traceId: errorData?.traceId,
      });

      return NextResponse.json(
        {
          ok: false,
          status: response.status,
          error: errorData?.message || "Token validation failed",
          traceId: errorData?.traceId,
          locationIdHeaderUsed: !!locationId,
        },
        { status: response.status }
      );
    }

    const me = await response.json();

    return NextResponse.json({
      ok: true,
      locationIdHeaderUsed: !!locationId,
      me: {
        id: me.id,
        firstName: me.firstName,
        lastName: me.lastName,
        email: me.email,
        locationId: me.locationId,
        role: me.role,
        permissions: me.permissions,
      },
      version,
    });
  } catch (error: any) {
    console.error("[diag/token] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Token diagnostic failed",
        locationIdHeaderUsed: !!process.env.LC_LOCATION_ID,
      },
      { status: 500 }
    );
  }
}
