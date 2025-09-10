import { notFound } from "next/navigation";
import LeadForm from "@/components/LeadForm";
import BookingWizard from "@/components/BookingWizard";
import { getFormBySlug } from "@/lib/formsRegistry";
import { parsePrefillFromSearchParams } from "@/lib/prefill";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params; // Next 14+ async params
  const rawSearchParams = await searchParams; // Next 14+ async searchParams

  // Convert searchParams to URLSearchParams for parsing
  const sp = new URLSearchParams(
    Object.entries(rawSearchParams).flatMap(([k, v]) =>
      Array.isArray(v) ? v.map((vv) => [k, vv]) : v ? [[k, v]] : []
    ) as [string, string][]
  );
  const prefill = parsePrefillFromSearchParams(sp);

  const form = getFormBySlug(slug);

  if (!form || !form.locationId) return notFound();

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-gray-900">{form.name}</h1>
          <p className="mt-1.5 text-sm text-gray-600">
            Please provide your contact information and we'll get back to you
            shortly.
          </p>
          <hr className="my-6 border-gray-200" />
          {/* Use BookingWizard if booking is enabled, otherwise use regular LeadForm */}
          {form.booking?.enabled ? (
            <BookingWizard
              formSlug={form.slug}
              formConfig={form as any}
              legal={(form as any).legal}
              prefill={prefill}
            />
          ) : (
            <LeadForm
              formSlug={form.slug}
              formConfig={form as any}
              legal={(form as any).legal}
              prefill={prefill}
            />
          )}
        </div>
      </div>
    </main>
  );
}
