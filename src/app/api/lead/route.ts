import { NextRequest, NextResponse } from "next/server";
import { validateEmail, validatePhone } from "@/lib/validate";
import { isBlockedEmailPrefix } from "@/lib/emailBlock";
import { getFormBySlug } from "@/lib/formsRegistry";
import {
  lcUpsertContact,
  lcCreateContact,
  lcUpdateContact,
  lcGetContactsByQuery,
  toE164FromNational,
  pickContactId,
  addContactToWorkflow,
} from "@/lib/leadconnector";
import { resolveOptionLabel } from "@/lib/options";

export const runtime = "nodejs";

type LeadPayload = {
  formSlug?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  consentTransactional: boolean;
  consentMarketing?: boolean;
  country?: string;
  answers?: Record<string, any>; // Dynamic form answers
  customFields?: { id: string; value: string }[]; // Legacy support
  tags?: string[]; // Additional tags for forms-go
  meta?: Record<string, string | undefined>; // Hidden meta for forms-go
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

    let body: LeadPayload;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, message: "Invalid JSON" },
        { status: 400 }
      );
    }

    const errors: Record<string, string> = {};
    const form = body.formSlug ? getFormBySlug(body.formSlug) : undefined;
    if (!form) {
      return NextResponse.json(
        { ok: false, message: "Form not found" },
        { status: 404 }
      );
    }
    if (!body.firstName?.trim()) errors.firstName = "First name is required";
    if (!body.lastName?.trim()) errors.lastName = "Last name is required";
    if (!body.email?.trim()) errors.email = "Email is required";
    if (!body.phone?.trim()) errors.phone = "Phone is required";
    if (body.consentTransactional !== true)
      errors.consentTransactional = "Transactional consent required";

    // Blocked prefix short-circuit
    const block = isBlockedEmailPrefix(body.email);
    if (block.blocked) {
      return NextResponse.json(
        {
          ok: false,
          message: "Email is not accepted.",
          errors: { email: "This email address isn’t accepted." },
        },
        { status: 400 }
      );
    }

    // Revalidation - only block on hard failures
    const emailR = await validateEmail(body.email);
    if (emailR.valid === false) {
      errors.email = emailR.reason || "email_invalid";
    }

    const phoneR = await validatePhone(body.phone, body.country);
    if (phoneR.valid === false) {
      errors.phone = phoneR.reason || "phone_invalid";
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ ok: false, errors }, { status: 422 });
    }

    // --- 1) Build CFs array (labels) ---
    const customFieldsArray: Array<{ id: string; value: string }> = [];
    for (const field of form.sections?.flatMap((s: any) => s.fields) ?? []) {
      // only fields that map to a CF id
      if (!("mapCustomFieldId" in field) || !field.mapCustomFieldId) continue;
      const key = field.id;
      const raw = body.answers?.[key];
      if (raw == null) continue;

      // normalize to labels
      let value = "";
      if (Array.isArray(raw)) {
        const labels = raw
          .map((v: string) => resolveOptionLabel(v, field.options))
          .filter(Boolean) as string[];
        value = labels.join(", ");
      } else if (typeof raw === "string") {
        value = resolveOptionLabel(raw, field.options) ?? raw; // fallback to raw to avoid dropping
      }
      if (value.trim().length === 0) continue;

      customFieldsArray.push({ id: field.mapCustomFieldId, value });
    }

    // Handle meta fields from forms-go (store as custom fields if we have a Notes field)
    if (body.meta && Object.keys(body.meta).length > 0) {
      // Find a Notes custom field to store meta data
      const notesField = form.sections
        ?.flatMap((s: any) => s.fields)
        ?.find(
          (f: any) =>
            f.mapCustomFieldId && f.label?.toLowerCase().includes("note")
        );
      if (notesField?.mapCustomFieldId) {
        const metaString = Object.entries(body.meta)
          .filter(([_, v]) => v)
          .map(([k, v]) => `${k}: ${v}`)
          .join("; ");
        if (metaString) {
          customFieldsArray.push({
            id: notesField.mapCustomFieldId,
            value: metaString,
          });
        }
      }
    }
    // debug removed

    // --- 2) Base payload (no CFs) ---
    const phoneE164 = toE164FromNational(body.phone, body.country || "US");
    const tags = [
      ...(form.tags || []),
      ...(body.tags || []), // Additional tags from forms-go
      body.consentMarketing ? "MarketingOptIn" : null,
      emailR.valid === null ? "EmailUnknown" : null,
      phoneR.valid === null ? "PhoneUnknown" : null,
    ].filter(Boolean) as string[];

    const basePayload: any = {
      locationId: form.locationId || process.env.LC_LOCATION_ID || "",
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      phone: phoneE164,
      country: body.country || "US",
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
    } catch (err: any) {
      // upsert not available → try create
      if (err?.status === 404 || err?.status === 405) {
        try {
          const created = await lcCreateContact(basePayload);
          contactId = pickContactId(created);
        } catch (ce: any) {
          // duplicate → extract meta.contactId and update base fields
          const dupId =
            ce?.details?.meta?.contactId ??
            ce?.meta?.contactId ??
            ce?.response?.data?.meta?.contactId;
          if (!dupId) throw ce;
          contactId = dupId;
          // debug removed
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
          // debug removed
        } catch (e) {}
      }
      if (!contactId && phoneE164) {
        try {
          const found = await lcGetContactsByQuery(phoneE164, locId);
          contactId =
            pickContactId(found?.contacts?.[0]) ?? found?.contacts?.[0]?.id;
          // debug removed
        } catch (e) {}
      }
    }

    // bail out loudly if we still don't have an id
    if (!contactId) {
      return NextResponse.json(
        {
          ok: false,
          message: "No contactId returned; cannot write custom fields",
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
      } catch (e) {
        // ignore failure
      }
    }

    if (contactId && form.workflowId) {
      try {
        await addContactToWorkflow(
          contactId,
          form.workflowId,
          form.locationId || ""
        );
      } catch (e) {
        // ignore
      }
    }

    return NextResponse.json({ ok: true, contactId, sentCFs });
  } catch (e: any) {
    const status = e?.status || 500;
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "Server error",
        status,
        source: "lead",
        details: e?.body || null,
        path: e?.path || null,
      },
      { status }
    );
  }
}
