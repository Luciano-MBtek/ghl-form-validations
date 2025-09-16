import { NextRequest, NextResponse } from "next/server";
import { lcGetFreeSlots } from "@/lib/leadconnector";
import { getFormBySlug } from "@/lib/formsRegistry";
import { startOfTodayMs, nowEpoch, addMinutesEpoch } from "@/lib/time";

export const runtime = "nodejs";

// helper: build YYYY-MM-DD in a TZ
function ymdInTz(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

function isWeekendKey(ymd: string, tz: string): boolean {
  // Make a Date from YYYY-MM-DD *interpreted in tz* by appending noon to avoid DST edges:
  const localNoon = new Date(`${ymd}T12:00:00`);
  const wk = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(localNoon);
  return wk === "Sat" || wk === "Sun";
}

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
    let parsedStartMs: number | undefined;
    let parsedEndMs: number | undefined;

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

      parsedStartMs = startDate.getTime();
      parsedEndMs = endDate.getTime();
    }

    // clamp start to tomorrow 00:00 in tz
    const todayMs = startOfTodayMs(timezone);
    const tomorrowMs = todayMs + 24 * 60 * 60 * 1000;
    const startMs = Math.max(parsedStartMs ?? 0, tomorrowMs);
    let endMs = parsedEndMs ?? startMs + 14 * 24 * 60 * 60 * 1000;

    // Guard: ensure we have valid milliseconds and range <= 31 days
    if (!Number.isInteger(startMs) || !Number.isInteger(endMs)) {
      return NextResponse.json(
        { error: "Invalid date range - must be valid timestamps" },
        { status: 400 }
      );
    }

    const rangeMs = endMs - startMs;
    const maxRangeMs = 31 * 24 * 60 * 60 * 1000; // 31 days in ms
    if (rangeMs > maxRangeMs) {
      // Trim end date to 31 days
      endMs = startMs + maxRangeMs;
      console.warn("[availability] trimmed end date to 31-day range", {
        originalEnd: new Date(endMs + rangeMs - maxRangeMs).toISOString(),
        trimmedEnd: new Date(endMs).toISOString(),
      });
    }

    console.debug("[availability] inputs", {
      slug,
      calendarId,
      startMs,
      endMs,
      timezone,
    });

    // Fetch availability from LeadConnector
    const rawResponse = await lcGetFreeSlots({
      calendarId,
      startDateMs: startMs,
      endDateMs: endMs,
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

    // Filter by date key to hide today and weekends completely
    const todayKey = ymdInTz(new Date(), timezone);
    const filteredByDateKey: Record<string, { slots: string[] }> = {};
    const traceId = rawResponse.traceId;

    // Process the response and filter by date keys
    let rawSlots: Record<string, any> = {};

    if (Array.isArray(rawResponse.slots)) {
      // Case A: Flat array format - group by date
      const grouped: Record<string, string[]> = {};
      rawResponse.slots.filter(Boolean).forEach((slotISO: string) => {
        const date = new Date(slotISO);
        const dateKey = ymdInTz(date, timezone);
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(slotISO);
      });
      rawSlots = grouped;
    } else if (rawResponse._dates_ && typeof rawResponse._dates_ === "object") {
      // Case B: Nested under _dates_
      rawSlots = rawResponse._dates_;
    } else {
      // Case C: Top-level date keys (YYYY-MM-DD format)
      for (const [key, value] of Object.entries(rawResponse)) {
        if (
          /^\d{4}-\d{2}-\d{2}$/.test(key) &&
          value &&
          typeof value === "object" &&
          Array.isArray(value.slots)
        ) {
          rawSlots[key] = value;
        }
      }
    }

    // Lead time cutoff in epoch
    const lead = form.booking?.minLeadMinutes ?? 60;
    const cutoffEpoch = addMinutesEpoch(nowEpoch(), lead);

    // Filter by date key to hide today and weekends completely
    let weekendTodayDropped = 0;
    const slotsByDate: Record<string, { slots: string[] }> = {};
    for (const [ymd, obj] of Object.entries(rawSlots)) {
      if (ymd === todayKey || isWeekendKey(ymd, timezone)) {
        weekendTodayDropped++;
        continue;
      }
      const slots = Array.isArray(obj?.slots) ? obj.slots : [];
      slotsByDate[ymd] = { slots };
    }

    // Apply cutoff filtering using epoch only
    const filteredByCutoff: Record<string, { slots: string[] }> = {};
    for (const [dateKey, obj] of Object.entries(slotsByDate)) {
      const kept = (obj.slots ?? []).filter((iso: string) => {
        const slotEpoch = Date.parse(iso);
        return slotEpoch >= cutoffEpoch;
      });
      if (kept.length) filteredByCutoff[dateKey] = { slots: kept };
    }

    const totalSlots = Object.values(slotsByDate).reduce(
      (n, d) => n + (d.slots?.length ?? 0),
      0
    );
    const remainingSlots = Object.values(filteredByCutoff).reduce(
      (n, d) => n + (d.slots?.length ?? 0),
      0
    );
    console.log("[availability] cutoff filtering", {
      slug,
      lead,
      totalSlots,
      remainingSlots,
      dropped: totalSlots - remainingSlots,
      weekendTodayDropped,
    });

    console.log("[availability] filtered by date key", {
      slug,
      calendarId,
      todayKey,
      totalDateKeys: Object.keys(rawSlots).length,
      filteredDateKeys: Object.keys(filteredByDateKey).length,
      traceId,
    });

    return NextResponse.json({
      ok: true,
      slots: filteredByCutoff,
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
