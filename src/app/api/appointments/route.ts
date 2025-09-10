import { NextRequest, NextResponse } from "next/server";
import { validateEmail, validatePhone } from "@/lib/validate";
import { getFormBySlug } from "@/lib/formsRegistry";
import {
  lcUpsertContact,
  lcCreateContact,
  lcUpdateContact,
  lcGetContactsByQuery,
  toE164FromNational,
  pickContactId,
  lcCreateAppointment,
  addContactToWorkflow,
} from "@/lib/leadconnector";
import { resolveOptionLabel } from "@/lib/options";
import { isWeekendISO, isSameDayISO } from "@/lib/time";

export const runtime = "nodejs";

type AppointmentPayload = {
  formSlug: string;
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    country?: string;
  };
  answers?: Record<string, any>;
  timezone: string;
  startISO: string;
};

export async function POST(req: NextRequest) {
  try {
    const envMissing = [
      "LC_PRIVATE_TOKEN",
      "LC_API_VERSION",
      "LC_BASE_URL",
    ].filter((k) => !process.env[k]);
    if (envMissing.length) {
      return NextResponse.json(
        { ok: false, message: `Missing env vars: ${envMissing.join(", ")}` },
        { status: 500 }
      );
    }

    let body: AppointmentPayload;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, message: "Invalid JSON" },
        { status: 400 }
      );
    }

    // Validate required fields
    const errors: Record<string, string> = {};
    if (!body.formSlug) errors.formSlug = "Form slug is required";
    if (!body.contact?.firstName?.trim())
      errors.firstName = "First name is required";
    if (!body.contact?.lastName?.trim())
      errors.lastName = "Last name is required";
    if (!body.contact?.email?.trim()) errors.email = "Email is required";
    if (!body.contact?.phone?.trim()) errors.phone = "Phone is required";
    if (!body.startISO) errors.startISO = "Start time is required";
    if (!body.timezone) errors.timezone = "Timezone is required";

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ ok: false, errors }, { status: 422 });
    }

    // Get form configuration
    const form = getFormBySlug(body.formSlug);
    if (!form) {
      return NextResponse.json(
        { ok: false, message: "Form not found" },
        { status: 404 }
      );
    }

    // Validate booking configuration
    if (!form.booking?.enabled) {
      return NextResponse.json(
        { ok: false, message: "Booking not enabled for this form" },
        { status: 400 }
      );
    }

    if (!form.booking?.calendarId) {
      const envKey = (form as any).booking?.calendarIdEnv;
      console.error(
        `[appointments] Missing calendar ID for form "${body.formSlug}". Expected env var: ${envKey}`
      );
      return NextResponse.json(
        {
          ok: false,
          message: `Calendar ID not configured for form "${body.formSlug}". Please check environment variable: ${envKey}`,
        },
        { status: 500 }
      );
    }

    // Server-side validation (only block on hard failures)
    const emailR = await validateEmail(body.contact.email);
    if (emailR.valid === false) {
      errors.email = emailR.reason || "email_invalid";
    }

    const phoneR = await validatePhone(
      body.contact.phone,
      body.contact.country
    );
    if (phoneR.valid === false) {
      errors.phone = phoneR.reason || "phone_invalid";
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ ok: false, errors }, { status: 422 });
    }

    console.log("[booking] creating appointment", {
      formSlug: body.formSlug,
      timezone: body.timezone,
      startISO: body.startISO,
    });

    // --- 1) Build CFs array (labels) ---
    const customFieldsArray: Array<{ id: string; value: string }> = [];
    for (const field of form.sections?.flatMap((s: any) => s.fields) ?? []) {
      if (!("mapCustomFieldId" in field) || !field.mapCustomFieldId) continue;
      const key = field.id;
      const raw = body.answers?.[key];
      if (raw == null) continue;

      let value = "";
      if (Array.isArray(raw)) {
        const labels = raw
          .map((v: string) => resolveOptionLabel(v, field.options))
          .filter(Boolean) as string[];
        value = labels.join(", ");
      } else if (typeof raw === "string") {
        value = resolveOptionLabel(raw, field.options) ?? raw;
      }
      if (value.trim().length === 0) continue;

      customFieldsArray.push({ id: field.mapCustomFieldId, value });
    }
    console.log("[booking] CFs resolved:", customFieldsArray);

    // --- 2) Base payload (no CFs) ---
    const phoneE164 = toE164FromNational(
      body.contact.phone,
      body.contact.country || "US"
    );
    const tags = [
      ...(form.tags || []),
      "AppointmentBooked",
      emailR.valid === null ? "EmailUnknown" : null,
      phoneR.valid === null ? "PhoneUnknown" : null,
    ].filter(Boolean) as string[];

    const basePayload: any = {
      locationId: form.locationId || process.env.LC_LOCATION_ID || "",
      firstName: body.contact.firstName,
      lastName: body.contact.lastName,
      email: body.contact.email,
      phone: phoneE164,
      country: body.contact.country || "US",
      tags,
      source: form.slug,
    };

    // --- 3) Upsert payload (BEST-EFFORT includes CFs) ---
    const upsertPayload = {
      ...basePayload,
      ...(customFieldsArray.length ? { customFields: customFieldsArray } : {}),
    };

    let contactId: string | undefined;
    let rawUpsert: any;

    try {
      rawUpsert = await lcUpsertContact(upsertPayload);
      contactId = pickContactId(rawUpsert);
      console.log("[booking] upsert -> id:", contactId);
    } catch (err: any) {
      if (err?.status === 404 || err?.status === 405) {
        try {
          const created = await lcCreateContact(basePayload);
          contactId = pickContactId(created);
          console.log("[booking] create -> id:", contactId);
        } catch (ce: any) {
          const dupId =
            ce?.details?.meta?.contactId ??
            ce?.meta?.contactId ??
            ce?.response?.data?.meta?.contactId;
          if (!dupId) throw ce;
          contactId = dupId;
          console.log(
            "[booking] duplicate create, using meta.contactId:",
            dupId
          );
          await lcUpdateContact(dupId, basePayload);
        }
      } else {
        throw err;
      }
    }

    // --- 4) If still no id, LOOK IT UP by email then phone ---
    if (!contactId) {
      const locId = basePayload.locationId;
      if (basePayload.email) {
        try {
          const found = await lcGetContactsByQuery(basePayload.email, locId);
          contactId =
            pickContactId(found?.contacts?.[0]) ?? found?.contacts?.[0]?.id;
          if (contactId)
            console.log("[booking] recovered id by email:", contactId);
        } catch (e) {}
      }
      if (!contactId && phoneE164) {
        try {
          const found = await lcGetContactsByQuery(phoneE164, locId);
          contactId =
            pickContactId(found?.contacts?.[0]) ?? found?.contacts?.[0]?.id;
          if (contactId)
            console.log("[booking] recovered id by phone:", contactId);
        } catch (e) {}
      }
    }

    if (!contactId) {
      console.warn("[booking] no contactId after upsert/create/search", {
        rawUpsert,
      });
      return NextResponse.json(
        {
          ok: false,
          message: "No contactId returned; cannot create appointment",
        },
        { status: 502 }
      );
    }

    // --- 5) Always PUT CFs once we have id (guarantee persistence) ---
    let sentCFs = 0;
    if (customFieldsArray.length) {
      try {
        await lcUpdateContact(contactId, { customFields: customFieldsArray });
        sentCFs = customFieldsArray.length;
        console.log("[booking] custom fields updated:", sentCFs);
      } catch (e) {
        console.warn("[booking] failed to PUT customFields:", e);
      }
    }

    // --- 6) Create appointment ---
    const locationId = form.locationId || process.env.LC_LOCATION_ID;
    if (!locationId) {
      console.error("[booking] missing locationId for appointment creation", {
        formSlug: body.formSlug,
        formLocationId: form.locationId,
        envLocationId: process.env.LC_LOCATION_ID,
      });
      return NextResponse.json(
        {
          ok: false,
          message: "Location ID not configured for appointment creation",
        },
        { status: 500 }
      );
    }

    // Calculate end time (assume 1 hour duration for now)
    const startTime = new Date(body.startISO);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // +1 hour
    const startTimeIso = startTime.toISOString();
    const endTimeIso = endTime.toISOString();

    // Validate scheduling constraints
    const tz =
      form.booking?.timezone ||
      process.env.BOOKING_TIMEZONE_DEFAULT ||
      "America/New_York";
    const nowIso = new Date().toISOString();

    if (isSameDayISO(startTimeIso, nowIso, tz)) {
      return NextResponse.json(
        {
          ok: false,
          status: 400,
          message:
            "Same-day bookings are not allowed. Please choose a time starting tomorrow.",
        },
        { status: 400 }
      );
    }

    if (isWeekendISO(startTimeIso, tz)) {
      return NextResponse.json(
        {
          ok: false,
          status: 400,
          message:
            "Weekend bookings are not available. Please choose Monday–Friday.",
        },
        { status: 400 }
      );
    }

    // Compute appointment title from contact name
    const fullName = [
      body.contact?.firstName || "",
      body.contact?.lastName || "",
    ]
      .join(" ")
      .trim();
    const apptTitle = fullName || body.contact?.email || "Booking";

    console.log("[booking] try create", {
      slug: body.formSlug,
      loc: form.locationId,
      cal: form.booking.calendarId,
      start: startTimeIso,
      end: endTimeIso,
      tz: body.timezone,
      apptTitle,
    });

    let appointmentId: string;
    try {
      const appointment = await lcCreateAppointment({
        locationId,
        calendarId: form.booking.calendarId,
        contactId,
        startTimeIso,
        endTimeIso,
        timezone: body.timezone,
        title: apptTitle,
        notes: `Appointment booked via ${form.slug} form`,
        source: form.slug,
      });
      appointmentId = appointment.id;
      console.log("[booking] appointment created:", appointmentId);
    } catch (e: any) {
      console.error("[booking] appointment creation failed:", e);

      // Handle specific errors with helpful hints
      if (e?.status === 401) {
        return NextResponse.json(
          {
            ok: false,
            status: 401,
            hint: "Verify Sub-Account private token, scopes include calendars.events.write, Location-Id matches calendar's location, and LC_API_VERSION=2021-07-28. Some tenants require epoch ms for start/end.",
            traceId: e?.traceId,
            message: "Authentication failed for appointment creation",
            details: e?.body || e?.response?.data || null,
          },
          { status: 401 }
        );
      }

      // Handle 422 validation errors with detailed upstream body
      if (e?.status === 422) {
        return NextResponse.json(
          {
            ok: false,
            status: 422,
            message: "Appointment validation failed",
            details: e?.body || e?.response?.data || null,
            hint: "Check appointment payload format and required fields",
          },
          { status: 422 }
        );
      }

      // Handle slot taken error
      if (
        e?.status === 409 ||
        e?.message?.includes("slot") ||
        e?.message?.includes("taken")
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: "slot_taken",
            message:
              "This time slot is no longer available. Please select a different time.",
          },
          { status: 409 }
        );
      }

      throw e;
    }

    // --- 7) Add to workflow if configured ---
    if (contactId && form.workflowId) {
      try {
        await addContactToWorkflow(
          contactId,
          form.workflowId,
          form.locationId || ""
        );
        console.log("[booking] contact added to workflow:", form.workflowId);
      } catch (e) {
        console.warn("[booking] workflow enrollment failed:", e);
      }
    }

    return NextResponse.json({
      ok: true,
      contactId,
      appointmentId,
      sentCFs,
    });
  } catch (e: any) {
    console.error("[booking] appointment error:", e);
    const status = e?.status || 500;
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "Server error",
        status,
        source: "appointment",
        details: e?.body || e?.response?.data || null,
        path: e?.path || null,
        traceId: e?.traceId || null,
      },
      { status }
    );
  }
}
