// src/app/forms-go/[slug]/page.tsx
import { notFound } from "next/navigation";
import { getFormBySlug } from "@/lib/formsRegistry";
import LeadForm from "@/components/LeadForm";
import { prefillFromSearchParams } from "@/lib/prefill";

type Props = {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
};

export default async function Page({ params, searchParams }: Props) {
  const form = await getFormBySlug(params.slug);
  if (!form) return notFound();

  // Prefill from query
  const sp = new URLSearchParams(
    Object.entries(searchParams).flatMap(([k, v]) =>
      Array.isArray(v) ? v.map((x) => [k, x]) : v ? [[k, v]] : []
    ) as [string, string][]
  );
  const prefill = prefillFromSearchParams(sp);

  // Compose tags to mark the source
  const tagsOnSubmit = [
    "form-go",
    "ghl-native-calendar",
    `slug:${params.slug}`,
  ];

  // Hidden meta we might want to persist (optional)
  const hiddenMeta = {
    appointmentId: prefill.appointmentId,
    appointmentTime: prefill.appointmentTime,
    calendarId: prefill.calendarId,
    source: "ghl_native_redirect",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl bg-white rounded-xl border shadow-sm p-6 sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">
            {form.name || params.slug.replace(/-/g, " ")}
          </h1>
          <p className="text-sm text-gray-500">Complete your details below.</p>
        </div>

        <LeadForm
          formSlug={params.slug}
          formConfig={form}
          legal={form.legal}
          // IMPORTANT: this route does NOT render the calendar step
          // We simply render the lead form directly.
          initialValues={{
            firstName: prefill.firstName,
            lastName: prefill.lastName,
            email: prefill.email,
            phone: prefill.phone,
            country: prefill.country,
            note: prefill.note,
          }}
          tagsOnSubmit={tagsOnSubmit}
          hiddenMeta={hiddenMeta}
        />
      </div>
    </div>
  );
}
