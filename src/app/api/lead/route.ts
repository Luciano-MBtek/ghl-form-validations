import { NextRequest, NextResponse } from "next/server";
import { validateEmail, validatePhone } from "@/lib/validate";
import { getFormBySlug } from "@/lib/formsRegistry";
import {
  lcUpsertContact,
  lcCreateContact,
  lcUpdateContact,
  toE164FromNational,
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

    // 1) Build customFields array (labels must match GHL exactly)
    const customFieldsArray: Array<{ id: string; value: string }> = [];
    for (const f of form.sections?.flatMap((s: any) => s.fields) ?? []) {
      if (!("mapCustomFieldId" in f) || !f.mapCustomFieldId) continue;
      const key = f.id; // 'budget', 'squareFeet', ...
      const raw = body.answers?.[key]; // internal code(s)
      if (raw == null) continue;

      // normalize to labels
      let value = "";
      if (Array.isArray(raw)) {
        const labels = raw
          .map((v: string) => resolveOptionLabel(v, f.options))
          .filter(Boolean) as string[];
        value = labels.join(", ");
      } else if (typeof raw === "string") {
        value = resolveOptionLabel(raw, f.options) ?? raw; // fallback to raw to avoid dropping
      }
      if (value.trim().length === 0) continue;

      customFieldsArray.push({ id: f.mapCustomFieldId, value });
    }
    console.log("[lead] CFs resolved", customFieldsArray);

    // 2) Prepare base payload (NO customFields here)
    const phoneE164 = toE164FromNational(body.phone, body.country || "US");
    const tags = [
      ...(form.tags || []),
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
      tags, // whatever you already computed
      source: form.name,
    };

    // 3) Upsert → fallback create → fallback update-existing
    const extractId = (d: any): string | undefined =>
      d?.contact?.id ??
      d?.id ??
      d?.data?.id ??
      d?.contactId ??
      d?.contact?.contactId;

    let contactId: string | undefined;
    let upsertResp: any;

    try {
      upsertResp = await lcUpsertContact(basePayload);
      contactId = extractId(upsertResp);
    } catch (e: any) {
      // Upsert not available? try create
      if (e?.status === 404 || e?.status === 405) {
        try {
          const created = await lcCreateContact(basePayload);
          contactId = extractId(created);
        } catch (ce: any) {
          // duplicate on create → use meta.contactId and update
          const dupId =
            ce?.details?.meta?.contactId ??
            ce?.meta?.contactId ??
            ce?.response?.data?.meta?.contactId;
          if (!dupId) throw ce;
          contactId = dupId;
          await lcUpdateContact(dupId, basePayload); // update base fields
        }
      } else {
        throw e;
      }
    }

    if (!contactId) {
      console.warn("[lead] no contactId from upsert/create", { upsertResp });
      return NextResponse.json(
        { ok: false, message: "No contactId returned" },
        { status: 502 }
      );
    }

    // 4) PUT custom fields ONLY (don't overwrite tags on PUT)
    let sentCFs = 0;
    if (customFieldsArray.length) {
      try {
        await lcUpdateContact(contactId, { customFields: customFieldsArray });
        sentCFs = customFieldsArray.length;
      } catch (e) {
        console.warn("[lead] failed to update CFs", e);
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
        console.warn("workflow_enroll_failed", e);
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
