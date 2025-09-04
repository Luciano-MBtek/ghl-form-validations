import { NextRequest, NextResponse } from "next/server";
import { validateEmail, validatePhone } from "@/lib/validate";
import { getFormBySlug } from "@/lib/formsRegistry";
import { addContactToWorkflow, upsertContact } from "@/lib/leadconnector";
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

    // ---- Build customFields as ARRAY ----
    const fieldDefs = form.sections?.flatMap((s: any) => s.fields) ?? [];
    const answers = (body as any).answers ?? {};
    const customFieldsArray: Array<{ id: string; value: string }> = [];
    const extraTags: string[] = [];

    for (const f of fieldDefs) {
      if (!f.mapCustomFieldId) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[lead] skipping field without mapCustomFieldId", {
            key: f.id,
            type: f.type,
          });
        }
        continue;
      }
      if (!(f.id in answers)) continue;

      const raw = answers[f.id];

      // radio/select - resolve to option label
      if (f.type === "radio" || f.type === "select") {
        const v = resolveOptionLabel(raw, f.options);
        if (v == null) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[customField] unknown option", {
              key: f.id,
              raw,
              allowed: (f.options ?? []).map((o: any) => o.label),
            });
          }
          extraTags.push("UnknownOption");
          customFieldsArray.push({
            id: f.mapCustomFieldId,
            value: String(raw),
          });
        } else {
          customFieldsArray.push({ id: f.mapCustomFieldId, value: v });
        }
        continue;
      }

      // checkbox/checkbox-group → resolve each to label, then join
      if (f.type === "checkbox" || f.type === "checkbox-group") {
        const arr = Array.isArray(raw) ? raw : [raw];
        const labels = arr.map(
          (r) => resolveOptionLabel(r, f.options) ?? String(r)
        );
        const joined = labels.join(", ");
        customFieldsArray.push({ id: f.mapCustomFieldId, value: joined });
        continue;
      }

      // text/textarea/number/etc → stringify
      customFieldsArray.push({ id: f.mapCustomFieldId, value: String(raw) });
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[lead] final customFields (labels):", customFieldsArray);
    }

    const tags = [
      ...(form.tags || []),
      ...extraTags,
      body.consentMarketing ? "MarketingOptIn" : null,
      emailR.valid === null ? "EmailUnknown" : null,
      phoneR.valid === null ? "PhoneUnknown" : null,
    ].filter(Boolean) as string[];

    const created = await upsertContact({
      locationId: form.locationId || "",
      email: body.email,
      phone: body.phone,
      firstName: body.firstName,
      lastName: body.lastName,
      tags,
      source: form.name,
      customFieldsArray, // <— send array shape
    });
    const contactId =
      created?.contact?.id || created?.contact?._id || created?.id;

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

    return NextResponse.json({ ok: true, contactId }, { status: 200 });
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
