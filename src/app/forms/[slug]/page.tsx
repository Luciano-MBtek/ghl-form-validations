import { notFound } from "next/navigation";
import LeadForm from "@/components/LeadForm";
import BookingWizard from "@/components/BookingWizard";
import { getFormBySlug } from "@/lib/formsRegistry";
import { parsePrefillFromSearchParams } from "@/lib/prefill";
import SiteHeader from "@/components/SiteHeader";
import Image from "next/image";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params; // Next 14+ async params
  const rawSearchParams = await searchParams; // Next 14+ async searchParams
  const isContactUs = slug === "form-contact-us";

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
      {!isContactUs && (
        <SiteHeader title={form.name || slug.replace(/-/g, " ")} href="/" />
      )}
      <section className="py-6 md:py-8">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 space-y-6">
          {isContactUs && (
            <section
              aria-labelledby="contact-us-intro-title"
              className="rounded-2xl border bg-white shadow-sm p-6 sm:p-8"
            >
              {/* Brand row */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Image
                    src="/MBTEK.avif"
                    alt="MBTEK"
                    width={160}
                    height={40}
                    priority
                  />
                </div>
                <span className="hidden sm:inline-flex items-center rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
                  30 Mins
                </span>
              </div>

              {/* Title + meta (mobile badge is below title) */}
              <div className="mt-4">
                <h1
                  id="contact-us-intro-title"
                  className="text-3xl font-semibold tracking-tight"
                >
                  {form.name || slug.replace(/-/g, " ")}
                </h1>
                <span className="sm:hidden inline-flex mt-2 items-center rounded-full bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
                  30 Mins
                </span>
                <p className="mt-3 text-gray-700 leading-relaxed">
                  Need a quote, have questions, or want to connect? Fill out the
                  form below, and we&apos;ll be happy to assist you.
                </p>
              </div>
            </section>
          )}
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
