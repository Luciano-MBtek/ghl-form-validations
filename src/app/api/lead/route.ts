import { NextRequest, NextResponse } from "next/server";
import { validateEmail, validatePhone } from "@/lib/validate";
import { getFormBySlug } from "@/lib/formsRegistry";
import { addContactToWorkflow, upsertContact } from "@/lib/leadconnector";

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
  customFields?: { id: string; value: string }[];
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

    // Build tags with confidence signals
    const tags = [
      ...(form.tags || []),
      body.consentMarketing ? "MarketingOptIn" : null,
      emailR.confidence === "low" ? "EmailLowScore" : null,
      emailR.confidence === "medium" ? "EmailMediumScore" : null,
      emailR.confidence === "unknown" ? "EmailUnknown" : null,
      phoneR.confidence === "low" ? "PhoneLow" : null,
      phoneR.confidence === "unknown" ? "PhoneUnknown" : null,
      phoneR.lineType === "voip" ? "PhoneVOIP" : null,
    ].filter(Boolean) as string[];
    const created = await upsertContact({
      locationId: form.locationId || "",
      email: body.email,
      phone: body.phone,
      firstName: body.firstName,
      lastName: body.lastName,
      tags,
      source: form.name,
      // @ts-ignore - our client accepts extra fields transparently
      customFields: body.customFields || [],
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
