import { notFound } from "next/navigation";
import LeadForm from "@/components/LeadForm";
import BookingWizard from "@/components/BookingWizard";
import { getFormBySlug } from "@/lib/formsRegistry";
import { parsePrefillFromSearchParams } from "@/lib/prefill";
import SiteHeader from "@/components/SiteHeader";

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
    <main className="min-h-screen bg-slate-50">
      <SiteHeader title={form.name || slug.replace(/-/g, " ")} href="/" />
      <section className="py-6 md:py-8">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-2xl border shadow-sm p-6 sm:p-8">
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
      </section>
    </main>
  );
}
