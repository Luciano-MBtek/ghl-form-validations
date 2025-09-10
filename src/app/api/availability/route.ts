import { NextRequest, NextResponse } from "next/server";
import { lcGetFreeSlots } from "@/lib/leadconnector";
import { getFormBySlug } from "@/lib/formsRegistry";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // Check required environment variables
    if (!process.env.LC_PRIVATE_TOKEN || !process.env.LC_BASE_URL) {
      console.error("[availability] missing required env vars", {
        hasToken: !!process.env.LC_PRIVATE_TOKEN,
        hasBaseUrl: !!process.env.LC_BASE_URL,
      });
      return NextResponse.json(
        { error: "Server configuration error. Please contact support." },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const tz = searchParams.get("tz");

    // Validate required parameters
    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    // Get form configuration
    const form = getFormBySlug(slug);
    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }

    // Validate booking configuration
    if (!form.booking?.enabled) {
      return NextResponse.json(
        { error: "Booking not enabled for this form" },
        { status: 400 }
      );
    }

    if (!form.booking?.calendarId) {
      const envKey = (form as any).booking?.calendarIdEnv;
      console.error("[availability] missing calendar ID", {
        slug,
        envKey,
      });
      return NextResponse.json(
        {
          error: `Calendar ID not configured for form "${slug}". Please check environment variable: ${envKey}`,
        },
        { status: 500 }
      );
    }

    const timezone =
      tz || process.env.BOOKING_TIMEZONE_DEFAULT || "America/New_York";
    const calendarId = form.booking.calendarId;

    // Parse dates and convert to epoch milliseconds
    let startDateMs: number;
    let endDateMs: number;

    if (start && end) {
      // Parse provided dates (ISO YYYY-MM-DD or epoch ms)
      const startDate = start.includes("-")
        ? new Date(start + "T00:00:00")
        : new Date(parseInt(start));
      const endDate = end.includes("-")
        ? new Date(end + "T23:59:59")
        : new Date(parseInt(end));

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json(
          {
            error: "Invalid date format. Use YYYY-MM-DD or epoch milliseconds",
          },
          { status: 400 }
        );
      }

      startDateMs = startDate.getTime();
      endDateMs = endDate.getTime();
    } else {
      // Default: today + 14 days
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 14);

      startDateMs = today.getTime();
      endDateMs = endDate.getTime();
    }

    // Guard: ensure we have valid milliseconds and range <= 31 days
    if (!Number.isInteger(startDateMs) || !Number.isInteger(endDateMs)) {
      return NextResponse.json(
        { error: "Invalid date range - must be valid timestamps" },
        { status: 400 }
      );
    }

    const rangeMs = endDateMs - startDateMs;
    const maxRangeMs = 31 * 24 * 60 * 60 * 1000; // 31 days in ms
    if (rangeMs > maxRangeMs) {
      // Trim end date to 31 days
      endDateMs = startDateMs + maxRangeMs;
      console.warn("[availability] trimmed end date to 31-day range", {
        originalEnd: new Date(endDateMs + rangeMs - maxRangeMs).toISOString(),
        trimmedEnd: new Date(endDateMs).toISOString(),
      });
    }

    console.debug("[availability] inputs", {
      slug,
      calendarId,
      startDateMs,
      endDateMs,
      timezone,
    });

    // Fetch availability from LeadConnector
    const rawResponse = await lcGetFreeSlots({
      calendarId,
      startDateMs,
      endDateMs,
      timezone,
    });

    console.log("[availability] raw", {
      slug,
      calendarId,
      responseKeys: Object.keys(rawResponse),
      hasSlots: Array.isArray(rawResponse.slots),
      hasDates: !!rawResponse._dates_,
      hasDateKeys: Object.keys(rawResponse).some((key) =>
        /^\d{4}-\d{2}-\d{2}$/.test(key)
      ),
    });

    // Normalize response to flat array format
    let normalizedSlots: string[] = [];
    const traceId = rawResponse.traceId;

    if (Array.isArray(rawResponse.slots)) {
      // Case A: Flat array format
      normalizedSlots = rawResponse.slots.filter(Boolean);
    } else if (rawResponse._dates_ && typeof rawResponse._dates_ === "object") {
      // Case B: Nested under _dates_
      const datesObj = rawResponse._dates_;
      for (const [dateKey, dayData] of Object.entries(datesObj)) {
        if (
          dayData &&
          typeof dayData === "object" &&
          Array.isArray(dayData.slots)
        ) {
          normalizedSlots.push(...dayData.slots.filter(Boolean));
        }
      }
    } else {
      // Case B: Top-level date keys (YYYY-MM-DD format)
      for (const [key, value] of Object.entries(rawResponse)) {
        if (
          /^\d{4}-\d{2}-\d{2}$/.test(key) &&
          value &&
          typeof value === "object" &&
          Array.isArray(value.slots)
        ) {
          normalizedSlots.push(...value.slots.filter(Boolean));
        }
      }
    }

    // Sort slots by datetime ISO string
    normalizedSlots.sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    console.log("[availability] normalized", {
      slug,
      calendarId,
      count: normalizedSlots.length,
      traceId,
    });

    return NextResponse.json({
      ok: true,
      slots: normalizedSlots,
      ...(traceId && { traceId }),
    });
  } catch (error: any) {
    const status = error?.status || 500;
    const body = error?.response?.data || { message: error.message };

    console.error("[availability] failed", {
      status,
      body,
      traceId: error?.traceId,
    });

    return NextResponse.json(
      {
        error: "LeadConnector availability failed",
        detail: body,
        traceId: error?.traceId,
      },
      { status }
    );
  }
}
